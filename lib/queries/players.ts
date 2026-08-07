import { db } from "@/lib/db";
import {
  players,
  rosterPlayers,
  franchises,
  franchiseSeasons,
  seasons,
} from "@/lib/db/schema";
import { eq, like, desc, and, sql, or, isNotNull, gt, inArray } from "drizzle-orm";

export type RosteredPlayer = {
  id: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  nflTeam: string | null;
  status: string | null;
  injuryStatus: string | null;
  age: number | null;
  yearsExp: number | null;
  ownerFranchiseId: string | null;
  ownerFranchiseName: string | null;
  ownerFranchiseSlug: string | null;
  ownerFranchiseAbbrev: string | null;
  ownerFranchiseBrandingColor: string | null;
  ownerFranchiseAvatarUrl: string | null;
  pointsPpr: number | null;
  statsSeason: number | null;
  projPointsPpr: number | null;
  projSeason: number | null;
};

/**
 * Fetch ALL rostered players for the latest season.
 * Joins with players for bio data and franchises for HMLML team info.
 * Orders by position group (QB→RB→WR→TE→K→DEF) then name.
 */
export async function getAllRosteredPlayers(): Promise<RosteredPlayer[]> {
  try {
    const [latestSeason] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .orderBy(desc(seasons.seasonYear))
      .limit(1);

    if (!latestSeason) return [];

    const rows = await db
      .select({
        id: players.id,
        fullName: players.fullName,
        firstName: players.firstName,
        lastName: players.lastName,
        position: players.position,
        nflTeam: players.nflTeam,
        status: players.status,
        injuryStatus: players.injuryStatus,
        age: players.age,
        yearsExp: players.yearsExp,
        ownerFranchiseId: franchises.id,
        ownerFranchiseName: franchises.name,
        ownerFranchiseSlug: franchises.slug,
        pointsPpr: players.pointsPpr,
        statsSeason: players.statsSeason,
        projPointsPpr: players.projPointsPpr,
        projSeason: players.projSeason,
        rosterPlayerId: rosterPlayers.playerId,
      })
      // leftJoin players, not innerJoin: the hourly roster sync can add a
      // player before the daily players sync has written their row, and an
      // innerJoin would silently drop that roster spot (mirrors the pattern
      // in lib/queries/drafts.ts).
      .from(rosterPlayers)
      .leftJoin(players, eq(rosterPlayers.playerId, players.id))
      .innerJoin(franchises, eq(rosterPlayers.franchiseId, franchises.id))
      .where(eq(rosterPlayers.seasonId, latestSeason.id))
      .orderBy(
        sql`CASE ${players.position}
          WHEN 'QB' THEN 0
          WHEN 'RB' THEN 1
          WHEN 'WR' THEN 2
          WHEN 'TE' THEN 3
          WHEN 'K'  THEN 4
          WHEN 'DEF' THEN 5
          ELSE 6
        END`,
        players.fullName
      );

    return rows.map((r) => ({
      ...r,
      id: r.id ?? r.rosterPlayerId,
      fullName: r.fullName ?? `Unknown Player (${r.rosterPlayerId})`,
      position: r.position ?? "N/A",
      ownerFranchiseAbbrev: null,
      ownerFranchiseBrandingColor: null,
      ownerFranchiseAvatarUrl: null,
    }));
  } catch {
    return [];
  }
}

/**
 * Sleeper's `search_full_name` is lowercase and spaceless ("dariuscooper",
 * "ajbrown"), so the query has to be collapsed the same way before a LIKE
 * match. Anything that isn't a-z goes: spaces, periods, apostrophes, hyphens,
 * digits. Returns "" for symbol-only input, which callers treat as no-op.
 */
