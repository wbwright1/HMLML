import { db } from "@/lib/db";
import {
  playerWeekPoints,
  players,
  franchises,
  seasons,
  matchups,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { deriveStartingSlots } from "@/lib/lineup-slots";
import { SNARKY_LABELS, type LabelTone } from "@/lib/content";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Shape of the per-season settings blob stored in seasons.settings_json.
interface SeasonSettingsJson {
  roster_positions?: string[];
}

export interface RosterPlayerPoints {
  playerId: string;
  position: string | null;
  points: number;
}

export interface LineupAward {
  labelKey: string;
  displayText: string;
  franchiseName: string;
  franchiseSlug: string;
  stat: string;
  context: string;
  tone: LabelTone;
}

export interface SeasonLineupAwards {
  coachingMalpractice: LineupAward | null;
  whatCouldveBeen: LineupAward | null;
}

export interface WeekBenchLeader {
  franchiseName: string;
  franchiseSlug: string;
  /** optimal - actual: points the franchise left on the bench this week. */
  pointsLeft: number;
  optimal: number;
  actual: number;
  /** Whether the franchise still won despite the wasted points, if known. */
  won: boolean | null;
}

// ---------------------------------------------------------------------------
// Pure solver
// ---------------------------------------------------------------------------

// Slot label -> set of eligible player positions for non-fixed lineup slots.
// Every other startable slot label (e.g. "QB", "RB", "WR", "TE") is assumed
// to equal its own position; the eligible set is derived from the season's
// actual roster_positions, never hardcoded league-wide (this league has no
// DEF/K slots, so those never appear here).
const FLEX_ELIGIBILITY: Record<string, string[]> = {
  FLEX: ["RB", "WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
  REC_FLEX: ["WR", "TE"],
  WRRB_FLEX: ["WR", "RB"],
};

function eligiblePositions(slot: string): Set<string> {
  const flex = FLEX_ELIGIBILITY[slot];
  return flex ? new Set(flex) : new Set([slot]);
}

/**
 * Pure greedy solver: given a season's roster_positions and one week's roster
 * of { playerId, position, points }, returns the highest total score
 * achievable by any legal lineup assignment.
 *
 * Slots are filled in ascending order of eligible-position-set size (fixed
 * slots first, then FLEX, then SUPER_FLEX), each slot claiming the
 * highest-scoring unused eligible player. Because eligibility sets nest
 * (SUPER_FLEX ⊇ FLEX ⊇ a fixed position), filling the narrowest slots first
 * is always optimal for this structure: a fixed slot's only candidates are a
 * subset of what a wider slot could also take, so resolving it first never
 * costs the wider slot a better option it could otherwise have used.
 *
 * Pure function, no I/O. Safe to call with an empty or short roster; unfilled
 * slots simply contribute 0.
 */
export function bestPossibleLineup(
  rosterPositions: string[] | null | undefined,
  rosterPlayers: RosterPlayerPoints[]
): number {
  const startingSlots = deriveStartingSlots(rosterPositions);
  if (startingSlots.length === 0 || rosterPlayers.length === 0) return 0;

  const order = startingSlots
    .map((slot, idx) => ({ slot, idx, eligible: eligiblePositions(slot) }))
    .sort((a, b) => a.eligible.size - b.eligible.size || a.idx - b.idx);

  const used = new Set<string>();
  let total = 0;

  for (const { eligible } of order) {
    let best: RosterPlayerPoints | null = null;
    for (const p of rosterPlayers) {
      if (used.has(p.playerId)) continue;
      if (!p.position || !eligible.has(p.position)) continue;
      if (!best || p.points > best.points) best = p;
    }
    if (best) {
      used.add(best.playerId);
      total += best.points;
    }
  }

  return round2(total);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

interface WeekRosterAccumulator {
  franchiseId: string;
  players: RosterPlayerPoints[];
  actual: number;
}

async function loadSeasonRosterPositions(
  seasonId: number
): Promise<string[] | null> {
  const [row] = await db
    .select({ settingsJson: seasons.settingsJson })
    .from(seasons)
    .where(eq(seasons.id, seasonId));
  const settings = (row?.settingsJson ?? null) as SeasonSettingsJson | null;
  return settings?.roster_positions ?? null;
}

/**
 * Season-long optimal-lineup awards: Coaching Malpractice (the franchise with
 * the biggest total gap between optimal and actual started-lineup score,
 * summed over the season's weeks) and What Could've Been (the franchise with
 * the highest total optimal-lineup score for the season).
 *
 * Returns null when the season has zero player_week_points rows. Pre-Sleeper
 * legacy seasons never get bench-level data from the backfill, so callers
 * must hide these cards rather than render a false zero.
 */
export async function getSeasonLineupAwards(
  seasonId: number
): Promise<SeasonLineupAwards | null> {
  try {
    const rosterPositions = await loadSeasonRosterPositions(seasonId);

    const rows = await db
      .select({
        franchiseId: playerWeekPoints.franchiseId,
        week: playerWeekPoints.week,
        playerId: playerWeekPoints.playerId,
        points: playerWeekPoints.points,
        started: playerWeekPoints.started,
        position: players.position,
      })
      .from(playerWeekPoints)
      .leftJoin(players, eq(playerWeekPoints.playerId, players.id))
      .where(eq(playerWeekPoints.seasonId, seasonId));

    if (rows.length === 0) return null;

    // Group into (franchiseId, week) buckets.
    const byFranchiseWeek = new Map<string, WeekRosterAccumulator>();
    for (const row of rows) {
      const key = `${row.franchiseId}:${row.week}`;
      const bucket =
        byFranchiseWeek.get(key) ??
        { franchiseId: row.franchiseId, players: [], actual: 0 };
      bucket.players.push({
        playerId: row.playerId,
        position: row.position,
        points: row.points,
      });
      if (row.started) bucket.actual += row.points;
      byFranchiseWeek.set(key, bucket);
    }

    const totalGapByFranchise = new Map<string, number>();
    const totalOptimalByFranchise = new Map<string, number>();

    for (const bucket of byFranchiseWeek.values()) {
      const optimal = bestPossibleLineup(rosterPositions, bucket.players);
      const gap = Math.max(0, optimal - bucket.actual);
      totalGapByFranchise.set(
        bucket.franchiseId,
        (totalGapByFranchise.get(bucket.franchiseId) ?? 0) + gap
      );
      totalOptimalByFranchise.set(
        bucket.franchiseId,
        (totalOptimalByFranchise.get(bucket.franchiseId) ?? 0) + optimal
      );
    }

    const franchiseRows = await db
      .select({ id: franchises.id, name: franchises.name, slug: franchises.slug })
      .from(franchises);
    const franchiseLookup = new Map(franchiseRows.map((f) => [f.id, f]));

    const buildAward = (
      key: "COACHING_MALPRACTICE" | "WHAT_COULDVE_BEEN",
      franchiseId: string,
      value: number,
      context: string
    ): LineupAward | null => {
      const franchise = franchiseLookup.get(franchiseId);
      if (!franchise) return null;
      const label = SNARKY_LABELS[key];
      return {
        labelKey: label.key,
        displayText: label.displayText,
        franchiseName: franchise.name,
        franchiseSlug: franchise.slug,
        stat: `${value.toFixed(1)} pts`,
        context,
        tone: label.tone,
      };
    };

    let malpracticeId: string | null = null;
    let malpracticeGap = -Infinity;
    for (const [franchiseId, gap] of totalGapByFranchise) {
      if (gap > malpracticeGap) {
        malpracticeGap = gap;
        malpracticeId = franchiseId;
      }
    }

    let couldveBeenId: string | null = null;
    let couldveBeenTotal = -Infinity;
    for (const [franchiseId, total] of totalOptimalByFranchise) {
      if (total > couldveBeenTotal) {
        couldveBeenTotal = total;
        couldveBeenId = franchiseId;
      }
    }

    return {
      coachingMalpractice:
        malpracticeId && malpracticeGap > 0
          ? buildAward(
              "COACHING_MALPRACTICE",
              malpracticeId,
              malpracticeGap,
              "Points left on the bench across the season"
            )
          : null,
      whatCouldveBeen:
        couldveBeenId && couldveBeenTotal > 0
          ? buildAward(
              "WHAT_COULDVE_BEEN",
              couldveBeenId,
              couldveBeenTotal,
              "Best possible lineup score across the season"
            )
          : null,
    };
  } catch (e) {
    console.error("[lineup-efficiency] getSeasonLineupAwards error:", e);
    return null;
  }
}

/**
 * Single-week Coaching Malpractice: the franchise with the biggest gap
 * between that week's optimal lineup and their actual started-lineup score.
 * Feeds the hub's "This Week's Damage" section. Returns null when the week
 * has no player_week_points rows, or when no franchise left points on the
 * bench.
 */
export async function getWeeklyLineupAwards(
  seasonId: number,
  week: number
): Promise<LineupAward | null> {
  try {
    const rosterPositions = await loadSeasonRosterPositions(seasonId);

    const rows = await db
      .select({
        franchiseId: playerWeekPoints.franchiseId,
        playerId: playerWeekPoints.playerId,
        points: playerWeekPoints.points,
        started: playerWeekPoints.started,
        position: players.position,
      })
      .from(playerWeekPoints)
      .leftJoin(players, eq(playerWeekPoints.playerId, players.id))
      .where(
        and(
          eq(playerWeekPoints.seasonId, seasonId),
          eq(playerWeekPoints.week, week)
        )
      );

    if (rows.length === 0) return null;

    const byFranchise = new Map<string, WeekRosterAccumulator>();
    for (const row of rows) {
      const bucket =
        byFranchise.get(row.franchiseId) ??
        { franchiseId: row.franchiseId, players: [], actual: 0 };
      bucket.players.push({
        playerId: row.playerId,
        position: row.position,
        points: row.points,
      });
      if (row.started) bucket.actual += row.points;
      byFranchise.set(row.franchiseId, bucket);
    }

    let bestFranchiseId: string | null = null;
    let bestGap = -Infinity;
    for (const bucket of byFranchise.values()) {
      const optimal = bestPossibleLineup(rosterPositions, bucket.players);
      const gap = optimal - bucket.actual;
      if (gap > bestGap) {
        bestGap = gap;
        bestFranchiseId = bucket.franchiseId;
      }
    }

    if (!bestFranchiseId || bestGap <= 0) return null;

    const [franchise] = await db
      .select({ name: franchises.name, slug: franchises.slug })
      .from(franchises)
      .where(eq(franchises.id, bestFranchiseId));

    if (!franchise) return null;

    const label = SNARKY_LABELS.COACHING_MALPRACTICE;
    return {
      labelKey: label.key,
      displayText: label.displayText,
      franchiseName: franchise.name,
      franchiseSlug: franchise.slug,
      stat: `${bestGap.toFixed(1)} pts left on bench`,
      context: `Week ${week}'s worst lineup decisions`,
      tone: label.tone,
    };
  } catch (e) {
    console.error("[lineup-efficiency] getWeeklyLineupAwards error:", e);
    return null;
  }
}

/**
 * The franchise that left the most points on the bench in a single week,
 * returning the full detail the hub's "Left On The Bench" callout needs:
 * points left, optimal total, actual started total, and whether they won
 * anyway. Sibling to getWeeklyLineupAwards (which surfaces only the snarky
 * label). Returns null when the week has no player_week_points rows or nobody
 * left points on the bench.
 */
export async function getWeekBenchLeader(
  seasonId: number,
  week: number
): Promise<WeekBenchLeader | null> {
  try {
    const rosterPositions = await loadSeasonRosterPositions(seasonId);

    const rows = await db
      .select({
        franchiseId: playerWeekPoints.franchiseId,
        playerId: playerWeekPoints.playerId,
        points: playerWeekPoints.points,
        started: playerWeekPoints.started,
        position: players.position,
      })
      .from(playerWeekPoints)
      .leftJoin(players, eq(playerWeekPoints.playerId, players.id))
      .where(
        and(
          eq(playerWeekPoints.seasonId, seasonId),
          eq(playerWeekPoints.week, week)
        )
      );

    if (rows.length === 0) return null;

    const byFranchise = new Map<string, WeekRosterAccumulator>();
    for (const row of rows) {
      const bucket =
        byFranchise.get(row.franchiseId) ??
        { franchiseId: row.franchiseId, players: [], actual: 0 };
      bucket.players.push({
        playerId: row.playerId,
        position: row.position,
        points: row.points,
      });
      if (row.started) bucket.actual += row.points;
      byFranchise.set(row.franchiseId, bucket);
    }

    let best: { franchiseId: string; optimal: number; actual: number } | null =
      null;
    for (const bucket of byFranchise.values()) {
      const optimal = bestPossibleLineup(rosterPositions, bucket.players);
      const gap = optimal - bucket.actual;
      if (!best || gap > best.optimal - best.actual) {
        best = { franchiseId: bucket.franchiseId, optimal, actual: bucket.actual };
      }
    }

    if (!best || best.optimal - best.actual <= 0) return null;

    const [franchise] = await db
      .select({ name: franchises.name, slug: franchises.slug })
      .from(franchises)
      .where(eq(franchises.id, best.franchiseId));

    if (!franchise) return null;

    // Did they win that week anyway? Optional context; null when unknown.
    let won: boolean | null = null;
    try {
      const [result] = await db
        .select({ isWinner: matchups.isWinner })
        .from(matchups)
        .where(
          and(
            eq(matchups.seasonId, seasonId),
            eq(matchups.week, week),
            eq(matchups.franchiseId, best.franchiseId)
          )
        );
      won = result?.isWinner ?? null;
    } catch {
      won = null;
    }

    const round1 = (n: number) => Math.round(n * 10) / 10;
    return {
      franchiseName: franchise.name,
      franchiseSlug: franchise.slug,
      pointsLeft: round1(best.optimal - best.actual),
      optimal: round1(best.optimal),
      actual: round1(best.actual),
      won,
    };
  } catch (e) {
    console.error("[lineup-efficiency] getWeekBenchLeader error:", e);
    return null;
  }
}
