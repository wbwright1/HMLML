// Pure, DB-free logic for the post-week recap block that leads the
// between-weeks hub (Tue AM week roll through Thursday kickoff). Everything
// here is deterministic and unit-tested; the query module
// (lib/queries/week-recap.ts) gathers rows and hands them to these helpers.

import { deriveStartingSlots } from "@/lib/lineup-slots";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** One rostered player's week, with the franchise that rostered them. */
export interface RecapPlayer {
  playerId: string;
  name: string;
  position: string | null;
  nflTeam: string | null;
  points: number;
  projectedPoints: number | null;
  /** True when the franchise actually started them that week. */
  started: boolean;
  franchiseId: string;
  franchiseName: string;
  franchiseSlug: string;
  franchiseAbbreviation: string | null;
  franchiseBrandingColor: string | null;
  franchiseAvatarUrl: string | null;
}

export interface TeamOfWeekSlot {
  /** Starting-slot label from the season's roster_positions ("QB", "FLEX"...). */
  slot: string;
  /** The league-wide best eligible player for the slot, or null if nobody
   * eligible was left (a malformed week; never expected on real data). */
  player: RecapPlayer | null;
}

export interface TeamOfWeek {
  slots: TeamOfWeekSlot[];
  total: number;
  /** How many of the assembled starters were sitting on a bench. */
  benched: number;
}

// Slot label -> eligible positions for non-fixed lineup slots. Mirrors the
// solver in lib/queries/lineup-efficiency.ts, which is not exported (it
// returns only a total, and this recap needs the assignment itself).
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

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Team of the Week: the best lineup anyone could have fielded from EVERY
// rostered player in the league that week, started or benched.
// ---------------------------------------------------------------------------

/**
 * Greedy narrowest-slot-first assignment (fixed slots, then FLEX, then
 * SUPER_FLEX). Eligibility sets nest, so filling the narrow slots first never
 * costs a wider slot a better option; see bestPossibleLineup for the proof
 * sketch. Slots come back in roster_positions order, not fill order, so the
 * rendered lineup reads QB, RB, RB, WR... like a lineup card.
 *
 * Ties break toward the started player (a benched tie is not a roast), then
 * toward the earlier row, so the result is stable across calls.
 */
export function assembleTeamOfWeek(
  rosterPositions: string[] | null | undefined,
  pool: RecapPlayer[]
): TeamOfWeek | null {
  const startingSlots = deriveStartingSlots(rosterPositions);
  if (startingSlots.length === 0 || pool.length === 0) return null;

  const order = startingSlots
    .map((slot, idx) => ({ slot, idx, eligible: eligiblePositions(slot) }))
    .sort((a, b) => a.eligible.size - b.eligible.size || a.idx - b.idx);

  const used = new Set<string>();
  const assigned: (RecapPlayer | null)[] = new Array(startingSlots.length).fill(null);

  for (const { idx, eligible } of order) {
    let best: RecapPlayer | null = null;
    for (const p of pool) {
      if (used.has(p.playerId)) continue;
      if (!p.position || !eligible.has(p.position)) continue;
      if (
        !best ||
        p.points > best.points ||
        (p.points === best.points && p.started && !best.started)
      ) {
        best = p;
      }
    }
    if (best) {
      used.add(best.playerId);
      assigned[idx] = best;
    }
  }

  const slots = startingSlots.map((slot, i) => ({ slot, player: assigned[i] }));
  const total = round1(
    slots.reduce((sum, s) => sum + (s.player?.points ?? 0), 0)
  );
  const benched = slots.filter((s) => s.player && !s.player.started).length;

  return { slots, total, benched };
}

// ---------------------------------------------------------------------------
// Top performers and the dud
// ---------------------------------------------------------------------------

/** The N highest-scoring STARTED players of the week; bench heroics never
 * qualify here (they are the Team of the Week's job to expose). */
export function pickTopPerformers(pool: RecapPlayer[], n = 5): RecapPlayer[] {
  return pool
    .filter((p) => p.started)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, n));
}

// Below this projection a low score is a bye-week afterthought, not a bust.
// Same threshold lib/queries/week-standouts.ts uses for its dud starter.
export const DUD_MIN_PROJECTED = 5;

/** Lowest-scoring started player who was actually expected to produce. Falls
 * back to the lowest-scoring starter overall when nobody carries a projection
 * that high, so the slot is never empty when starters exist. */
export function pickDud(pool: RecapPlayer[]): RecapPlayer | null {
  const starters = pool.filter((p) => p.started);
  if (starters.length === 0) return null;
  const expected = starters.filter(
    (p) => (p.projectedPoints ?? 0) >= DUD_MIN_PROJECTED
  );
  const field = expected.length > 0 ? expected : starters;
  return field.reduce((worst, p) =>
    p.points < worst.points ||
    (p.points === worst.points &&
      (p.projectedPoints ?? 0) > (worst.projectedPoints ?? 0))
      ? p
      : worst
  );
}

// ---------------------------------------------------------------------------
// Headline
// ---------------------------------------------------------------------------

export interface RecapHeadlineInput {
  highestScorer: { franchiseName: string; points: number } | null;
  lowestScorer: { franchiseName: string; points: number } | null;
  biggestBlowout: { winner: string; loser: string; margin: number } | null;
  closestWin: { winner: string; loser: string; margin: number } | null;
}

/**
 * The recap's serif headline, built from the week's superlatives so it never
 * claims something the numbers do not back. Prefers the high score paired
 * with the mercy-rule loser; degrades to whichever facts exist. Copy stays
 * free of em-dashes (the hub spec forbids them).
 */
export function recapHeadline(week: number, s: RecapHeadlineInput): string {
  const high = s.highestScorer;
  const low = s.lowestScorer;
  const blowout = s.biggestBlowout;
  const close = s.closestWin;

  if (high && blowout && blowout.loser !== high.franchiseName) {
    return `${high.franchiseName} hung ${high.points.toFixed(1)}. ${blowout.loser} got run off the field by ${blowout.margin.toFixed(1)}.`;
  }
  if (high && low && low.franchiseName !== high.franchiseName) {
    return `${high.franchiseName} hung ${high.points.toFixed(1)}. ${low.franchiseName} managed ${low.points.toFixed(1)}.`;
  }
  if (high && close) {
    return `${high.franchiseName} hung ${high.points.toFixed(1)}. ${close.winner} survived by ${close.margin.toFixed(1)}.`;
  }
  if (high) {
    return `${high.franchiseName} hung ${high.points.toFixed(1)} and nobody came close.`;
  }
  if (close) {
    return `${close.winner} escaped ${close.loser} by ${close.margin.toFixed(1)}.`;
  }
  return `Week ${week} is in the books.`;
}

/** One-line verdict under the Team of the Week total. */
export function teamOfWeekVerdict(team: TeamOfWeek): string {
  if (team.benched === 0) {
    return "Every one of them was started. The league actually set its lineups.";
  }
  if (team.benched === 1) {
    return "One of them watched from the bench. Somebody owes their roster an apology.";
  }
  return `${team.benched} of them were on a bench. The league's best lineup was half asleep.`;
}