export function normalizePlayerSearchQuery(query: string): string {
  return query.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Relevance tier ordering shared by both searchPlayers branches:
 * 1. fantasy position with real production (points or projections)
 * 2. fantasy position, active, on an NFL team (rookies mid-preseason)
 * 3. fantasy position, active free agent
 * 4. everything else (OL/IDP, inactive)
 * Tiebreak: the larger of points/projected points (not the same unit, but
 * within a tier "the bigger of what we know about this player" is a fine
 * single-expression signal), then full_name.
 */
const RELEVANCE_TIER_SQL = sql`CASE
  WHEN ${players.position} IN ('QB','RB','WR','TE','K')
    AND (COALESCE(${players.pointsPpr}, 0) > 0 OR COALESCE(${players.projPointsPpr}, 0) > 0)
    THEN 0
  WHEN ${players.position} IN ('QB','RB','WR','TE','K')
    AND ${players.status} = 'Active' AND ${players.nflTeam} IS NOT NULL
    THEN 1
  WHEN ${players.position} IN ('QB','RB','WR','TE','K')
    AND ${players.status} = 'Active'
    THEN 2
  ELSE 3
END`;

const RELEVANCE_TIEBREAK_SQL = sql`GREATEST(COALESCE(${players.pointsPpr}, 0), COALESCE(${players.projPointsPpr}, 0)) DESC`;

export type PlayerSearchResult = {
  id: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  nflTeam: string | null;
  status: string | null;
  injuryStatus: string | null;
  age: number | null;
  yearsExp: number | null;
  ownerFranchiseId: string | null;
  ownerFranchiseName: string | null;
  ownerFranchiseSlug: string | null;
};

/**
 * Search players by name using the search_full_name column (lowercase LIKE match).
 * Returns player info + current roster owner (joined via roster_players -> franchises
 * for the latest season). Limited to 50 results.
 */
export async function searchPlayers(
  query: string
): Promise<PlayerSearchResult[]> {
  try {
    const normalizedQuery = normalizePlayerSearchQuery(query);

    if (!normalizedQuery) return [];

    // Find the latest season to join roster ownership
    const [latestSeason] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .orderBy(desc(seasons.seasonYear))
      .limit(1);

    const searchPattern = `%${normalizedQuery}%`;

    if (!latestSeason) {
      // No seasons loaded — return players without ownership info
      const rows = await db
        .select({
          id: players.id,
          fullName: players.fullName,
          firstName: players.firstName,
          lastName: players.lastName,
          position: players.position,
          nflTeam: players.nflTeam,
          status: players.status,
          injuryStatus: players.injuryStatus,
          age: players.age,
          yearsExp: players.yearsExp,
        })
        .from(players)
        .where(like(players.searchFullName, searchPattern))
        .orderBy(RELEVANCE_TIER_SQL, RELEVANCE_TIEBREAK_SQL, players.fullName)
        .limit(50);

      return rows.map((r) => ({
        ...r,
        ownerFranchiseId: null,
        ownerFranchiseName: null,
        ownerFranchiseSlug: null,
      }));
    }

    const rows = await db
      .select({
        id: players.id,
        fullName: players.fullName,
        firstName: players.firstName,
        lastName: players.lastName,
        position: players.position,
        nflTeam: players.nflTeam,
        status: players.status,
        injuryStatus: players.injuryStatus,
        age: players.age,
        yearsExp: players.yearsExp,
        ownerFranchiseId: franchises.id,
        ownerFranchiseName: franchises.name,
        ownerFranchiseSlug: franchises.slug,
      })
      .from(players)
      .leftJoin(
        rosterPlayers,
        and(
          eq(rosterPlayers.playerId, players.id),
          eq(rosterPlayers.seasonId, latestSeason.id)
        )
      )
      .leftJoin(franchises, eq(rosterPlayers.franchiseId, franchises.id))
      .where(like(players.searchFullName, searchPattern))
      .orderBy(
        // Prioritize rostered players first, then relevance tier, then the
        // within-tier tiebreak, then alphabetical as the stable final key.
        sql`CASE WHEN ${franchises.id} IS NOT NULL THEN 0 ELSE 1 END`,
        RELEVANCE_TIER_SQL,
        RELEVANCE_TIEBREAK_SQL,
        players.fullName
      )
      .limit(50);

    return rows;
  } catch {
    return [];
  }
}

/**
 * Fetch ALL players who have fantasy points > 0 OR are on a roster.
 * Includes roster ownership info (null for free agents).
 * Default order: pointsPpr DESC (highest scorers first).
 */
export async function getAllPlayersWithStats(): Promise<RosteredPlayer[]> {
  try {
    const [latestSeason] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .orderBy(desc(seasons.seasonYear))
      .limit(1);

    if (!latestSeason) return [];

    const rows = await db
      .select({
        id: players.id,
        fullName: players.fullName,
        firstName: players.firstName,
        lastName: players.lastName,
        position: players.position,
        nflTeam: players.nflTeam,
        status: players.status,
        injuryStatus: players.injuryStatus,
        age: players.age,
        yearsExp: players.yearsExp,
        ownerFranchiseId: franchises.id,
        ownerFranchiseName: franchises.name,
        ownerFranchiseSlug: franchises.slug,
        ownerFranchiseAbbrev: franchises.abbreviation,
        ownerFranchiseBrandingColor: franchises.brandingColor,
        ownerFranchiseAvatarUrl: franchiseSeasons.avatarUrl,
        pointsPpr: players.pointsPpr,
        statsSeason: players.statsSeason,
        projPointsPpr: players.projPointsPpr,
        projSeason: players.projSeason,
      })
      .from(players)
      .leftJoin(
        rosterPlayers,
        and(
          eq(rosterPlayers.playerId, players.id),
          eq(rosterPlayers.seasonId, latestSeason.id)
        )
      )
      .leftJoin(franchises, eq(rosterPlayers.franchiseId, franchises.id))
      .leftJoin(
        franchiseSeasons,
        and(
          eq(franchiseSeasons.franchiseId, franchises.id),
          eq(franchiseSeasons.seasonId, latestSeason.id)
        )
      )
      .where(
        and(
          isNotNull(players.fullName),
          isNotNull(players.position),
          inArray(players.position, ["QB", "RB", "WR", "TE"]),
          or(
            gt(players.pointsPpr, 0),
            gt(players.projPointsPpr, 0),
            isNotNull(rosterPlayers.id)
          )
        )
      )
      .orderBy(desc(players.pointsPpr));

    return rows;
  } catch {
    return [];
  }
}

/**
 * Get all franchise names for the current season (for roster filter pills).
 */
export async function getAllFranchiseNames(): Promise<
  { id: string; name: string; slug: string }[]
> {
  try {
    const rows = await db
      .select({
        id: franchises.id,
        name: franchises.name,
        slug: franchises.slug,
      })
      .from(franchises)
      .orderBy(franchises.name);

    return rows;
  } catch {
    return [];
  }
}

/**
 * Get a single player by ID, with current roster owner info.
 */
export async function getPlayerById(
  playerId: string
): Promise<PlayerSearchResult | null> {
  try {
    // Find the latest season
    const [latestSeason] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .orderBy(desc(seasons.seasonYear))
      .limit(1);

    if (!latestSeason) {
      const [player] = await db
        .select()
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);

      if (!player) return null;

      return {
        id: player.id,
        fullName: player.fullName,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        nflTeam: player.nflTeam,
        status: player.status,
        injuryStatus: player.injuryStatus,
        age: player.age,
        yearsExp: player.yearsExp,
        ownerFranchiseId: null,
        ownerFranchiseName: null,
        ownerFranchiseSlug: null,
      };
    }

    const [row] = await db
      .select({
        id: players.id,
        fullName: players.fullName,
        firstName: players.firstName,
        lastName: players.lastName,
        position: players.position,
        nflTeam: players.nflTeam,
        status: players.status,
        injuryStatus: players.injuryStatus,
        age: players.age,
        yearsExp: players.yearsExp,
        ownerFranchiseId: franchises.id,
        ownerFranchiseName: franchises.name,
        ownerFranchiseSlug: franchises.slug,
      })
      .from(players)
      .leftJoin(
        rosterPlayers,
        and(
          eq(rosterPlayers.playerId, players.id),
          eq(rosterPlayers.seasonId, latestSeason.id)
        )
      )
      .leftJoin(franchises, eq(rosterPlayers.franchiseId, franchises.id))
      .where(eq(players.id, playerId))
      .limit(1);

    return row ?? null;
  } catch {
    return null;
  }
}
