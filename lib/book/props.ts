// The Book: the props pricing and grading engine.
//
// Pure math, no I/O, no database. Mirrors lib/book/pricing.ts's discipline:
// everything the Props tab shows and everything the Tuesday grading pass
// writes comes from here, so generation, repricing, and grading can never
// quietly disagree.
//
// The three weekly props (issue #224):
//   1. League Total    - O/U on the combined projected points of every
//                         starting lineup in the league.
//   2. Ceiling Watch    - YES/NO on whether anyone clears a scoring threshold.
//   3. The Mercy Line   - O/U on the week's biggest projected favorite's
//                         margin of victory.
//
// House conventions carried over from pricing.ts:
//  - A real-number LINE is always a half-integer (x.5), never a whole number,
//    so a push is impossible by construction. Ceiling Watch is the exception
//    the issue calls out: it is a YES/NO bet, so its stored "line" is the
//    plain scoring threshold, not a magnitude to straddle.
//  - Where a probability is actually modelled, it goes through pricing.ts's
//    `americanOdds` so every number in The Book prices its vig the same way.

import { americanOdds, SPREAD_ODDS } from "@/lib/book/pricing";

export type PropKind = "league_total" | "ceiling_watch" | "mercy_line";
export type PropSide = "over" | "under";
export type PropResult = "over" | "under";

/**
 * Rounds a non-negative magnitude onto the half-integer grid: the same hook
 * priceSpread uses, extracted here because both the League Total and the
 * Mercy Line need it and neither is a "spread" in pricing.ts's sense (there is
 * no home/away side to sign). Never returns a whole number.
 */
export function toHalfInteger(value: number): number {
  return Math.round(value - 0.5) + 0.5;
}

// ---------------------------------------------------------------------------
// Prop 1: League Total
// ---------------------------------------------------------------------------

/** Fixed per issue #224 ("odds -115/-105 per design"). */
export const LEAGUE_TOTAL_OVER_ODDS = -115;
export const LEAGUE_TOTAL_UNDER_ODDS = -105;

export interface LeagueTotalPrice {
  line: number;
  overOdds: number;
  underOdds: number;
}

/**
 * Prices the League Total: the line is the combined projected starter total
 * across every roster, rounded onto the half-integer grid. The odds are a
 * flat -115/-105 split rather than a modelled probability: a sum this
 * aggregated is close to a true coin flip by construction (independent
 * per-roster projection error averages out across twelve lineups), so
 * inventing a distribution for it would be modelling noise, not signal.
 */
export function priceLeagueTotal(projectedTotals: number[]): LeagueTotalPrice {
  const sum = projectedTotals.reduce((a, b) => a + b, 0);
  return {
    line: toHalfInteger(sum),
    overOdds: LEAGUE_TOTAL_OVER_ODDS,
    underOdds: LEAGUE_TOTAL_UNDER_ODDS,
  };
}

/** Never a push: the line is always a half-integer. */
export function gradeLeagueTotal(actualTotal: number, line: number): PropResult {
  return actualTotal > line ? "over" : "under";
}

// ---------------------------------------------------------------------------
// Prop 2: Ceiling Watch
// ---------------------------------------------------------------------------

/**
 * Growth rate of a single team's own scoring uncertainty with its projection.
 * Same shape as win-probability.ts's UNCERTAINTY_SCALE (scale * sqrt(points))
 * but kept independent: that model estimates the spread of a MARGIN between
 * two teams, this one estimates the spread of ONE team's score against a
 * fixed threshold, which is a different quantity with different history to
 * calibrate against.
 */
const SCORE_UNCERTAINTY_SCALE = 2.1;

/** Used only when there is not enough history to trust a real percentile. */
export const DEFAULT_CEILING_THRESHOLD = 150;
const MIN_HISTORY_FOR_THRESHOLD = 20;

/** Standard normal CDF via the Abramowitz-Stegun erf approximation (~1e-7 max error). */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
    t;
  const y = 1 - poly * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * P(one team, projected for `projected` points, scores over `threshold`).
 * Treats the team's final score as approximately Normal around its
 * projection, with uncertainty growing with the size of the projection: a
 * 90-point roster's ceiling is a lot less volatile in absolute terms than a
 * 160-point one's.
 */
function probOverThreshold(projected: number, threshold: number): number {
  const sigma = SCORE_UNCERTAINTY_SCALE * Math.sqrt(Math.max(projected, 1));
  return 1 - normalCdf((threshold - projected) / sigma);
}

/**
 * P(at least one of these teams clears the threshold) — a Poisson-ish "any of
 * N independent trials" fold over each team's own probability, per the issue.
 * Fantasy scores are not truly independent (a shared bye week, weather on a
 * whole slate), but nothing in this league's data models that correlation,
 * and the trash-talk stakes do not need it to.
 */
