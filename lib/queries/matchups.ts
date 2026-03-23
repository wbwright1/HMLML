import { db } from "@/lib/db";
import {
  matchups,
  franchises,
  franchiseSeasons,
  seasons,
} from "@/lib/db/schema";
import { eq, and, desc, gte } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatchupTeam {
  franchiseId: string;
  franchiseName: string;
  franchiseSlug: string;
  franchiseAbbreviation: string | null;
  franchiseBrandingColor: string | null;
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
function pairMatchupRows(
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

    const [a, b] = pair;

    const toTeam = (r: (typeof rows)[number]): MatchupTeam => ({
      franchiseId: r.franchiseId,
      franchiseName: r.franchiseName,
      franchiseSlug: r.franchiseSlug,
      franchiseAbbreviation: r.franchiseAbbreviation,
      franchiseBrandingColor: r.franchiseBrandingColor,
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
// Playoff result helpers
// ---------------------------------------------------------------------------

/**
 * Returns a map of franchiseId → playoffResult for a given season.
 * Used to separate winners bracket from losers/consolation bracket.
 */
export async function getFranchisePlayoffResults(
  seasonId: number
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  try {
    const rows = await db
      .select({
        franchiseId: franchiseSeasons.franchiseId,
        playoffResult: franchiseSeasons.playoffResult,
      })
      .from(franchiseSeasons)
      .where(eq(franchiseSeasons.seasonId, seasonId));

    for (const row of rows) {
      if (row.playoffResult) {
        results.set(row.franchiseId, row.playoffResult);
      }
    }
  } catch (e) {
    console.error("[matchups] getFranchisePlayoffResults error:", e);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Returns paired matchups for a specific season and week,
 * joined with franchise info.
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
      })
      .from(matchups)
      .innerJoin(franchises, eq(matchups.franchiseId, franchises.id))
      .where(and(eq(matchups.seasonId, seasonId), eq(matchups.week, week)));

    return pairMatchupRows(rows);
  } catch (e) {
    console.error("[matchups] getMatchupsByWeek error:", e);
    return [];
  }
}

/**
 * Returns the current week's matchups by finding the latest season
 * and determining the current week.
 * Returns null if no active season is found.
 */
export async function getCurrentWeekMatchups(): Promise<{
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

    if (!latestSeason) return null;

    // Determine current week: find the highest week with matchup data
    const [latestMatchup] = await db
      .select({ week: matchups.week })
      .from(matchups)
      .where(eq(matchups.seasonId, latestSeason.id))
      .orderBy(desc(matchups.week))
      .limit(1);

    const currentWeek = latestMatchup?.week ?? 1;

    const weekMatchups = await getMatchupsByWeek(latestSeason.id, currentWeek);

    return {
      matchups: weekMatchups,
      seasonYear: latestSeason.seasonYear,
      week: currentWeek,
      seasonId: latestSeason.id,
    };
  } catch (e) {
    console.error("[matchups] getCurrentWeekMatchups error:", e);
    return null;
  }
}

/**
 * Returns playoff matchups for a season, grouped by week.
 *
 * Uses two strategies:
 * 1. Primary: matchups with `isPlayoff = true`
 * 2. Fallback: matchups from weeks >= `playoffWeekStart`
 *
 * The fallback handles cases where the `isPlayoff` flag was never set
 * (e.g. sync timing, legacy data) but the season has a known playoff start week.
 */
export async function getPlayoffMatchups(
  seasonId: number,
  playoffWeekStart?: number | null
): Promise<Map<number, PairedMatchup[]>> {
  const selectFields = {
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
  };

  try {
    // Primary: query by isPlayoff flag
    let rows = await db
      .select(selectFields)
      .from(matchups)
      .innerJoin(franchises, eq(matchups.franchiseId, franchises.id))
      .where(
        and(eq(matchups.seasonId, seasonId), eq(matchups.isPlayoff, true))
      );

    // Fallback: if no rows found and we have a playoffWeekStart, query by week
    if (rows.length === 0 && playoffWeekStart && playoffWeekStart > 0) {
      rows = await db
        .select(selectFields)
        .from(matchups)
        .innerJoin(franchises, eq(matchups.franchiseId, franchises.id))
        .where(
          and(
            eq(matchups.seasonId, seasonId),
            gte(matchups.week, playoffWeekStart)
          )
        );
    }

    // Group rows by week, then pair within each week
    const byWeek = new Map<number, typeof rows>();
    for (const row of rows) {
      if (!byWeek.has(row.week)) {
        byWeek.set(row.week, []);
      }
      byWeek.get(row.week)!.push(row);
    }

    const result = new Map<number, PairedMatchup[]>();
    for (const [week, weekRows] of byWeek) {
      result.set(week, pairMatchupRows(weekRows));
    }

    return result;
  } catch (e) {
    console.error("[matchups] getPlayoffMatchups error:", e);
    return new Map();
  }
}

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
 */
export async function getLatestSeason() {
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
  } catch {
    return null;
  }
}

/**
 * Returns the season record for a given year.
 */
export async function getSeasonByYearSimple(year: number) {
  try {
    const [season] = await db
      .select({
        id: seasons.id,
        seasonYear: seasons.seasonYear,
        status: seasons.status,
        playoffWeekStart: seasons.playoffWeekStart,
      })
      .from(seasons)
      .where(eq(seasons.seasonYear, year))
      .limit(1);

    return season ?? null;
  } catch {
    return null;
  }
}
