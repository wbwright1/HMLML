import { db } from "@/lib/db";
import { playerWeekPoints, seasons, matchups } from "@/lib/db/schema";
import { eq, inArray, ne, sql } from "drizzle-orm";
import { SNARKY_LABELS } from "@/lib/content";
import type { Trade, PickAsset } from "@/lib/queries/trades";
import { getLatestValues, pickAssetToValueId } from "@/lib/queries/player-values";

// ---------------------------------------------------------------------------
// Hindsight trade grades
// ---------------------------------------------------------------------------
// Three lenses grade the SAME acquired-asset set per side, then blend into
// one letter:
// (1) Realized points [the primary anchor]: points its acquired assets
//     (players received, plus the players its received picks became)
//     actually scored WHILE ON THE ACQUIRING ROSTER after the trade. Sourced
//     from player_week_points; a true claim, never a projection.
// (2) Current market value [the market's hindsight verdict, NOT a
//     projection]: today's dynasty value of the same acquired assets (a kept,
//     undrafted pick is valued by its pseudo-id). Sourced from player_values.
// (3) Wins-impact [separates win-now from win-later]: post-trade weeks the
//     acquirer won where the acquired assets' started points exceeded the
//     victory margin ("swung" the win), weighted 2x when the week was a
//     playoff week.
//
// The base blend weights (points 45 / value 35 / wins 20) renormalize toward
// points-only as a lens loses data: no value data (or thin coverage) drops
// the value weight to zero and rescales the rest; no matchup data does the
// same for wins. Missing values impute 0 for that asset AND shrink value
// coverage; a lens never unlocks or overrides a gate below. With both lenses
// absent, output is byte-identical to points-only grading.
//
// Guardrails (deliberate, points-only, unaffected by value/wins data):
// - A kept pick whose rookie class hasn't seen the field yet (draft season
//   later than any season with played games) blocks the grade INDEFINITELY,
//   even past the year mark; grading an unseen rookie as a zero is a lie.
// - Otherwise a trade grades at a year old, or EARLIER when every asset has
//   about six games of evidence: each acquired player has 6+ post-trade
//   played weeks, and each kept pick's drafted player has 6+ played weeks.
// - Trades still short of both bars get an ungraded "early returns" message.
// - A gradable trade whose combined realized points are still trivial (both
//   sides under MIN_GRADABLE_POINTS) stays ungraded: a letter grade on a
//   points-less swap would be noise, not a receipt.
// - A flipped pick is NOT a dud: it earns diluted flip-chain credit, in all
//   three lenses. If a side flipped a pick into trade T2, that pick
//   contributes 1/k of the side's value IN T2 (k = assets the side gave up
//   in T2), and that value itself includes T2's own flip credits, so
//   multi-hop chains (pick -> pick -> Omarion Hampton) flow back
//   proportionally. Flipped picks never block grading; the full haul is
//   graded on the flip trade.
// - "Played" means a week with nonzero points: pre-season default lineups
//   write phantom zero-point rows (e.g. 2026), which must not count as
//   evidence that a player has seen the field.

const GRADE_MIN_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const MIN_GRADABLE_POINTS = 100;
const MIN_EVIDENCE_WEEKS = 6;
const COVERAGE_FLOOR = 0.5;
const PLAYOFF_WEIGHT = 2;
const BASE_WEIGHT_POINTS = 0.45;
const BASE_WEIGHT_VALUE = 0.35;
const BASE_WEIGHT_WINS = 0.2;

/** A post-trade won matchup week for one franchise: margin over the loser. */
export interface MatchupResult {
  isWinner: boolean;
  isPlayoff: boolean;
  margin: number | null;
}