export function probAnyoneOverThreshold(
  projectedTotals: number[],
  threshold: number,
): number {
  const probNoneOver = projectedTotals.reduce(
    (acc, p) => acc * (1 - probOverThreshold(p, threshold)),
    1,
  );
  return 1 - probNoneOver;
}

export interface CeilingWatchPrice {
  threshold: number;
  overOdds: number;
  underOdds: number;
}

/** Prices Ceiling Watch from the modelled YES probability, vig included via americanOdds. */
export function priceCeilingWatch(
  projectedTotals: number[],
  threshold: number,
): CeilingWatchPrice {
  const probYes = probAnyoneOverThreshold(projectedTotals, threshold);
  return {
    threshold,
    overOdds: americanOdds(probYes),
    underOdds: americanOdds(1 - probYes),
  };
}

/**
 * Picks the week's ceiling threshold from the league's own history: the
 * trailing-two-seasons P95 of weekly team scores, rounded to the nearest 10.
 * Falls back to 150 (documented default, issue #224) when there is not
 * enough history yet to trust a percentile — a young league, or the very
 * first props ever generated.
 */
export function chooseCeilingThreshold(historicalScores: number[]): number {
  if (historicalScores.length < MIN_HISTORY_FOR_THRESHOLD) {
    return DEFAULT_CEILING_THRESHOLD;
  }
  const sorted = [...historicalScores].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
  return Math.round(sorted[idx] / 10) * 10;
}

/** YES ("over") when the week's highest team score clears the threshold. */
export function gradeCeilingWatch(maxScore: number, threshold: number): PropResult {
  return maxScore >= threshold ? "over" : "under";
}

// ---------------------------------------------------------------------------
// Prop 3: The Mercy Line
// ---------------------------------------------------------------------------

export interface MercyLinePrice {
  line: number;
}

/**
 * Prices the Mercy Line: the line is the week's biggest projected favorite's
 * projected margin, rounded onto the half-integer grid. Odds reuse the
 * house's flat spread juice (pricing.ts's SPREAD_ODDS): a margin-of-victory
 * bet is a spread bet in every way that matters to the vig, so it gets the
 * same one rather than a bespoke model.
 */
export function priceMercyLine(
  favoriteProjected: number,
  dogProjected: number,
): MercyLinePrice {
  return { line: toHalfInteger(Math.abs(favoriteProjected - dogProjected)) };
}

export const MERCY_LINE_OVER_ODDS = SPREAD_ODDS;
export const MERCY_LINE_UNDER_ODDS = SPREAD_ODDS;

/** Never a push: the line is always a half-integer. */
export function gradeMercyLine(actualMargin: number, line: number): PropResult {
  return actualMargin > line ? "over" : "under";
}

// ---------------------------------------------------------------------------
// Finding the week's biggest projected favorite (feeds the Mercy Line)
// ---------------------------------------------------------------------------

export interface ProjectedPairing {
  matchupId: number;
  rosterA: string;
  rosterB: string;
  projA: number;
  projB: number;
}

export interface BiggestFavorite {
  matchupId: number;
  favoriteRosterId: string;
  dogRosterId: string;
  favoriteProjected: number;
  dogProjected: number;
}

/**
 * The week's most lopsided pairing by projected margin — what the Mercy Line
 * prices and what its card copy names as "the projected doormat". An exact
 * tie for the widest margin resolves to whichever pairing appeared first in
 * the input, a predictable choice for something this rare.
 */
export function findBiggestFavorite(
  pairings: ProjectedPairing[],
): BiggestFavorite | null {
  let best: BiggestFavorite | null = null;
  let bestMargin = -Infinity;

  for (const p of pairings) {
    const margin = Math.abs(p.projA - p.projB);
    if (margin <= bestMargin) continue;
    bestMargin = margin;
    best =
      p.projA >= p.projB
        ? {
            matchupId: p.matchupId,
            favoriteRosterId: p.rosterA,
            dogRosterId: p.rosterB,
            favoriteProjected: p.projA,
            dogProjected: p.projB,
          }
        : {
            matchupId: p.matchupId,
            favoriteRosterId: p.rosterB,
            dogRosterId: p.rosterA,
            favoriteProjected: p.projB,
            dogProjected: p.projA,
          };
  }

  return best;
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/** "O/U 1,178.5" - thousands-separated, one decimal always shown. */
export function formatOverUnderLine(line: number): string {
  return `O/U ${line.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}`;
}

/** The over/under button labels for one prop kind ("Over"/"Under" or "Yes"/"No"). */
export function propSideLabels(kind: PropKind): { over: string; under: string } {
  return kind === "ceiling_watch"
    ? { over: "Yes", under: "No" }
    : { over: "Over", under: "Under" };
}

/** The line as the Props tab displays it ("O/U 1,178.5" or "YES / NO"). */
export function formatPropLine(kind: PropKind, line: number): string {
  return kind === "ceiling_watch" ? "YES / NO" : formatOverUnderLine(line);
}
