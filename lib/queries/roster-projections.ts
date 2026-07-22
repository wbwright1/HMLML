import { db } from "@/lib/db";
import { franchises, players, rosterPlayers } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { bestPossibleLineup, loadSeasonRosterPositions } from "@/lib/queries/lineup-efficiency";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FranchiseRosterProjection {
  franchiseId: string;
  slug: string;
  name: string;
  /** Optimal projected starting-lineup total (bestPossibleLineup over the roster's projections). */
  projectedStartingPoints: number;
  /** 1 = highest projected total in the league. */
  leagueRank: number;
  topProjectedPlayer: { name: string; position: string | null; points: number } | null;
}

/** One roster_players ⨝ players row, as the projection pool builder consumes it. */
export interface ProjectionPoolRow {
  franchiseId: string;
  playerId: string;
  playerName: string | null;
  position: string | null;
  projPointsPpr: number | null;
  projSeason: number | null;
}

export interface ProjectionPoolEntry {
  playerId: string;
  name: string | null;
  position: string | null;
  points: number;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in roster-projections.test.ts)
// ---------------------------------------------------------------------------

/**
 * Groups roster rows into per-franchise projection pools, counting ONLY
 * projections for the target season. A player whose stored projection is for
 * a prior season (projSeason mismatch) is a stale leftover: the player exists
 * on the roster but has no current-season projection, so they contribute 0
 * points rather than last year's number. The SQL query already filters on
 * proj_season; this applies the same rule in-process so the exclusion is
 * pure, explicit, and directly testable.
 */
export function buildProjectionPools(
  rows: ProjectionPoolRow[],
  projSeason: number,
): Map<string, ProjectionPoolEntry[]> {
  const byFranchise = new Map<string, ProjectionPoolEntry[]>();
  for (const r of rows) {
    const current = r.projSeason === projSeason;
    const pool = byFranchise.get(r.franchiseId) ?? [];
    pool.push({
      playerId: r.playerId,
      name: r.playerName,
      position: r.position,
      points: current ? (r.projPointsPpr ?? 0) : 0,
    });
    byFranchise.set(r.franchiseId, pool);
  }
  return byFranchise;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Upcoming-season roster-strength projections: each current-season roster's
 * optimal starting lineup total, computed from players.proj_points_ppr for
 * the given projection season, then ranked across the league. Reuses the pure
 * bestPossibleLineup solver from lib/queries/lineup-efficiency.ts (same
 * optimal-lineup logic used for the Coaching Malpractice awards) so "optimal"
 * means the same thing everywhere.
 *
 * projSeason guards against stale data: a player projected last year but
 * absent from this year's projections feed keeps the old proj_season on their
 * row, and that leftover must never count toward this year's rankings.
 *
 * Returns an empty array when the season has no roster_players yet, when no
 * player carries a projection FOR projSeason (e.g. the proj_points_ppr column
 * has not been populated by a sync run, or only holds a prior year's data),
 * or on any query failure — all of which the preseason hub must treat as
 * "no projection data available yet."
 */
export async function getRosterProjections(
  seasonId: number,
  projSeason: number,
): Promise<FranchiseRosterProjection[]> {
  try {
    const rosterPositions = await loadSeasonRosterPositions(seasonId);

    const rows = await db
      .select({
        franchiseId: rosterPlayers.franchiseId,
        playerId: rosterPlayers.playerId,
        playerName: players.fullName,
        position: players.position,
        projPointsPpr: players.projPointsPpr,
        projSeason: players.projSeason,
      })
      .from(rosterPlayers)
      .innerJoin(players, eq(rosterPlayers.playerId, players.id))
      .where(
        and(
          eq(rosterPlayers.seasonId, seasonId),
          eq(players.projSeason, projSeason),
        ),
      );

    if (rows.length === 0) return [];

    // The SQL filter above already excludes stale proj_season rows; the pure
    // builder applies the identical rule so the exclusion holds even if the
    // query and the builder ever drift.
    const byFranchise = buildProjectionPools(rows, projSeason);

    // No franchise carries any projection data at all for this season: the
    // sync step that populates proj_points_ppr hasn't run yet. Degrade to
    // empty rather than ranking a league where everyone projects to zero.
    const anyProjected = [...byFranchise.values()].some((pool) =>
      pool.some((p) => p.points > 0),
    );
    if (!anyProjected) return [];

    const franchiseRows = await db
      .select({ id: franchises.id, slug: franchises.slug, name: franchises.name })
      .from(franchises);
    const franchiseLookup = new Map(franchiseRows.map((f) => [f.id, f]));

    const unranked = [...byFranchise.entries()].map(([franchiseId, pool]) => {
      const franchise = franchiseLookup.get(franchiseId);
      const projectedStartingPoints = bestPossibleLineup(
        rosterPositions,
        pool.map((p) => ({ playerId: p.playerId, position: p.position, points: p.points })),
      );
      const top = [...pool].sort((a, b) => b.points - a.points)[0] ?? null;
      return {
        franchiseId,
        slug: franchise?.slug ?? franchiseId,
        name: franchise?.name ?? franchiseId,
        projectedStartingPoints,
        topProjectedPlayer:
          top && top.points > 0
            ? { name: top.name ?? "Unknown", position: top.position, points: top.points }
            : null,
      };
    });

    const ranked = [...unranked].sort(
      (a, b) => b.projectedStartingPoints - a.projectedStartingPoints,
    );

    const rankById = new Map(ranked.map((r, i) => [r.franchiseId, i + 1]));

    return unranked
      .map((r) => ({ ...r, leagueRank: rankById.get(r.franchiseId) ?? ranked.length }))
      .sort((a, b) => a.leagueRank - b.leagueRank);
  } catch (e) {
    console.error("[roster-projections] getRosterProjections error:", e);
    return [];
  }
}
