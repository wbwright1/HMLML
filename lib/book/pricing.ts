// The Book: the pricing engine.
//
// Pure math, no I/O, no database, no Sleeper. Everything the sportsbook shows
// (spread, moneylines, payouts, cover results) comes from here so the hourly
// repricing job, the board, and any future grading pass all agree to the cent.
//
// House conventions, decided once and documented here because every consumer
// depends on them:
//
//  - "home" is the LOWER roster_id of the pairing. Fantasy has no venue, so the
//    label is arbitrary; pinning it to roster_id makes a pairing price the same
//    way on every run and lets the stored spread carry a stable sign.
//  - `spread` is always from the home side's perspective. Negative means home
//    is favored (home must win by more than that many points).
//  - The spread is a multiple of 0.5 and NEVER exactly 0, so a push is
//    impossible by construction and no grading path needs a "tie" branch.
//  - Moneylines are American odds. Spreads pay a flat -110 per side.
//
// Nothing here is denominated in real money. The league bets friendly dollars.

import { computeWinProbability } from "@/lib/win-probability";

/** Every spread bet pays the same flat juice. */
export const SPREAD_ODDS = -110;

/**
 * Per-side overround ("vig"). Each side's fair probability is inflated by this
 * factor before conversion, which is what makes the two moneylines add up to
 * more than 100% implied probability, exactly like a real book.
 */
export const OVERROUND = 1.045;

/** Favorites never price lighter than this (magnitude floor for negatives). */
export const MIN_FAVORITE_ODDS = -105;

/** Underdogs never price shorter than this. */
export const MIN_UNDERDOG_ODDS = 100;

/**
 * Implied probability is clamped below 1 before the odds conversion. The win
 * probability model already clamps to [0.01, 0.99]; multiplying 0.99 by the
 * overround would push past certainty and divide by a negative.
 */
const MAX_IMPLIED_PROB = 0.97;
const MIN_IMPLIED_PROB = 0.01;

export interface BookPrice {
  /** Home perspective, multiple of 0.5, never 0. */
  spread: number;
  mlHome: number;
  mlAway: number;
  /** Modelled probability that the home side wins outright, in [0, 1]. */
  homeWinProb: number;
}

/**
 * Rounds a projected margin into a tradeable spread.
 *
 * `homeProjected - awayProjected` is the margin we expect home to win by, so
 * the spread they must give up is its negation, rounded to the nearest half
 * point. A rounded 0 is nudged to -0.5: a pick-em would make pushes possible,
 * and the half point has to land on somebody, so it lands on the (nominal) home
 * side.
 */
export function priceSpread(homeProjected: number, awayProjected: number): number {
  const rounded = Math.round((awayProjected - homeProjected) * 2) / 2;
  // Object.is guards -0, which formats as "-0" and reads as a broken line.
  if (rounded === 0) return -0.5;
  return rounded;
}

/**
 * Converts a win probability into American odds, with the house's cut baked in.
 *
 * The probability is inflated by the overround, converted, then rounded to the
 * nearest 5 (books do not post -137) and floored at the house minimums so a
 * near-coin-flip never posts as free money.
 */
export function americanOdds(winProb: number): number {
  const implied = clamp(winProb * OVERROUND, MIN_IMPLIED_PROB, MAX_IMPLIED_PROB);

  if (implied >= 0.5) {
    const raw = -(implied / (1 - implied)) * 100;
    const rounded = Math.round(raw / 5) * 5;
    return Math.min(rounded, MIN_FAVORITE_ODDS);
  }

  const raw = ((1 - implied) / implied) * 100;
  const rounded = Math.round(raw / 5) * 5;
  return Math.max(rounded, MIN_UNDERDOG_ODDS);
}

/**
 * Prices one game from the two sides' projected starter totals.
 *
 * Win probability comes from the site's existing model
 * (lib/win-probability.ts) run as a pre-game state: no points on the board,
 * every projected point still to come. Using that model rather than a second
 * one means the board and the live matchup pages can never disagree about who
 * is favored.
 */
export function priceGame(homeProjected: number, awayProjected: number): BookPrice {
  const homeWinProb = computeWinProbability({
    scoreA: 0,
    scoreB: 0,
    projRemainingA: homeProjected,
    projRemainingB: awayProjected,
  });

  return {
    spread: priceSpread(homeProjected, awayProjected),
    mlHome: americanOdds(homeWinProb),
    mlAway: americanOdds(1 - homeWinProb),
    homeWinProb,
  };
}

/**
 * Profit (not total return) on a winning wager at American odds `ml`.
 * Favorites: risk |ml| to win 100. Underdogs: risk 100 to win ml.
 */
export function pay(ml: number, stake: number): number {
  if (ml < 0) return (stake * 100) / -ml;
  return (stake * ml) / 100;
}

/**
 * Which side covered, given final (or current) scores and the home spread.
 * Home covers when its margin plus its spread is positive. Because the spread
 * is never 0 and never a whole number, this can never land on exactly 0 for a
 * whole-number score difference; the `> 0` test is therefore total.
 */
export function coverSide(
  homePoints: number,
  awayPoints: number,
  spread: number,
): "home" | "away" {
  return homePoints - awayPoints + spread > 0 ? "home" : "away";
}

/** "-3.5" / "+3.5", never a bare "3.5" and never "-0". */
export function formatSpread(spread: number): string {
  const fixed = Number.isInteger(spread) ? String(spread) : spread.toFixed(1);
  return spread > 0 ? `+${fixed}` : fixed;
}

/** "-165" / "+140". */
export function formatMoneyline(ml: number): string {
  return ml > 0 ? `+${ml}` : String(ml);
}

/** "$12.34", always two decimals. */
export function formatMoney(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** "$10 wins $6.06" — the payout line under each side on the board. */
export function payoutLabel(ml: number, stake: number): string {
  return `$${stake} wins ${formatMoney(pay(ml, stake))}`;
}

/** The spread as it reads for the away side (the mirror of the stored value). */
export function awaySpread(spread: number): number {
  return -spread;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
