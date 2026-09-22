import { cache } from "react";
import { getNFLState } from "@/lib/sleeper";
import { PAGE_REVALIDATE_SECONDS } from "@/lib/cache";
import { db } from "@/lib/db";
import { rethrowUnlessTolerable } from "@/lib/db-guard";
import { matchups, nflGames, seasons } from "@/lib/db/schema";
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

/** A parsed NFL_STATE_OVERRIDE. */
export interface NflStateOverride {
  /**
   * The simulated state. When `nextWeek` is true, `state.week` is only a
   * placeholder (1): getNflState resolves the real week at request time.
   */
  state: NflState;
  /** ":force": treat the week-one lead window as active. */
  forceLeadWindow: boolean;
  /** ":recap": hold the between-weeks post-week recap window open. */
  forceRecapWindow: boolean;
  /** Week token "next": resolve to the earliest all-scheduled week. */
  nextWeek: boolean;
}

/**
 * Preview/dev-only NFL state override, so a Vercel preview deployment (or a
 * pinned Playwright dev server) can simulate a season phase without waiting
 * for the real calendar. Format:
 *
 *   "<type>:<week|next>[:<season>][:force][:recap]"
 *
 * e.g. NFL_STATE_OVERRIDE=regular:1, regular:1:2026:force, regular:next:force.
 *
 * - <week> is 1 to 22; anything outside that range is rejected rather than
 *   clamped (week 0 used to render an empty regular-season hub that looked
 *   like a data bug).
 * - "next" resolves AT REQUEST TIME to the earliest week of that season whose
 *   matchups are all still "scheduled" (resolveNextScheduledWeek), i.e. the
 *   between-weeks slate. A fixed number drifts: the e2e projects were pinned
 *   to regular:1 and regular:2, which stopped reaching the between-weeks and
 *   post-week states the moment those weeks went final in the live DB.
 * - ":force" also treats the week-one lead window as active (see
 *   isWeekOneLeadWindowActive), so a preview can show the regular-season hub
 *   before the real calendar reaches 7 days before the earliest week-1 game
 *   (KICKOFF_LEAD_DAYS).
 * - ":recap" holds the post-week recap window open (isRecapWindowForced), so
 *   the recap leads the between-weeks hub whatever the weekday.
 *
 * Ignored in production (VERCEL_ENV === "production") and when unset or
 * malformed, so it can never lie on the live site.
 */
export function parseNflStateOverrideValue(
  raw: string | null | undefined
): NflStateOverride | null {
  if (!raw) return null;

  const m = /^(pre|regular|post|off):(\d{1,2}|next)(?::(\d{4}))?((?::(?:force|recap))*)$/.exec(
    raw.trim()
  );
  if (!m) return null;

  const nextWeek = m[2] === "next";
  // Reject rather than clamp, so a typo falls back to the real calendar instead
  // of quietly simulating a different week.
  const week = nextWeek ? 1 : Number(m[2]);
  if (week < 1 || week > 22) return null;

  const flags = new Set(m[4].split(":").filter(Boolean));

  return {
    state: {
      seasonType: m[1] as NflSeasonType,
      week,
      season: m[3] ?? String(new Date().getFullYear()),
    },
    forceLeadWindow: flags.has("force"),
    forceRecapWindow: flags.has("recap"),
    nextWeek,
  };
}

/** Env gating around parseNflStateOverrideValue. Never active in production. */
function parseNflStateOverride(): NflStateOverride | null {
  if (process.env.VERCEL_ENV === "production") return null;
  return parseNflStateOverrideValue(process.env.NFL_STATE_OVERRIDE);
}

/**
 * True when a ":recap" NFL_STATE_OVERRIDE holds the post-week recap window
 * open (preview/dev only; always false in production).
 */
export function isRecapWindowForced(): boolean {
  return parseNflStateOverride()?.forceRecapWindow ?? false;
}

/**
 * The override's "next" week: the earliest week whose matchups are ALL still
 * "scheduled" (a null status counts as scheduled, the column's default).
 * Pure; `weeks` is one row per week with whether every matchup in it is
 * scheduled. Null when no week qualifies (the season is over).
 */
export function resolveNextScheduledWeek(
  weeks: { week: number; allScheduled: boolean }[]
): number | null {
  const open = weeks.filter((w) => w.allScheduled).map((w) => w.week);
  return open.length > 0 ? Math.min(...open) : null;
}

/** Reads the per-week "all scheduled" rollup for a season year. */
async function getNextScheduledWeek(seasonYear: number): Promise<number | null> {
  const rows = await db
    .select({
      week: matchups.week,
      allScheduled: sql<boolean>`bool_and(coalesce(${matchups.status}, 'scheduled') = 'scheduled')`,
    })
    .from(matchups)
    .innerJoin(seasons, eq(seasons.id, matchups.seasonId))
    .where(eq(seasons.seasonYear, seasonYear))
    .groupBy(matchups.week);
  return resolveNextScheduledWeek(rows.map((r) => ({ week: r.week, allScheduled: Boolean(r.allScheduled) })));
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
 * True once the site should present as "kickoff week": from 7 days before
 * the earliest week-1 game onward (KICKOFF_LEAD_DAYS, isWithinWeekOneLeadWindow),
 * or immediately
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
  if (override && !override.nextWeek) return override.state;
  if (override?.nextWeek) {
    // Resolved per request against the real matchups, so the pinned e2e
    // servers always land on the live between-weeks slate. No qualifying
    // week (season over) falls through to the real calendar below.
    const week = await getNextScheduledWeek(Number(override.state.season));
    if (week != null) return { ...override.state, week };
  }

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
    // to opening night, but from 7 days before the earliest week-1 game
    // (KICKOFF_LEAD_DAYS) the site should already present as regular season,
    // week 1 (regular-season hub,
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
  } catch (e) {
    // The only realistic throw source here is the DB read behind
    // isWeekOneLeadWindowActive above: a Sleeper outage comes back as a result
    // object from fetchSleeper, never as an exception. Swallowing that read
    // would undo the guard it just gained, turning a Postgres outage into
    // getNflState() === null and letting the book/players/roster paths
    // ISR-cache degraded output.
    rethrowUnlessTolerable(e);
    console.error("[nfl-state] Unexpected error fetching NFL state");
    return null;
  }
});

/**
 * Returns the earliest week-1 game date (YYYY-MM-DD text) for a season year,
 * or null when nfl_games has no week-1 rows for it. Feeds the season-segment
 * resolver's 7-days-before-kickoff rule (KICKOFF_LEAD_DAYS).
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
