import { db } from "@/lib/db";
import { playerWeekPoints, seasons } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { SNARKY_LABELS } from "@/lib/content";
import type { Trade } from "@/lib/queries/trades";

// ---------------------------------------------------------------------------
// Hindsight trade grades
// ---------------------------------------------------------------------------
// Retrospective, results-only grading: a side's realized value is the points
// its acquired assets (players received, plus the players its received picks
// became) actually scored WHILE ON THE ACQUIRING ROSTER after the trade. All
// inputs come from player_week_points, so every grade is a true claim; there
// is no player value model and no projection anywhere in here.
//
// Guardrails (deliberate):
// - No grade until the trade is a year old; younger trades get an ungraded
//   "early returns" message instead.
// - A year-old trade whose combined realized points are still trivial (both
//   sides under MIN_GRADABLE_POINTS) stays ungraded: a letter grade on a
//   points-less future-picks swap would be noise, not a receipt.
// - A pick flipped onward before its draft naturally contributes 0 here (its
//   "became" player never joins the flipper's roster); the flip trade itself
//   is graded on what THAT return realized.

const GRADE_MIN_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const MIN_GRADABLE_POINTS = 100;

export interface TradeSideGrade {
  rosterId: string;
  franchiseId: string | null;
  /** Points acquired assets scored for the acquirer, post-trade. */
  realizedPoints: number;
  /** The subset of realizedPoints scored in started lineup slots. */
  startedPoints: number;
  /** Letter grade (A+ .. F); null when the trade is ungraded. */
  grade: string | null;
}

export interface TradeGrade {
  graded: boolean;
  /** Overall snark label (2-team graded trades only). */
  label: string | null;
  labelTone: "positive" | "sting" | "neutral" | null;
  /** Ungraded trades: the "how it's looking" line shown instead of grades. */
  message: string | null;
  sides: TradeSideGrade[];
}

/** One player_week_points row, pre-joined to its season year. */
export interface RealizedPointsRow {
  playerId: string;
  franchiseId: string;
  seasonYear: number;
  week: number;
  points: number;
  started: boolean;
}

function fmt(n: number): string {
  return n.toFixed(1);
}

/**
 * True when a scoring week falls on or after the trade: any later season, or
 * the trade's own season from the trade week on (offseason trades, week null,
 * count the whole season).
 */
function isPostTrade(
  row: { seasonYear: number; week: number },
  trade: { seasonYear: number; week: number | null }
): boolean {
  if (row.seasonYear > trade.seasonYear) return true;
  if (row.seasonYear < trade.seasonYear) return false;
  return trade.week === null || row.week >= trade.week;
}

/** Letter from a side's share of combined realized points, scaled by side count. */
function letterGrade(share: number, sideCount: number): string {
  const r = share * sideCount; // 1.0 = exactly the even split
  if (r >= 1.44) return "A+";
  if (r >= 1.2) return "A";
  if (r >= 1.08) return "B+";
  if (r >= 0.92) return "B";
  if (r >= 0.8) return "C";
  if (r >= 0.56) return "D";
  return "F";
}

function overallLabel(
  winnerShare: number,
  combined: number
): { label: string; tone: "positive" | "sting" | "neutral" } {
  const pick =
    winnerShare >= 0.72
      ? SNARKY_LABELS.HIGHWAY_ROBBERY
      : winnerShare >= 0.6
        ? SNARKY_LABELS.FLEECE_JOB
        : winnerShare >= 0.55
          ? SNARKY_LABELS.SLIGHT_EDGE
          : combined >= 400
            ? SNARKY_LABELS.WIN_WIN
            : SNARKY_LABELS.MUTUAL_MEDIOCRITY;
  return { label: pick.displayText, tone: pick.tone };
}

/**
 * Grades one trade from realized-points rows. Pure: rows and the clock are
 * injected. `rows` may span any set of players/franchises; only rows matching
 * a side's acquired asset on the acquiring franchise, post-trade, count.
 */