export interface TradeSideGrade {
  rosterId: string;
  franchiseId: string | null;
  /**
   * Points acquired assets scored for the acquirer, post-trade, INCLUDING
   * diluted flip-chain credit for picks traded onward.
   */
  realizedPoints: number;
  /** Direct points scored in started lineup slots (no flip credit). */
  startedPoints: number;
  /** The flip-chain-credit portion of realizedPoints. */
  flipCreditPoints: number;
  /** Current market value of the acquired assets, INCLUDING flip credit. */
  valueNow: number;
  /** Direct (no flip credit) count of post-trade won weeks the side swung. */
  winsSwung: number;
  /** Direct (no flip credit) count of swung weeks that were playoff weeks. */
  playoffWinsSwung: number;
  /** Playoff-weighted swung-win total, INCLUDING flip credit. */
  weightedWinsImpact: number;
  /** This side's share of the trade's combined realized points. */
  pointsShare: number;
  /** This side's share of the trade's combined current market value. */
  valueShare: number;
  /** This side's share of the trade's combined weighted wins impact. */
  winsShare: number;
  /** Blend of the three lens shares; null when the trade is ungraded. */
  blendedShare: number | null;
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

/**
 * Distinct weeks in which a player actually played (nonzero points, any
 * roster), optionally restricted to weeks after a trade. Zero-point rows are
 * excluded: preseason default lineups write phantom rows for games that were
 * never played.
 */
function playedWeekCount(
  rows: RealizedPointsRow[],
  playerId: string,
  postTradeOf: Trade | null
): number {
  const weeks = new Set<string>();
  for (const row of rows) {
    if (row.playerId !== playerId || row.points === 0) continue;
    if (postTradeOf && !isPostTrade(row, postTradeOf)) continue;
    weeks.add(`${row.seasonYear}:${row.week}`);
  }
  return weeks.size;
}

/** The most recent season with any actually-played (nonzero) week. */
function latestPlayedSeasonYear(rows: RealizedPointsRow[]): number {
  let latest = 0;
  for (const row of rows) {
    if (row.points !== 0 && row.seasonYear > latest) latest = row.seasonYear;
  }
  return latest;
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

type TradeSideAssets = Trade["sides"][number];

interface SideValue {
  /** Total realized: direct points + flip-chain credit. */
  realized: number;
  /** Direct started-slot points only. */
  started: number;
  /** The flip-chain-credit portion of `realized`. */
  flipCredit: number;
  /** Current market value of acquired assets, INCLUDING flip credit. */
  valueAcquired: number;
  /** Acquired value-slots (players + kept picks + flipped picks). */
  valueAssetCount: number;
  /** Of `valueAssetCount`, how many resolved to a known value/flip target. */
  valueCoveredCount: number;
  /** The flip-chain-credit portion of `valueAcquired`. */
  valueFlipCredit: number;
  /** Playoff-weighted swung-win total, INCLUDING flip credit. */
  weightedWinsImpact: number;
  /** Direct (no flip credit) swung-win count. */
  winsSwungDirect: number;
  /** Direct (no flip credit) playoff swung-win count. */
  playoffWinsSwungDirect: number;
  /** The flip-chain-credit portion of `weightedWinsImpact`. */
  winsFlipCredit: number;
}

/**
 * Resolves the value-map id a kept (non-flipped) pick's slot should look up:
 * the id of the player it became, or (if not yet drafted) the pick's
 * FantasyCalc pseudo-id. Null when neither resolves (e.g. drafted but the
 * resulting player is unknown, or the pseudo-id inputs are malformed).
 */
function keptPickValueId(pick: PickAsset): string | null {
  if (pick.became === null) return pickAssetToValueId(pick);
  return pick.became.id ?? null;
}

/**
 * Grades every trade at once from realized-points rows, plus optional
 * current-value and post-trade-matchup data for the value and wins-impact
 * lenses. Pure: rows, values, matchups, and the clock are all injected.
 * Pass the FULL trade list, even when only a subset will be displayed:
 * flip-chain credit (in all three lenses) follows `flippedToTradeId` into
 * other trades, and a missing target silently earns 0 credit.
 * `latestPlayedSeason` is the league-wide most recent season with played
 * games (pass it explicitly; deriving it from `rows` alone under-counts when
 * rows cover only a filtered subset of players), falling back to the rows.
 * `values` and `matchups` default to empty, which grades points-only,
 * byte-identical to omitting them.
 */
export function computeTradeGrades(
  trades: Trade[],
  rows: RealizedPointsRow[],
  nowMs: number,
  latestPlayedSeason?: number,
  values: Map<string, number> = new Map(),
  matchups: Map<string, MatchupResult> = new Map()
): Map<number, TradeGrade> {
  const tradeById = new Map(trades.map((t) => [t.id, t]));
  const latestPlayed = latestPlayedSeason ?? latestPlayedSeasonYear(rows);
  const memo = new Map<string, SideValue>();

  function directValue(
    trade: Trade,
    side: TradeSideAssets
  ): {
    realized: number;
    started: number;
    valueSum: number;
    valueAssetCount: number;
    valueCoveredCount: number;
    weightedWinsImpact: number;
    winsSwungDirect: number;
    playoffWinsSwungDirect: number;
  } {
    const acquiredIds = new Set<string>();
    for (const p of side.players) acquiredIds.add(p.id);
    for (const pick of side.picks) {
      // A pick's player counts only when this side held it through the draft;
      // a flipped pick earns chain credit below instead.
      if (pick.became?.id && pick.flippedToTradeId === null) {
        acquiredIds.add(pick.became.id);
      }
    }

    let realized = 0;
    let started = 0;
    const startedByWeek = new Map<string, number>();
    if (side.franchise) {
      for (const row of rows) {
        if (row.franchiseId !== side.franchise.id) continue;
        if (!acquiredIds.has(row.playerId)) continue;
        if (!isPostTrade(row, trade)) continue;
        realized += row.points;
        if (row.started) {
          started += row.points;
          const weekKey = `${row.seasonYear}:${row.week}`;
          startedByWeek.set(weekKey, (startedByWeek.get(weekKey) ?? 0) + row.points);
        }
      }
    }

    // Value lens: same asset set as points, PLUS kept picks not yet drafted
    // (valued at their pseudo-id; points has nothing to credit there yet).
    let valueSum = 0;
    let valueAssetCount = 0;
    let valueCoveredCount = 0;
    for (const p of side.players) {
      valueAssetCount++;
      const v = values.get(p.id);
      if (v !== undefined) {
        valueSum += v;
        valueCoveredCount++;
      }
    }
    for (const pick of side.picks) {
      if (pick.flippedToTradeId !== null) continue; // counted as a flip slot below
      valueAssetCount++;
      const valueId = keptPickValueId(pick);
      const v = valueId ? values.get(valueId) : undefined;
      if (v !== undefined) {
        valueSum += v;
        valueCoveredCount++;
      }
    }

    // Wins-impact lens: post-trade weeks the franchise won where the
    // acquired assets' started points strictly exceeded the victory margin.
    let weightedWinsImpact = 0;
    let winsSwungDirect = 0;
    let playoffWinsSwungDirect = 0;
    if (side.franchise) {
      for (const [weekKey, startedSum] of startedByWeek) {
        const result = matchups.get(`${weekKey}:${side.franchise.id}`);
        if (!result || !result.isWinner) continue;
        if (result.margin === null || result.margin <= 0) continue;
        if (startedSum <= result.margin) continue;
        const impact = result.isPlayoff ? PLAYOFF_WEIGHT : 1;
        weightedWinsImpact += impact;
        winsSwungDirect++;
        if (result.isPlayoff) playoffWinsSwungDirect++;
      }
    }

    return {
      realized,
      started,
      valueSum,
      valueAssetCount,
      valueCoveredCount,
      weightedWinsImpact,
      winsSwungDirect,
      playoffWinsSwungDirect,
    };
  }

  function sideValue(
    trade: Trade,
    side: TradeSideAssets,
    stack: Set<string>
  ): SideValue {
    const key = `${trade.id}:${side.rosterId}`;
    const memoized = memo.get(key);
    if (memoized) return memoized;
    if (stack.has(key)) {
      return {
        realized: 0,
        started: 0,
        flipCredit: 0,
        valueAcquired: 0,
        valueAssetCount: 0,
        valueCoveredCount: 0,
        valueFlipCredit: 0,
        weightedWinsImpact: 0,
        winsSwungDirect: 0,
        playoffWinsSwungDirect: 0,
        winsFlipCredit: 0,
      };
    }
    stack.add(key);

    const direct = directValue(trade, side);
    let flipCredit = 0;
    let valueFlipCredit = 0;
    let winsFlipCredit = 0;
    let flipAssetCount = 0;
    let flipCoveredCount = 0;
    for (const pick of side.picks) {
      if (pick.flippedToTradeId === null) continue;
      flipAssetCount++;
      const flipTrade = tradeById.get(pick.flippedToTradeId);
      if (!flipTrade) continue;
      const flipSide = flipTrade.sides.find((s) =>
        side.franchise && s.franchise
          ? s.franchise.id === side.franchise.id
          : s.rosterId === side.rosterId
      );
      if (!flipSide) continue;
      flipCoveredCount++;
      // The flipped pick was one of k assets paid in the flip trade, so it
      // earns 1/k of that side's total value there (which already includes
      // the flip trade's own downstream flip credits), in every lens.
      const v = sideValue(flipTrade, flipSide, stack);
      const denom = Math.max(1, flipSide.gaveAssetCount);
      flipCredit += v.realized / denom;
      valueFlipCredit += v.valueAcquired / denom;
      winsFlipCredit += v.weightedWinsImpact / denom;
    }

    stack.delete(key);
    const value: SideValue = {
      realized: direct.realized + flipCredit,
      started: direct.started,
      flipCredit,
      valueAcquired: direct.valueSum + valueFlipCredit,
      valueAssetCount: direct.valueAssetCount + flipAssetCount,
      valueCoveredCount: direct.valueCoveredCount + flipCoveredCount,
      valueFlipCredit,
      weightedWinsImpact: direct.weightedWinsImpact + winsFlipCredit,
      winsSwungDirect: direct.winsSwungDirect,
      playoffWinsSwungDirect: direct.playoffWinsSwungDirect,
      winsFlipCredit,
    };
    memo.set(key, value);
    return value;
  }

  const grades = new Map<number, TradeGrade>();
  for (const trade of trades) {
    const sideValues = trade.sides.map((side) => sideValue(trade, side, new Set()));
    const sides: TradeSideGrade[] = trade.sides.map((side, i) => {
      const v = sideValues[i];
      return {
        rosterId: side.rosterId,
        franchiseId: side.franchise?.id ?? null,
        realizedPoints: v.realized,
        startedPoints: v.started,
        flipCreditPoints: v.flipCredit,
        valueNow: v.valueAcquired,
        winsSwung: v.winsSwungDirect,
        playoffWinsSwung: v.playoffWinsSwungDirect,
        weightedWinsImpact: v.weightedWinsImpact,
        pointsShare: 0,
        valueShare: 0,
        winsShare: 0,
        blendedShare: null,
        grade: null,
      };
    });
    grades.set(
      trade.id,
      gradeFromSides(trade, sides, sideValues, rows, nowMs, latestPlayed)
    );
  }
  return grades;
}

/** Single-trade convenience wrapper: no cross-trade flip credit resolvable. */
export function computeTradeGrade(
  trade: Trade,
  rows: RealizedPointsRow[],
  nowMs: number,
  latestPlayedSeason?: number,
  values?: Map<string, number>,
  matchups?: Map<string, MatchupResult>
): TradeGrade {
  const grade = computeTradeGrades(
    [trade],
    rows,
    nowMs,
    latestPlayedSeason,
    values,
    matchups
  ).get(trade.id);
  if (!grade) throw new Error(`no grade computed for trade ${trade.id}`);
  return grade;
}

function gradeFromSides(
  trade: Trade,
  sides: TradeSideGrade[],
  sideValues: SideValue[],
  rows: RealizedPointsRow[],
  nowMs: number,
  latestPlayed: number
): TradeGrade {
  const combined = sides.reduce((sum, s) => sum + s.realizedPoints, 0);
  const ungraded = (message: string): TradeGrade => ({
    graded: false,
    label: null,
    labelTone: null,
    message,
    sides,
  });
  const earlyReturns =
    combined === 0
      ? ""
      : ` Early returns: ${sides
          .map(
            (s) =>
              `${nameOf(trade, s.rosterId)} ${fmt(s.realizedPoints)} pts realized`
          )
          .join(", ")}.`;

  // A kept pick from a rookie class that hasn't played blocks indefinitely.
  const hasUnseenPick = trade.sides.some((side) =>
    side.picks.some(
      (p) => p.flippedToTradeId === null && Number(p.season) > latestPlayed
    )
  );
  if (hasUnseenPick) {
    return ungraded(
      `No grade yet: a pick in this deal is waiting on a rookie class that hasn't seen the field.${earlyReturns}`
    );
  }

  // Gradable at a year old, or earlier once every asset has ~6 games of
  // evidence: acquired players post-trade, kept picks' draftees career-wide.
  const oldEnough =
    trade.createdAtMs !== null && nowMs - trade.createdAtMs >= GRADE_MIN_AGE_MS;
  const matured =
    oldEnough ||
    (trade.createdAtMs !== null &&
      trade.sides.every(
        (side) =>
          side.players.every(
            (p) => playedWeekCount(rows, p.id, trade) >= MIN_EVIDENCE_WEEKS
          ) &&
          side.picks.every(
            (pick) =>
              pick.flippedToTradeId !== null ||
              pick.became?.id === undefined ||
              pick.became?.id === null ||
              playedWeekCount(rows, pick.became.id, null) >= MIN_EVIDENCE_WEEKS
          )
      ));

  if (!matured) {
    return ungraded(
      `Too fresh to grade. Grades print once the receipts cover about six games or the deal turns a year old.${earlyReturns}`
    );
  }

  if (combined < MIN_GRADABLE_POINTS) {
    return ungraded(
      `Barely ${fmt(combined)} combined points realized so far. The jury is still deliberating this one.`
    );
  }

  // Blend the three lenses. Base weights renormalize (a_v/a_w drop a lens
  // to zero, then D rescales the rest) so a missing lens never changes the
  // OTHER lenses' relative pull, and both-absent reduces to points-only.
  const valueAssetTotal = sideValues.reduce((sum, v) => sum + v.valueAssetCount, 0);
  const valueCoveredTotal = sideValues.reduce(
    (sum, v) => sum + v.valueCoveredCount,
    0
  );
  const coverageFraction =
    valueAssetTotal > 0 ? valueCoveredTotal / valueAssetTotal : 0;
  const valueSum = sideValues.reduce((sum, v) => sum + v.valueAcquired, 0);
  const a_v = coverageFraction >= COVERAGE_FLOOR && valueSum > 0 ? coverageFraction : 0;

  const winsSum = sideValues.reduce((sum, v) => sum + v.weightedWinsImpact, 0);
  const a_w = winsSum > 0 ? 1 : 0;

  const weightSum =
    BASE_WEIGHT_POINTS + BASE_WEIGHT_VALUE * a_v + BASE_WEIGHT_WINS * a_w;
  const w_p = BASE_WEIGHT_POINTS / weightSum;
  const w_v = (BASE_WEIGHT_VALUE * a_v) / weightSum;
  const w_w = (BASE_WEIGHT_WINS * a_w) / weightSum;

  sides.forEach((s, i) => {
    const v = sideValues[i];
    const pointsShare = s.realizedPoints / combined;
    const valueShare = a_v > 0 ? v.valueAcquired / valueSum : 0;
    const winsShare = a_w > 0 ? v.weightedWinsImpact / winsSum : 0;
    const blendedShare = w_p * pointsShare + w_v * valueShare + w_w * winsShare;
    s.pointsShare = pointsShare;
    s.valueShare = valueShare;
    s.winsShare = winsShare;
    s.blendedShare = blendedShare;
    s.grade = letterGrade(blendedShare, sides.length);
  });

  if (sides.length === 2) {
    const winnerShare = Math.max(sides[0].blendedShare!, sides[1].blendedShare!);
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
 * Pass the UNFILTERED getTrades() result: flip-chain credit needs the later
 * trades a filtered view would omit (see filterTrades in lib/queries/trades).
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

    // League-wide latest season with actually-played (nonzero) weeks: the
    // reference point for "this rookie class hasn't seen the field yet".
    const [latestPlayedRow] = await db
      .select({ year: sql<number | null>`max(${seasons.seasonYear})` })
      .from(playerWeekPoints)
      .innerJoin(seasons, eq(playerWeekPoints.seasonId, seasons.id))
      .where(ne(playerWeekPoints.points, 0));
    const latestPlayedSeason = latestPlayedRow?.year ?? 0;

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

    // Value lens: current value of every asset the points lens can credit,
    // plus kept-but-undrafted picks (valued at their pseudo-id). A failure
    // here degrades only the value lens; it never blocks points grading.
    let values = new Map<string, number>();
    try {
      const valueIds = new Set<string>();
      for (const trade of trades) {
        for (const side of trade.sides) {
          for (const p of side.players) valueIds.add(p.id);
          for (const pick of side.picks) {
            if (pick.flippedToTradeId !== null) continue;
            const valueId = keptPickValueId(pick);
            if (valueId) valueIds.add(valueId);
          }
        }
      }
      if (valueIds.size > 0) {
        const assetValues = await getLatestValues(Array.from(valueIds));
        for (const [id, av] of assetValues) values.set(id, av.value);
      }
    } catch (e) {
      console.error("[trade-grades] value fetch error:", e);
      values = new Map();
    }

    // Wins-impact lens: post-trade won matchup weeks per involved franchise,
    // with margin derived by pairing the two sides of each matchup. A
    // failure here degrades only the wins lens.
    let matchupResults = new Map<string, MatchupResult>();
    try {
      const franchiseIds = new Set<string>();
      for (const trade of trades) {
        for (const side of trade.sides) {
          if (side.franchise) franchiseIds.add(side.franchise.id);
        }
      }
      if (franchiseIds.size > 0) {
        const matchupRows = await db
          .select({
            seasonYear: seasons.seasonYear,
            week: matchups.week,
            matchupId: matchups.matchupId,
            franchiseId: matchups.franchiseId,
            points: matchups.points,
            isWinner: matchups.isWinner,
            isPlayoff: matchups.isPlayoff,
          })
          .from(matchups)
          .innerJoin(seasons, eq(matchups.seasonId, seasons.id))
          .where(inArray(matchups.franchiseId, Array.from(franchiseIds)));

        const groups = new Map<string, typeof matchupRows>();
        for (const row of matchupRows) {
          const groupKey = `${row.seasonYear}:${row.week}:${row.matchupId}`;
          const group = groups.get(groupKey);
          if (group) group.push(row);
          else groups.set(groupKey, [row]);
        }
        for (const group of groups.values()) {
          for (const row of group) {
            if (!row.isWinner) continue;
            const opponent = group.find((r) => r.franchiseId !== row.franchiseId);
            if (!opponent) continue;
            const margin = (row.points ?? 0) - (opponent.points ?? 0);
            if (margin <= 0) continue;
            matchupResults.set(`${row.seasonYear}:${row.week}:${row.franchiseId}`, {
              isWinner: true,
              isPlayoff: row.isPlayoff ?? false,
              margin,
            });
          }
        }
      }
    } catch (e) {
      console.error("[trade-grades] matchups fetch error:", e);
      matchupResults = new Map();
    }

    return computeTradeGrades(
      trades,
      rows,
      Date.now(),
      latestPlayedSeason,
      values,
      matchupResults
    );
  } catch (e) {
    console.error("[trade-grades] getTradeGrades error:", e);
  }

  return grades;
}
