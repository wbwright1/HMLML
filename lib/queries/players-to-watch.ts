import { db } from "@/lib/db";
import { playerWeekPoints, players, franchises, matchups } from "@/lib/db/schema";
import { and, eq, inArray, lt } from "drizzle-orm";
import { getLastCompletedSeason } from "@/lib/queries/seasons";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One started player's row for the target week, the pool this module scores over. */
export interface PoolRow {
  playerId: string;
  name: string | null;
  position: string | null;
  team: string | null;
  franchiseId: string;
  franchiseName: string;
  franchiseSlug: string;
  /** Sleeper matchup pairing id for this franchise's game this week, or null. */
  matchupId: number | null;
  projectedPoints: number | null;
}

/** Prior production used as the honest baseline for a card's sub-line. */
export type BaselineMeta =
  | { kind: "priorSeason"; seasonYear: number }
  | { kind: "currentSeason"; throughWeek: number };

export interface PlayerToWatch {
  playerId: string;
  name: string;
  position: string | null;
  team: string | null;
  projectedPoints: number;
  baselinePpg: number | null;
  baselineGames: number;
  baselineLabel: string;
  franchiseName: string;
  franchiseSlug: string;
  opponentName: string;
  inFeaturedMatchup: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Matchups within this many combined-projected points are "swing" matchups. */
export const SWING_MARGIN_POINTS = 10.0;
/** Score multiplier for players in a swing (or featured) matchup. */
export const SWING_BOOST = 1.15;
const PROJECTED_WEIGHT = 0.6;
const BASELINE_WEIGHT = 0.4;
const DEFAULT_LIMIT = 3;

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in players-to-watch.test.ts)
// ---------------------------------------------------------------------------

/** Sums each franchise's projected starting total from the week's pool. */
export function sumProjectedByFranchise(pool: PoolRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const r of pool) {
    totals.set(
      r.franchiseId,
      (totals.get(r.franchiseId) ?? 0) + (r.projectedPoints ?? 0)
    );
  }
  return totals;
}

/**
 * A player has no baseline (rookie, no prior started rows) when baselineGames
 * is 0; that gets an honest "First real look" rather than an invented number.
 */
export function formatBaselineLabel(
  baselinePpg: number | null,
  baselineGames: number,
  meta: BaselineMeta
): string {
  if (baselinePpg == null || baselineGames === 0) return "First real look";
  const ppg = baselinePpg.toFixed(1);
  return meta.kind === "priorSeason"
    ? `${ppg} ppg in ${meta.seasonYear}`
    : `${ppg} ppg through Week ${meta.throughWeek}`;
}

/**
 * Which Sleeper matchupIds in the pool are "swing" matchups: the featured
 * (Game of the Week) matchup, or any matchup where the two franchises'
 * projected starting totals are within SWING_MARGIN_POINTS of each other.
 * Derived entirely from the pool already in memory, no extra query.
 */
function computeSwingMatchups(
  pool: PoolRow[],
  featuredMatchupId: number | null
): Set<number> {
  const totalsByMatchup = new Map<number, Map<string, number>>();
  for (const r of pool) {
    if (r.matchupId == null) continue;
    const byFranchise = totalsByMatchup.get(r.matchupId) ?? new Map<string, number>();
    byFranchise.set(
      r.franchiseId,
      (byFranchise.get(r.franchiseId) ?? 0) + (r.projectedPoints ?? 0)
    );
    totalsByMatchup.set(r.matchupId, byFranchise);
  }

  const swing = new Set<number>();
  for (const [matchupId, byFranchise] of totalsByMatchup) {
    if (matchupId === featuredMatchupId) {
      swing.add(matchupId);
      continue;
    }
    const totals = [...byFranchise.values()];
    if (totals.length === 2 && Math.abs(totals[0] - totals[1]) <= SWING_MARGIN_POINTS) {
      swing.add(matchupId);
    }
  }
  return swing;
}

/** The opposing franchise's name for each franchise sharing a matchupId. */
function computeOpponentNames(pool: PoolRow[]): Map<string, string> {
  const franchisesByMatchup = new Map<number, Map<string, string>>();
  for (const r of pool) {
    if (r.matchupId == null) continue;
    const byFranchise =
      franchisesByMatchup.get(r.matchupId) ?? new Map<string, string>();
    byFranchise.set(r.franchiseId, r.franchiseName);
    franchisesByMatchup.set(r.matchupId, byFranchise);
  }

  const opponentByFranchise = new Map<string, string>();
  for (const byFranchise of franchisesByMatchup.values()) {
    const entries = [...byFranchise.entries()];
    if (entries.length !== 2) continue;
    const [[idA, nameA], [idB, nameB]] = entries;
    opponentByFranchise.set(idA, nameB);
    opponentByFranchise.set(idB, nameA);
  }
  return opponentByFranchise;
}

