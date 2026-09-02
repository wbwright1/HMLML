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

/**
 * One player's prior production over the baseline window. `gamesByFranchise`
 * is optional so older callers (and tests) can pass the plain ppg/games pair;
 * without it the franchise-aware archetypes (Revenge Game, New Face) simply
 * find no candidates and the slot falls back to the next-best headliner.
 */
export interface BaselineEntry {
  ppg: number;
  games: number;
  /** Started games per franchise across the baseline window. */
  gamesByFranchise?: Map<string, number>;
}

/** Which story a Player to Watch is on the card for. */
export type PlayerStoryKey =
  | "headliner"
  | "debut"
  | "revenge"
  | "newFace"
  | "leap";

/**
 * The one place the story kicker strings live. The rail prints these verbatim,
 * so a copy change happens here and nowhere else.
 */
export const PLAYER_STORY_LABELS: Record<PlayerStoryKey, string> = {
  headliner: "The Headliner",
  debut: "The Debut",
  revenge: "Revenge Game",
  newFace: "New Face",
  leap: "The Leap",
};

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
  /** Which slot this player filled. */
  storyKey: PlayerStoryKey;
  /** PLAYER_STORY_LABELS[storyKey], resolved for the UI. */
  storyLabel: string;
  /** One true sentence backing the story, or null for the headliner. */
  storyDetail: string | null;
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

/** A Leap needs a projection at least this multiple of the player's baseline ppg. */
export const LEAP_PROJECTION_MULTIPLE = 1.3;
/** ...and a baseline of at least this many started games, so the jump is off something real. */
export const LEAP_MIN_BASELINE_GAMES = 6;

/**
 * Story slots are filled in this order after the headliner. At most one player
 * per archetype per week; any archetype with no honest candidate is skipped and
 * the slot falls back to the next-best headliner score.
 */
const STORY_ORDER: PlayerStoryKey[] = ["debut", "revenge", "newFace", "leap"];

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

/** The single highest projected starter in one matchup. */
export interface TopProjectedStarter {
  playerName: string;
  position: string | null;
  franchiseId: string;
  /** Rounded to one decimal, the precision the copy quotes it at. */
  projectedPoints: number;
}

/**
 * The highest projected starter in each Sleeper matchup, from the same pool
 * Players to Watch scores over (so no caller needs its own query). Rows with
 * no matchup, no name, or no projection are skipped: a zero projection is
 * missing data, not a prediction. Ties keep the first row seen, which makes
 * the result deterministic for a given pool order.
 */
