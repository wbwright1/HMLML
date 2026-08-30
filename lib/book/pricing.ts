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
 * The house's posted limits, as implied probability. Two jobs:
 *
 * 1. Safety. The win-probability model clamps to [0.01, 0.99], and multiplying
 *    0.99 by the overround would push past certainty and flip the sign of the
 *    conversion.
 * 2. Sanity. A real book does not post -3200. Early in a week somebody always
 *    has an unset lineup, and the resulting mismatch should read as "enormous
 *    favorite", not as a broken number with four digits in it.
 *
 * 0.95 caps the board at -1900 / +1900.
 */
const MAX_IMPLIED_PROB = 0.95;
const MIN_IMPLIED_PROB = 0.05;

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
 * point.
 *
 * Every spread carries a hook: the result is always a half-integer (-3.5, +12.5),
 * never a whole number, because a whole-number spread ties on a whole-number
 * margin and that is a push. So the margin is rounded to the nearest
 * HALF-INTEGER rather than to the nearest 0.5, which keeps the distortion at
 * most half a point and stays symmetric under a side swap. A dead-even 0
 * becomes -0.5; the half point has to land on somebody, and with no favorite to
 * pick it lands on the nominal home side.
 *
 * The hook makes a push rare, not impossible: fantasy scores are decimal, so a
 * margin of exactly 0.5 against a -0.5 line still ties. That residue is why
 * coverSide reports "push" rather than assuming it away.
 */
export function priceSpread(homeProjected: number, awayProjected: number): number {
  const raw = awayProjected - homeProjected;
  if (raw === 0) return -0.5;
  // Round the MAGNITUDE onto the half-integer grid, then restore the sign, so
  // swapping the two sides negates the spread exactly.
  const magnitude = Math.round(Math.abs(raw) - 0.5) + 0.5;
  return raw < 0 ? -magnitude : magnitude;
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

export type CoverResult = "home" | "away" | "push";

/**
 * Which side covered, given final (or current) scores and the home spread.
 * Home covers when its margin plus its spread is positive.
 *
 * "push" is rare but genuinely reachable, and it is a real outcome rather than
 * a defensive fiction. The half-point hook on every spread kills the common
 * case (a whole-number margin against a whole-number line), but fantasy scores
 * are decimal: 100.5 to 100.0 against a -0.5 line lands on exactly zero. It is
 * returned instead of being folded into "away" because crediting a cover to a
 * side that did not earn one puts a wrong result in somebody's record. Every
 * caller must handle it.
 */
export function coverSide(
  homePoints: number,
  awayPoints: number,
  spread: number,
): CoverResult {
  const margin = homePoints - awayPoints + spread;
  if (margin === 0) return "push";
  return margin > 0 ? "home" : "away";
}

/**
 * Grades one member's pick against the spread SNAPSHOTTED on their row.
 *
 * Deliberately does not take the game's current line: the hourly repricing
 * moves lines right up to kickoff, so the number a member agreed to and the
 * number the game ended up carrying are routinely different, and only the
 * former is theirs. Grading against the live line would rewrite people's
 * results every hour.
 */
export function gradePick(
  homePoints: number,
  awayPoints: number,
  pick: { side: "home" | "away"; spreadAtPick: number },
): CoverResult {
  return coverSide(homePoints, awayPoints, pick.spreadAtPick);
}

/** True when the pick's own snapshotted line came in. */
export function pickCovered(
  homePoints: number,
  awayPoints: number,
  pick: { side: "home" | "away"; spreadAtPick: number },
): boolean {
  return gradePick(homePoints, awayPoints, pick) === pick.side;
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
