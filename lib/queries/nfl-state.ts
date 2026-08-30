import { cache } from "react";
import { getNFLState } from "@/lib/sleeper";
import { PAGE_REVALIDATE_SECONDS } from "@/lib/cache";
import { db } from "@/lib/db";
import { rethrowUnlessTolerable } from "@/lib/db-guard";
import { nflGames } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  isWithinWeekOneLeadWindow,
  resolveSeasonSegment,
  type SeasonSegment,
} from "@/lib/season-segment";

export type NflSeasonType = "pre" | "regular" | "post" | "off";

export interface NflState {
  seasonType: NflSeasonType;
  week: number;
  season: string;
}

/**
 * Preview/dev-only NFL state override, so a Vercel preview deployment can
 * simulate a season phase (e.g. "regular season, week 1, nothing played yet")
 * without waiting for the real calendar. Format:
 * "<type>:<week>[:<season>][:force]", e.g. NFL_STATE_OVERRIDE=regular:1 or
 * regular:1:2026:force. The trailing ":force" also treats the week-one lead
 * window as active (see isWeekOneLeadWindowActive), so a preview can show the
 * regular-season hub before the real calendar reaches the Sunday before
 * kickoff. The week must be 1 to 22; anything outside that range is rejected
 * (week 0 used to render an empty regular-season hub that looked like a data
 * bug). Ignored in production (VERCEL_ENV === "production") and when unset
 * or malformed, so it can never lie on the live site.
 */
export function parseNflStateOverrideValue(
  raw: string | null | undefined
): { state: NflState; forceLeadWindow: boolean } | null {
  if (!raw) return null;

  const m = /^(pre|regular|post|off):(\d{1,2})(?::(\d{4}))?(?::(force))?$/.exec(raw.trim());
  if (!m) return null;

  // Reject rather than clamp, so a typo falls back to the real calendar instead
  // of quietly simulating a different week.
  const week = Number(m[2]);
  if (week < 1 || week > 22) return null;

  return {
    state: {
      seasonType: m[1] as NflSeasonType,
      week,
      season: m[3] ?? String(new Date().getFullYear()),
    },
    forceLeadWindow: m[4] === "force",
  };
}

/** Env gating around parseNflStateOverrideValue. Never active in production. */
function parseNflStateOverride(): { state: NflState; forceLeadWindow: boolean } | null {
  if (process.env.VERCEL_ENV === "production") return null;
  return parseNflStateOverrideValue(process.env.NFL_STATE_OVERRIDE);
}

/**
 * Fetches the current NFL state from the Sleeper API.
 * Returns null if the API call fails or validation fails.
 *
 * Wrapped in React `cache()` so the nav and the page dedupe to a single call
 * per request (both resolve the same seasonal state).
 *
 * This is the page render path, so it pins the fetch cache to the same window
 * the pages use (lib/cache.ts). A page's ISR window is capped by the shortest
 * fetch-cache window inside its render, and the nav calls this from the root
 * layout, so the default 5 minute window would hold every page on the site to a
 * 5 minute revalidate. The sync jobs and the live poller still read the fresher
 * default; a week rollover shows up here within the hour, which matches how
 * stale the surrounding page content already is.
 */
/**
 * True once the site should present as "kickoff week": from the Sunday before
 * the earliest week-1 game onward (isWithinWeekOneLeadWindow), or immediately
 * when a ":force" NFL_STATE_OVERRIDE is active (preview/dev only). Shared by
 * the hub and the nav so they flip to the regular-season view on the same
 * request. React-cache()'d per request, so a rejection is shared by every
 * caller in that request. In production a DB failure now THROWS rather than
 * reading as "not yet" (it would ISR-cache the preseason hub for an hour); in
 * local dev and the build prerender pass it still degrades to "not yet".
 * Callers that must not throw (the nav, the history/seasons badges) keep their
 * own catch.
 */
export const isWeekOneLeadWindowActive = cache(async function isWeekOneLeadWindowActive(
  seasonYear: number
): Promise<boolean> {
  if (parseNflStateOverride()?.forceLeadWindow) return true;
  const week1Date = await getWeek1EarliestGameDate(seasonYear);
  return isWithinWeekOneLeadWindow(week1Date, new Date());
});

export const getNflState = cache(async function getNflState(): Promise<NflState | null> {
  const override = parseNflStateOverride();
  if (override) return override.state;

  try {
    const result = await getNFLState(PAGE_REVALIDATE_SECONDS);

    if ("error" in result) {
      console.error("[nfl-state] Failed to fetch NFL state:", result.error.message);
      return null;
    }

    const { season_type, week, season } = result.data;

    // Normalize season_type to our known values
    const validTypes: NflSeasonType[] = ["pre", "regular", "post", "off"];
    const seasonType: NflSeasonType = validTypes.includes(season_type as NflSeasonType)
      ? (season_type as NflSeasonType)
      : "off";

    // Kickoff-week normalization: Sleeper's season_type can lag "pre" right up
    // to opening night, but from the Sunday before the week-1 kickoff the site
    // should already present as regular season, week 1 (regular-season hub,
    // week-1 matchup slate, in-season player tables). Only "pre" is promoted;
    // post/off are real signals we never rewrite.
    if (seasonType === "pre" && (await isWeekOneLeadWindowActive(Number(season)))) {
      return { seasonType: "regular", week: 1, season };
    }

    return {
      seasonType,
      week,
      season,
    };
  } catch {
    console.error("[nfl-state] Unexpected error fetching NFL state");
    return null;
  }
});

/**
 * Returns the earliest week-1 game date (YYYY-MM-DD text) for a season year,
 * or null when nfl_games has no week-1 rows for it. Feeds the season-segment
 * resolver's 5-day-before-kickoff rule.
 */
export async function getWeek1EarliestGameDate(
  seasonYear: number
): Promise<string | null> {
  try {
    const [row] = await db
      .select({ earliest: sql<string | null>`min(${nflGames.gameDate})` })
      .from(nflGames)
      .where(and(eq(nflGames.seasonYear, seasonYear), eq(nflGames.week, 1)));

    return row?.earliest ?? null;
  } catch (e) {
    // A missing week-1 date silently demotes the whole site to the preseason
    // hub, so this must not be swallowed in production (see lib/db-guard.ts).
    // Local dev and the build prerender pass still degrade to null.
    rethrowUnlessTolerable(e);
    return null;
  }
}

/**
 * Orchestrates the I/O around lib/season-segment.ts's pure `resolveSeasonSegment`:
 * fetches the week-1 earliest game date for `latestSeason`'s year (when present)
 * and resolves the three-segment season model from it plus the season status
 * and NFL state. Shared by app/players/page.tsx and the roster page so both
 * lead with the same column for the same live data.
 */
export async function resolveLiveSeasonSegment(
  latestSeason: { seasonYear: number; status: string | null } | null,
  nflState: { seasonType: string | null } | null
): Promise<SeasonSegment> {
  const week1EarliestGameDate = latestSeason
    ? await getWeek1EarliestGameDate(latestSeason.seasonYear)
    : null;

  return resolveSeasonSegment({
    seasonStatus: latestSeason?.status ?? null,
    seasonType: nflState?.seasonType ?? null,
    week1EarliestGameDate,
    now: new Date(),
  });
}