export function topProjectedStarterByMatchup(
  pool: PoolRow[]
): Map<number, TopProjectedStarter> {
  const best = new Map<number, TopProjectedStarter>();
  for (const r of pool) {
    if (r.matchupId == null || r.name == null) continue;
    const projected = r.projectedPoints ?? 0;
    if (projected <= 0) continue;
    const current = best.get(r.matchupId);
    if (current && current.projectedPoints >= projected) continue;
    best.set(r.matchupId, {
      playerName: r.name,
      position: r.position,
      franchiseId: r.franchiseId,
      projectedPoints: Math.round(projected * 10) / 10,
    });
  }
  return best;
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

/** The opposing franchise's id for each franchise sharing a matchupId. */
function computeOpponentIds(pool: PoolRow[]): Map<string, string> {
  const franchisesByMatchup = new Map<number, Set<string>>();
  for (const r of pool) {
    if (r.matchupId == null) continue;
    const ids = franchisesByMatchup.get(r.matchupId) ?? new Set<string>();
    ids.add(r.franchiseId);
    franchisesByMatchup.set(r.matchupId, ids);
  }

  const opponentByFranchise = new Map<string, string>();
  for (const ids of franchisesByMatchup.values()) {
    const [idA, idB] = [...ids];
    if (ids.size !== 2) continue;
    opponentByFranchise.set(idA, idB);
    opponentByFranchise.set(idB, idA);
  }
  return opponentByFranchise;
}

/** Median projection across the players carrying one, the bar a Debut must clear. */
function medianProjection(projectable: PoolRow[]): number {
  const values = projectable
    .map((r) => r.projectedPoints ?? 0)
    .sort((a, b) => a - b);
  if (values.length === 0) return 0;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 1
    ? values[mid]
    : (values[mid - 1] + values[mid]) / 2;
}

/** "in 2025" / "earlier this season", for story details that cite the window. */
function baselineWindowPhrase(meta: BaselineMeta): string {
  return meta.kind === "priorSeason"
    ? `in ${meta.seasonYear}`
    : "earlier this season";
}

/** "Started 12 games for Vanilla Vick in 2025": the shared former-franchise line. */
function formerFranchiseDetail(
  games: number,
  franchiseName: string,
  meta: BaselineMeta
): string {
  const noun = games === 1 ? "game" : "games";
  return `Started ${games} ${noun} for ${franchiseName} ${baselineWindowPhrase(meta)}`;
}

/**
 * The franchise a player started the most games for over the baseline window,
 * when that franchise is not the one starting him this week. Null when the
 * baseline carries no per-franchise detail, or when he never moved.
 */
function priorFranchiseId(
  baseline: BaselineEntry | null,
  currentFranchiseId: string
): { franchiseId: string; games: number } | null {
  const byFranchise = baseline?.gamesByFranchise;
  if (!byFranchise) return null;
  let best: { franchiseId: string; games: number } | null = null;
  for (const [franchiseId, games] of byFranchise) {
    if (franchiseId === currentFranchiseId || games <= 0) continue;
    if (best == null || games > best.games || (games === best.games && franchiseId < best.franchiseId)) {
      best = { franchiseId, games };
    }
  }
  return best;
}

export interface SelectPlayersToWatchOptions {
  featuredMatchupId: number | null;
  limit?: number;
}

/**
 * Scores and selects up to `limit` Players to Watch from the week's starter
 * pool, one per franchise. Pure function: no DB access, fully unit-testable.
 *
 * Slot 1 is THE HEADLINER: the top blended score, where score =
 * 0.6 * norm(projectedPoints) + 0.4 * norm(baselinePpg), each normalized
 * against the pool max so the two scales are comparable, then multiplied by
 * SWING_BOOST for players in a swing/featured matchup.
 *
 * The remaining slots are story picks, tried in STORY_ORDER and each filled by
 * the highest-scoring player who honestly qualifies:
 *   - THE DEBUT: no started games in the baseline window, but a projection at
 *     or above the pool's median (a real starter, not a dart throw).
 *   - REVENGE GAME: started for the exact franchise he faces this week.
 *   - NEW FACE: started for a different franchise in the baseline window.
 *   - THE LEAP: projected 30%+ above a baseline of 6 or more started games.
 * Any archetype with no candidate is skipped; leftover slots fall back to the
 * next-best headliner score, so the rail never shrinks and never fabricates.
 *
 * Players who carry no projection at all are excluded (nothing honest to rank
 * them on); ties break deterministically on playerId.
 *
 * Returns [] when the pool is empty or nothing in it carries a projection.
 */
export function selectPlayersToWatch(
  pool: PoolRow[],
  baselineByPlayer: Map<string, BaselineEntry>,
  baselineMeta: BaselineMeta,
  opts: SelectPlayersToWatchOptions
): PlayerToWatch[] {
  const projectable = pool.filter((r) => (r.projectedPoints ?? 0) > 0);
  if (projectable.length === 0) return [];

  const limit = opts.limit ?? DEFAULT_LIMIT;
  const swingMatchups = computeSwingMatchups(pool, opts.featuredMatchupId);
  const opponentByFranchise = computeOpponentNames(pool);
  const opponentIdByFranchise = computeOpponentIds(pool);
  const franchiseNameById = new Map(pool.map((r) => [r.franchiseId, r.franchiseName]));
  const debutBar = medianProjection(projectable);

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

  type Scored = (typeof scored)[number];

  /**
   * The story detail for a candidate under one archetype, or null when the
   * claim would not be literally true. Returning null is how an archetype
   * declines a candidate, so every printed line is backed by real rows.
   */
  const storyDetailFor = (s: Scored, key: PlayerStoryKey): string | null => {
    const games = s.baseline?.games ?? 0;
    const projected = s.row.projectedPoints ?? 0;

    if (key === "debut") {
      if (games > 0 || projected < debutBar) return null;
      return baselineMeta.kind === "priorSeason"
        ? `No starts in ${baselineMeta.seasonYear}, in the lineup anyway`
        : `No starts through Week ${baselineMeta.throughWeek}, in the lineup anyway`;
    }

    if (key === "revenge") {
      const opponentId = opponentIdByFranchise.get(s.row.franchiseId);
      const startedFor = s.baseline?.gamesByFranchise;
      if (!opponentId || !startedFor) return null;
      const gamesForOpponent = startedFor.get(opponentId) ?? 0;
      if (gamesForOpponent <= 0) return null;
      const opponentName = franchiseNameById.get(opponentId);
      if (!opponentName) return null;
      return formerFranchiseDetail(gamesForOpponent, opponentName, baselineMeta);
    }

    if (key === "newFace") {
      const prior = priorFranchiseId(s.baseline, s.row.franchiseId);
      if (!prior) return null;
      const priorName = franchiseNameById.get(prior.franchiseId);
      if (!priorName) return null;
      return formerFranchiseDetail(prior.games, priorName, baselineMeta);
    }

    // The Leap.
    const ppg = s.baseline?.ppg ?? 0;
    if (games < LEAP_MIN_BASELINE_GAMES || ppg <= 0) return null;
    if (projected < ppg * LEAP_PROJECTION_MULTIPLE) return null;
    return `Projected ${projected.toFixed(1)} off ${ppg.toFixed(1)} ppg ${baselineWindowPhrase(baselineMeta)}`;
  };

  const toPlayer = (
    s: Scored,
    storyKey: PlayerStoryKey,
    storyDetail: string | null
  ): PlayerToWatch => ({
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
    storyKey,
    storyLabel: PLAYER_STORY_LABELS[storyKey],
    storyDetail,
  });

  const seenFranchise = new Set<string>();
  const seenPlayer = new Set<string>();
  const picked: PlayerToWatch[] = [];

  const take = (s: Scored, key: PlayerStoryKey, detail: string | null) => {
    seenFranchise.add(s.row.franchiseId);
    seenPlayer.add(s.row.playerId);
    picked.push(toPlayer(s, key, detail));
  };

  const available = (s: Scored): boolean =>
    !seenPlayer.has(s.row.playerId) && !seenFranchise.has(s.row.franchiseId);

  // Slot 1: the headliner, unchanged scoring.
  const headliner = scored.find(available);
  if (!headliner) return [];
  take(headliner, "headliner", null);

  // Slots 2..n: one player per archetype, best score first.
  for (const key of STORY_ORDER) {
    if (picked.length >= limit) break;
    for (const s of scored) {
      if (!available(s)) continue;
      const detail = storyDetailFor(s, key);
      if (detail == null) continue;
      take(s, key, detail);
      break;
    }
  }

  // Anything left over falls back to the next-best headliner score.
  for (const s of scored) {
    if (picked.length >= limit) break;
    if (!available(s)) continue;
    take(s, "headliner", null);
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
): Promise<{ byPlayer: Map<string, BaselineEntry>; meta: BaselineMeta }> {
  const byPlayer = new Map<string, BaselineEntry>();
  if (playerIds.length === 0) {
    return { byPlayer, meta: { kind: "currentSeason", throughWeek: Math.max(week - 1, 0) } };
  }

  const joinCompleteMatchup = and(
    eq(matchups.seasonId, playerWeekPoints.seasonId),
    eq(matchups.week, playerWeekPoints.week),
    eq(matchups.rosterId, playerWeekPoints.rosterId)
  );

  let rows: { playerId: string; points: number; franchiseId: string }[] = [];
  let meta: BaselineMeta;

  if (week === 1) {
    const priorSeason = await getLastCompletedSeason();
    meta = { kind: "priorSeason", seasonYear: priorSeason?.seasonYear ?? 0 };
    if (priorSeason) {
      rows = await db
        .select({
          playerId: playerWeekPoints.playerId,
          points: playerWeekPoints.points,
          franchiseId: playerWeekPoints.franchiseId,
        })
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
      .select({
        playerId: playerWeekPoints.playerId,
        points: playerWeekPoints.points,
        franchiseId: playerWeekPoints.franchiseId,
      })
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

  // Per-franchise game counts ride along with the ppg aggregate so the story
  // archetypes (Revenge Game, New Face) can name the franchise a player
  // actually started for, derived from the same started/complete rows.
  const sums = new Map<
    string,
    { sum: number; games: number; byFranchise: Map<string, number> }
  >();
  for (const r of rows) {
    const cur =
      sums.get(r.playerId) ?? { sum: 0, games: 0, byFranchise: new Map<string, number>() };
    cur.sum += r.points;
    cur.games += 1;
    cur.byFranchise.set(r.franchiseId, (cur.byFranchise.get(r.franchiseId) ?? 0) + 1);
    sums.set(r.playerId, cur);
  }
  for (const [playerId, { sum, games, byFranchise }] of sums) {
    byPlayer.set(playerId, {
      ppg: games > 0 ? sum / games : 0,
      games,
      gamesByFranchise: byFranchise,
    });
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
