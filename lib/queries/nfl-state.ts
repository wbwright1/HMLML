import { cache } from "react";
import { getNFLState } from "@/lib/sleeper";
import { PAGE_REVALIDATE_SECONDS } from "@/lib/cache";
import { db } from "@/lib/db";
import { nflGames } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { resolveSeasonSegment, type SeasonSegment } from "@/lib/season-segment";

export type NflSeasonType = "pre" | "regular" | "post" | "off";

export interface NflState {
  seasonType: NflSeasonType;
  week: number;
  season: string;
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
export const getNflState = cache(async function getNflState(): Promise<NflState | null> {
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
  } catch {
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
