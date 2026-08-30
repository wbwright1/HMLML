import { cache } from "react";
import { cachedQuery } from "@/lib/cache";
import { rethrowUnlessTolerable } from "@/lib/db-guard";
import { db } from "@/lib/db";
import {
  matchups,
  franchises,
  franchiseSeasons,
  seasons,
} from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getNflState } from "@/lib/queries/nfl-state";
import { getLatestAvatarUrls } from "@/lib/queries/franchise-avatars";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatchupTeam {
  franchiseId: string;
  franchiseName: string;
  franchiseSlug: string;
  franchiseAbbreviation: string | null;
  franchiseBrandingColor: string | null;
  avatarUrl: string | null;
  rosterId: string;
  points: number;
  isWinner: boolean | null;
}

export interface PairedMatchup {
  matchupId: number;
  week: number;
  seasonId: number;
  isPlayoff: boolean;
  status: string;
  homeTeam: MatchupTeam;
  awayTeam: MatchupTeam;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Takes raw matchup rows (two per matchup_id) and pairs them into
 * PairedMatchup objects with homeTeam and awayTeam.
 */
export function pairMatchupRows(
  rows: {
    id: number;
    matchupId: number;
    week: number;
    seasonId: number;
    franchiseId: string;
    rosterId: string;
    points: number | null;
    isWinner: boolean | null;
    isPlayoff: boolean | null;
    status: string | null;
    franchiseName: string;
    franchiseSlug: string;
    franchiseAbbreviation: string | null;
    franchiseBrandingColor: string | null;
    avatarUrl: string | null;
  }[]
): PairedMatchup[] {
  const grouped = new Map<
    number,
    typeof rows
  >();

  for (const row of rows) {
    const key = row.matchupId;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(row);
  }

  const paired: PairedMatchup[] = [];

  for (const [matchupId, pair] of grouped) {
    if (pair.length < 2) continue; // Incomplete matchup, skip

    if (pair.length > 2) {
      console.error(
        `[matchups] pairMatchupRows: matchupId ${matchupId} has ${pair.length} rows (expected 2); using the first two by rosterId`
      );
    }

    // Sort by rosterId so home/away assignment is deterministic regardless
    // of arbitrary DB row order (and, if a data bug ever produces more than
    // 2 rows for one matchup_id, the extras are dropped rather than
    // silently changing which two get paired from one call to the next).
    const [a, b] = [...pair].sort((x, y) => x.rosterId.localeCompare(y.rosterId));

    const toTeam = (r: (typeof rows)[number]): MatchupTeam => ({
      franchiseId: r.franchiseId,
      franchiseName: r.franchiseName,
      franchiseSlug: r.franchiseSlug,
      franchiseAbbreviation: r.franchiseAbbreviation,
      franchiseBrandingColor: r.franchiseBrandingColor,
      avatarUrl: r.avatarUrl,
      rosterId: r.rosterId,
      points: r.points ?? 0,
      isWinner: r.isWinner,
    });

    paired.push({
      matchupId,
      week: a.week,
      seasonId: a.seasonId,
      isPlayoff: a.isPlayoff ?? false,
      status: a.status ?? "scheduled",
      homeTeam: toTeam(a),
      awayTeam: toTeam(b),
    });
  }

  // Sort by matchupId for consistent ordering
  paired.sort((a, b) => a.matchupId - b.matchupId);

  return paired;
}


// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Returns paired matchups for a specific season and week,
 * joined with franchise info.
 *
 * A week with no rows is a real outcome (no matchups scheduled or synced yet)
 * and returns an empty array. A rejected query is not: it goes through
 * rethrowUnlessTolerable so a DB outage reaches the error boundary instead of
 * being ISR-cached as a successful, empty week. Do not conflate the two.
 */
export async function getMatchupsByWeek(
  seasonId: number,
  week: number
): Promise<PairedMatchup[]> {
  try {
    const rows = await db
      .select({
        id: matchups.id,
        matchupId: matchups.matchupId,
        week: matchups.week,
        seasonId: matchups.seasonId,
        franchiseId: matchups.franchiseId,
        rosterId: matchups.rosterId,
        points: matchups.points,
        isWinner: matchups.isWinner,
        isPlayoff: matchups.isPlayoff,
        status: matchups.status,
        franchiseName: franchises.name,
        franchiseSlug: franchises.slug,
        franchiseAbbreviation: franchises.abbreviation,
        franchiseBrandingColor: franchises.brandingColor,
        avatarUrl: franchiseSeasons.avatarUrl,
      })
      .from(matchups)
      .innerJoin(franchises, eq(matchups.franchiseId, franchises.id))
      .leftJoin(
        franchiseSeasons,
        and(
          eq(franchiseSeasons.franchiseId, matchups.franchiseId),
          eq(franchiseSeasons.seasonId, matchups.seasonId)
        )
      )
      .where(and(eq(matchups.seasonId, seasonId), eq(matchups.week, week)));

    // Past seasons only have avatarUrl populated on their own franchise_seasons
    // row for 2026+; coalesce to each franchise's latest known avatar so older
    // weeks still show a real crest instead of the monogram fallback. Applied
    // before pairing so pairMatchupRows' input shape is unchanged.
    const fallbackAvatars = await getLatestAvatarUrls(
      rows.map((r) => r.franchiseId)
    );
    const rowsWithAvatars = rows.map((row) => ({
      ...row,
      avatarUrl: row.avatarUrl ?? fallbackAvatars.get(row.franchiseId) ?? null,
    }));

    return pairMatchupRows(rowsWithAvatars);
  } catch (e) {
    console.error("[matchups] getMatchupsByWeek error:", e);
    rethrowUnlessTolerable(e);
    return [];
  }
}

/**
 * Returns the current week's matchups by finding the latest season
 * and determining the current week.
 * Returns null if no active season is found.
 *
 * Wrapped in React `cache()` so the nav and the page share one call per request.
 */
export const getCurrentWeekMatchups = cache(async function getCurrentWeekMatchups(): Promise<{
  matchups: PairedMatchup[];
  seasonYear: number;
  week: number;
  seasonId: number;
} | null> {
  try {
    // Get the latest season (highest season_year)
    const [latestSeason] = await db
      .select()
      .from(seasons)
      .orderBy(desc(seasons.seasonYear))
      .limit(1);

    // No seasons synced yet is a real outcome, not a failure: return null
    // without throwing. Only a rejected query reaches the catch below.
    if (!latestSeason) return null;

    // Determine current week. Since the hourly sync now writes the full
    // regular-season schedule ahead of time (Path A: future weeks land as
    // "scheduled" rows), the highest synced week is no longer a reliable
    // stand-in for "now" — it's usually the last regular-season week. Prefer
    // the real NFL week from Sleeper's state endpoint, falling back to the
    // old "highest week with matchup data" heuristic only if that lookup
    // fails or doesn't match this season.
    // getNflState now throws on a DB failure (#254), which is what we want:
    // it means the catch below rethrows rather than quietly guessing a week.
    // A Sleeper outage still returns null (fetchSleeper resolves an { error }
    // result instead of rejecting), so the "highest synced week" fallback
    // underneath still covers the API-outage case it was written for.
    let currentWeek: number | null = null;
    const nflState = await getNflState();
    if (nflState && String(latestSeason.seasonYear) === nflState.season) {
      currentWeek = nflState.week;
    }

    if (currentWeek == null) {
      const [latestMatchup] = await db
        .select({ week: matchups.week })
        .from(matchups)
        .where(eq(matchups.seasonId, latestSeason.id))
        .orderBy(desc(matchups.week))
        .limit(1);

      currentWeek = latestMatchup?.week ?? 1;
    }

    const weekMatchups = await getMatchupsByWeek(latestSeason.id, currentWeek);

    return {
      matchups: weekMatchups,
      seasonYear: latestSeason.seasonYear,
      week: currentWeek,
      seasonId: latestSeason.id,
    };
  } catch (e) {
    console.error("[matchups] getCurrentWeekMatchups error:", e);
    rethrowUnlessTolerable(e);
    return null;
  }
});


/**
 * Returns the highest week number that has matchup data for a season.
 */
export async function getMaxWeekForSeason(seasonId: number): Promise<number> {
  try {
    const [result] = await db
      .select({ week: matchups.week })
      .from(matchups)
      .where(eq(matchups.seasonId, seasonId))
      .orderBy(desc(matchups.week))
      .limit(1);

    return result?.week ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Returns the latest season's ID and year.
 *
 * Wrapped in React `cache()` so the nav and the page share one call per request.
 */
const getLatestSeasonUncached = cache(async function getLatestSeason() {
  try {
    const [latest] = await db
      .select({
        id: seasons.id,
        seasonYear: seasons.seasonYear,
        status: seasons.status,
        playoffWeekStart: seasons.playoffWeekStart,
      })
      .from(seasons)
      .orderBy(desc(seasons.seasonYear))
      .limit(1);

    return latest ?? null;
  } catch (e) {
    rethrowUnlessTolerable(e);
    return null;
  }
});

/**
 * Returns the season record for a given year.
 */
async function getSeasonByYearSimpleUncached(year: number) {
  try {
    const [season] = await db
      .select({
        id: seasons.id,
        seasonYear: seasons.seasonYear,
        status: seasons.status,
        playoffWeekStart: seasons.playoffWeekStart,
        totalRosters: seasons.totalRosters,
      })
      .from(seasons)
      .where(eq(seasons.seasonYear, year))
      .limit(1);

    return season ?? null;
  } catch (e) {
    rethrowUnlessTolerable(e);
    return null;
  }
}

/** Cached wrapper (#209): see lib/cache.ts. Cleared by revalidateSite(). */
export const getLatestSeason = cachedQuery(["latest-season"], getLatestSeasonUncached);

/** Cached wrapper (#209): see lib/cache.ts. Cleared by revalidateSite(). */
export const getSeasonByYearSimple = cachedQuery(["season-by-year"], getSeasonByYearSimpleUncached);