export function computeTradeGrade(
  trade: Trade,
  rows: RealizedPointsRow[],
  nowMs: number
): TradeGrade {
  const sides: TradeSideGrade[] = trade.sides.map((side) => {
    const acquiredIds = new Set<string>();
    for (const p of side.players) acquiredIds.add(p.id);
    for (const pick of side.picks) {
      // Only credit a pick's player when this side held it through the draft;
      // a flipped pick's return is graded on the later trade instead.
      if (pick.became?.id && pick.flippedToTradeId === null) {
        acquiredIds.add(pick.became.id);
      }
    }

    let realizedPoints = 0;
    let startedPoints = 0;
    if (side.franchise) {
      for (const row of rows) {
        if (row.franchiseId !== side.franchise.id) continue;
        if (!acquiredIds.has(row.playerId)) continue;
        if (!isPostTrade(row, trade)) continue;
        realizedPoints += row.points;
        if (row.started) startedPoints += row.points;
      }
    }

    return {
      rosterId: side.rosterId,
      franchiseId: side.franchise?.id ?? null,
      realizedPoints,
      startedPoints,
      grade: null,
    };
  });

  const combined = sides.reduce((sum, s) => sum + s.realizedPoints, 0);
  const oldEnough =
    trade.createdAtMs !== null && nowMs - trade.createdAtMs >= GRADE_MIN_AGE_MS;

  if (!oldEnough) {
    const withPoints = sides.filter((s) => s.realizedPoints > 0);
    const message =
      withPoints.length === 0
        ? "Too fresh to grade. The receipts need a year to age."
        : `Too fresh to grade; the receipts need a year to age. Early returns: ${sides
            .map(
              (s) =>
                `${nameOf(trade, s.rosterId)} ${fmt(s.realizedPoints)} pts realized`
            )
            .join(", ")}.`;
    return { graded: false, label: null, labelTone: null, message, sides };
  }

  if (combined < MIN_GRADABLE_POINTS) {
    return {
      graded: false,
      label: null,
      labelTone: null,
      message: `A year on and barely ${fmt(combined)} combined points realized. The jury is still deliberating this one.`,
      sides,
    };
  }

  for (const s of sides) {
    s.grade = letterGrade(s.realizedPoints / combined, sides.length);
  }

  if (sides.length === 2) {
    const winnerShare =
      Math.max(sides[0].realizedPoints, sides[1].realizedPoints) / combined;
    const { label, tone } = overallLabel(winnerShare, combined);
    return { graded: true, label, labelTone: tone, message: null, sides };
  }

  return { graded: true, label: null, labelTone: null, message: null, sides };
}

function nameOf(trade: Trade, rosterId: string): string {
  const side = trade.sides.find((s) => s.rosterId === rosterId);
  return side?.franchise?.name ?? "Unknown Team";
}

/**
 * Computes a hindsight grade for every trade, keyed by trade id. One batched
 * player_week_points fetch covers all acquired assets across all trades.
 * Never throws: on any DB error it returns an empty map and the trades page
 * renders without grades.
 */
export async function getTradeGrades(
  trades: Trade[]
): Promise<Map<number, TradeGrade>> {
  const grades = new Map<number, TradeGrade>();
  if (trades.length === 0) return grades;

  try {
    const playerIds = new Set<string>();
    for (const trade of trades) {
      for (const side of trade.sides) {
        for (const p of side.players) playerIds.add(p.id);
        for (const pick of side.picks) {
          if (pick.became?.id) playerIds.add(pick.became.id);
        }
      }
    }

    let rows: RealizedPointsRow[] = [];
    if (playerIds.size > 0) {
      const seasonRows = await db
        .select({ id: seasons.id, seasonYear: seasons.seasonYear })
        .from(seasons);
      const yearBySeasonId = new Map(seasonRows.map((s) => [s.id, s.seasonYear]));

      const pointRows = await db
        .select({
          playerId: playerWeekPoints.playerId,
          franchiseId: playerWeekPoints.franchiseId,
          seasonId: playerWeekPoints.seasonId,
          week: playerWeekPoints.week,
          points: playerWeekPoints.points,
          started: playerWeekPoints.started,
        })
        .from(playerWeekPoints)
        .where(inArray(playerWeekPoints.playerId, Array.from(playerIds)));

      rows = pointRows.flatMap((r) => {
        const seasonYear = yearBySeasonId.get(r.seasonId);
        if (seasonYear === undefined) return [];
        return [
          {
            playerId: r.playerId,
            franchiseId: r.franchiseId,
            seasonYear,
            week: r.week,
            points: r.points,
            started: r.started,
          },
        ];
      });
    }

    const nowMs = Date.now();
    for (const trade of trades) {
      grades.set(trade.id, computeTradeGrade(trade, rows, nowMs));
    }
  } catch (e) {
    console.error("[trade-grades] getTradeGrades error:", e);
  }

  return grades;
}