export interface SelectPlayersToWatchOptions {
  featuredMatchupId: number | null;
  limit?: number;
}

/**
 * Scores and selects up to `limit` Players to Watch from the week's starter
 * pool, one per franchise, weighted toward players likely to swing this
 * week's matchups. Pure function: no DB access, fully unit-testable.
 *
 * Score = 0.6 * norm(projectedPoints) + 0.4 * norm(baselinePpg), each
 * normalized against the pool max so the two scales are comparable, then
 * multiplied by SWING_BOOST for players in a swing/featured matchup.
 * Players who carry no projection at all are excluded (nothing honest to
 * rank them on); ties break deterministically on playerId.
 *
 * Returns [] when the pool is empty or nothing in it carries a projection.
 */
export function selectPlayersToWatch(
  pool: PoolRow[],
  baselineByPlayer: Map<string, { ppg: number; games: number }>,
  baselineMeta: BaselineMeta,
  opts: SelectPlayersToWatchOptions
): PlayerToWatch[] {
  const projectable = pool.filter((r) => (r.projectedPoints ?? 0) > 0);
  if (projectable.length === 0) return [];

  const limit = opts.limit ?? DEFAULT_LIMIT;
  const swingMatchups = computeSwingMatchups(pool, opts.featuredMatchupId);
  const opponentByFranchise = computeOpponentNames(pool);

  const maxProjected = Math.max(...projectable.map((r) => r.projectedPoints ?? 0));
  const maxBaseline = Math.max(
    0,
    ...projectable.map((r) => baselineByPlayer.get(r.playerId)?.ppg ?? 0)
  );

  const scored = projectable.map((r) => {
    const baseline = baselineByPlayer.get(r.playerId) ?? null;
    const projectedPoints = r.projectedPoints ?? 0;
    const normProjected = maxProjected > 0 ? projectedPoints / maxProjected : 0;
    const normBaseline =
      maxBaseline > 0 ? (baseline?.ppg ?? 0) / maxBaseline : 0;
    const inFeaturedMatchup = r.matchupId != null && swingMatchups.has(r.matchupId);
    const baseScore = PROJECTED_WEIGHT * normProjected + BASELINE_WEIGHT * normBaseline;
    const score = inFeaturedMatchup ? baseScore * SWING_BOOST : baseScore;
    return { row: r, baseline, score, inFeaturedMatchup };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.row.playerId.localeCompare(b.row.playerId);
  });

  const seenFranchise = new Set<string>();
  const picked: PlayerToWatch[] = [];
  for (const s of scored) {
    if (seenFranchise.has(s.row.franchiseId)) continue;
    seenFranchise.add(s.row.franchiseId);
    picked.push({
      playerId: s.row.playerId,
      name: s.row.name ?? "Unknown",
      position: s.row.position,
      team: s.row.team,
      projectedPoints: s.row.projectedPoints ?? 0,
      baselinePpg: s.baseline?.ppg ?? null,
      baselineGames: s.baseline?.games ?? 0,
      baselineLabel: formatBaselineLabel(
        s.baseline?.ppg ?? null,
        s.baseline?.games ?? 0,
        baselineMeta
      ),
      franchiseName: s.row.franchiseName,
      franchiseSlug: s.row.franchiseSlug,
      opponentName: opponentByFranchise.get(s.row.franchiseId) ?? "the field",
      inFeaturedMatchup: s.inFeaturedMatchup,
    });
    if (picked.length >= limit) break;
  }
  return picked;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * This week's starter pool: player_week_points rows where started = true,
 * joined to players (name/position/nfl team) and franchises. This is the
 * honest definition of "to watch": players actually in someone's lineup this
 * week. Reused by the hub both for Players to Watch and for the Game of the
 * Week's projected-strength ranking, so the same rows drive both features.
 */
export async function getWeekStarterPool(
  seasonId: number,
  week: number
): Promise<PoolRow[]> {
  try {
    return await db
      .select({
        playerId: playerWeekPoints.playerId,
        name: players.fullName,
        position: players.position,
        team: players.nflTeam,
        franchiseId: playerWeekPoints.franchiseId,
        franchiseName: franchises.name,
        franchiseSlug: franchises.slug,
        matchupId: playerWeekPoints.matchupId,
        projectedPoints: playerWeekPoints.projectedPoints,
      })
      .from(playerWeekPoints)
      .leftJoin(players, eq(playerWeekPoints.playerId, players.id))
      .innerJoin(franchises, eq(playerWeekPoints.franchiseId, franchises.id))
      .where(
        and(
          eq(playerWeekPoints.seasonId, seasonId),
          eq(playerWeekPoints.week, week),
          eq(playerWeekPoints.started, true)
        )
      );
  } catch (e) {
    console.error("[players-to-watch] getWeekStarterPool error:", e);
    return [];
  }
}

/**
 * Prior-production baseline for a set of players: week 1 aggregates the
 * previous COMPLETED season (never hardcoded); weeks 2+ aggregate this
 * season's completed weeks before `week`. Only started rows in COMPLETE
 * matchups count, matching the game-state discipline used everywhere else
 * (never a points heuristic). One grouped query, not one per player.
 */
async function getBaseline(
  seasonId: number,
  week: number,
  playerIds: string[]
): Promise<{ byPlayer: Map<string, { ppg: number; games: number }>; meta: BaselineMeta }> {
  const byPlayer = new Map<string, { ppg: number; games: number }>();
  if (playerIds.length === 0) {
    return { byPlayer, meta: { kind: "currentSeason", throughWeek: Math.max(week - 1, 0) } };
  }

  const joinCompleteMatchup = and(
    eq(matchups.seasonId, playerWeekPoints.seasonId),
    eq(matchups.week, playerWeekPoints.week),
    eq(matchups.rosterId, playerWeekPoints.rosterId)
  );

  let rows: { playerId: string; points: number }[] = [];
  let meta: BaselineMeta;

  if (week === 1) {
    const priorSeason = await getLastCompletedSeason();
    meta = { kind: "priorSeason", seasonYear: priorSeason?.seasonYear ?? 0 };
    if (priorSeason) {
      rows = await db
        .select({ playerId: playerWeekPoints.playerId, points: playerWeekPoints.points })
        .from(playerWeekPoints)
        .innerJoin(matchups, joinCompleteMatchup)
        .where(
          and(
            eq(playerWeekPoints.seasonId, priorSeason.id),
            eq(playerWeekPoints.started, true),
            eq(matchups.status, "complete"),
            inArray(playerWeekPoints.playerId, playerIds)
          )
        );
    }
  } else {
    meta = { kind: "currentSeason", throughWeek: week - 1 };
    rows = await db
      .select({ playerId: playerWeekPoints.playerId, points: playerWeekPoints.points })
      .from(playerWeekPoints)
      .innerJoin(matchups, joinCompleteMatchup)
      .where(
        and(
          eq(playerWeekPoints.seasonId, seasonId),
          lt(playerWeekPoints.week, week),
          eq(playerWeekPoints.started, true),
          eq(matchups.status, "complete"),
          inArray(playerWeekPoints.playerId, playerIds)
        )
      );
  }

  const sums = new Map<string, { sum: number; games: number }>();
  for (const r of rows) {
    const cur = sums.get(r.playerId) ?? { sum: 0, games: 0 };
    cur.sum += r.points;
    cur.games += 1;
    sums.set(r.playerId, cur);
  }
  for (const [playerId, { sum, games }] of sums) {
    byPlayer.set(playerId, { ppg: games > 0 ? sum / games : 0, games });
  }

  return { byPlayer, meta };
}

/**
 * Players to Watch: the pre-kickoff replacement for the retrospective "Week N
 * Standouts" rail. Week 1 grounds picks in the previous completed season's
 * per-player production; weeks 2+ ground them in this season's completed
 * weeks so far. Weighted toward players in close/high-stakes matchups.
 *
 * Returns [] when the pool is empty, nothing carries a projection, or the
 * query fails. An empty result renders nothing; absence is fine.
 */
export async function getPlayersToWatch(
  seasonId: number,
  week: number,
  opts: SelectPlayersToWatchOptions
): Promise<PlayerToWatch[]> {
  try {
    const pool = await getWeekStarterPool(seasonId, week);
    if (pool.length === 0) return [];
    return await getPlayersToWatchFromPool(pool, seasonId, week, opts);
  } catch (e) {
    console.error("[players-to-watch] getPlayersToWatch error:", e);
    return [];
  }
}

/**
 * Same as getPlayersToWatch, but takes an already-fetched starter pool so a
 * caller that also needs the pool for something else (the hub's Game of the
 * Week projected-strength ranking) does not issue the query twice.
 */
export async function getPlayersToWatchFromPool(
  pool: PoolRow[],
  seasonId: number,
  week: number,
  opts: SelectPlayersToWatchOptions
): Promise<PlayerToWatch[]> {
  if (pool.length === 0) return [];
  try {
    const playerIds = [...new Set(pool.map((r) => r.playerId))];
    const { byPlayer, meta } = await getBaseline(seasonId, week, playerIds);
    return selectPlayersToWatch(pool, byPlayer, meta, opts);
  } catch (e) {
    console.error("[players-to-watch] getPlayersToWatchFromPool error:", e);
    return [];
  }
}
