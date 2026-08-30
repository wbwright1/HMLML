// The Book: grading. Pure math, no I/O.
//
// Turns raw cover results into the numbers the Tracking tab shows: win/loss/push
// outcomes, units at the house's flat -110, streaks, and season tallies. Every
// grading path (the season ATS leaderboard, Streak Watch, and the Who Picked
// Whom grid) reads through the same functions here, so a member's record can
// never disagree with itself between the two surfaces.
//
// ATS records only ever count GRADED (final) picks: a live game's cover can
// still flip, so counting it toward a season record would rewrite people's
// records mid-game. The Who Picked Whom grid is the one surface allowed to
// grade a live game, and it does so by feeding this module the current score
// instead of the final one; the module itself has no idea which it got.

import { gradePick, pay, SPREAD_ODDS } from "@/lib/book/pricing";

export type PickOutcome = "win" | "loss" | "push";

export interface GradablePick {
  side: "home" | "away";
  spreadAtPick: number;
}

/**
 * Grades one pick's outcome against a home/away score pair.
 *
 * Always grades against the spread SNAPSHOTTED on the pick (see
 * lib/book/pricing.ts gradePick), never the game's current line.
 */
export function pickOutcome(
  homePoints: number,
  awayPoints: number,
  pick: GradablePick,
): PickOutcome {
  const cover = gradePick(homePoints, awayPoints, pick);
  if (cover === "push") return "push";
  return cover === pick.side ? "win" : "loss";
}

/**
 * Friendly-dollar units on one graded pick. Every persisted book_picks row is
 * a spread bet, so it always pays the house's flat -110 (a $10 wager wins
 * $9.09); a push neither wins nor loses, since the stake would simply be
 * refunded.
 */
export function unitsForOutcome(outcome: PickOutcome): number {
  if (outcome === "win") return pay(SPREAD_ODDS, 10);
  if (outcome === "loss") return -10;
  return 0;
}

export interface Streak {
  type: "W" | "L";
  length: number;
}

/**
 * The active streak from a member's graded outcomes, most recent first.
 *
 * Pushes are skipped rather than breaking the streak: a push is a real,
 * neutral result (CLAUDE.md: render it, don't hide it), but it is neither a
 * win nor a loss, so it should not count as either. Null with no non-push
 * history to build a streak from.
 */
export function deriveStreak(
  outcomesMostRecentFirst: PickOutcome[],
): Streak | null {
  let type: "W" | "L" | null = null;
  let length = 0;

  for (const outcome of outcomesMostRecentFirst) {
    if (outcome === "push") continue;
    const asType: "W" | "L" = outcome === "win" ? "W" : "L";
    if (type === null) {
      type = asType;
      length = 1;
    } else if (asType === type) {
      length += 1;
    } else {
      break;
    }
  }

  return type ? { type, length } : null;
}

/** "W6" / "L5", or null when there is nothing graded yet. */
export function formatStreak(streak: Streak | null): string | null {
  return streak ? `${streak.type}${streak.length}` : null;
}

export interface AtsTally {
  wins: number;
  losses: number;
  pushes: number;
  units: number;
  /** wins / (wins + losses); pushes are excluded from both sides, per ATS convention. */
  winPct: number;
}

/** Rolls up a member's graded outcomes into a season tally. */
export function tallyOutcomes(outcomes: PickOutcome[]): AtsTally {
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let units = 0;

  for (const outcome of outcomes) {
    if (outcome === "win") wins += 1;
    else if (outcome === "loss") losses += 1;
    else pushes += 1;
    units += unitsForOutcome(outcome);
  }

  const decisions = wins + losses;
  return {
    wins,
    losses,
    pushes,
    units,
    winPct: decisions > 0 ? wins / decisions : 0,
  };
}

/** "34-20", or "27-27-1" once a push has actually happened. Never fabricated. */
export function formatAtsRecord(tally: AtsTally): string {
  return tally.pushes > 0
    ? `${tally.wins}-${tally.losses}-${tally.pushes}`
    : `${tally.wins}-${tally.losses}`;
}

/**
 * A single week's graded picks for one member, used by "Best Single Week".
 * Not the same shape as AtsTally: this is scoped to one week, not a season.
 */
export interface WeeklyRecord {
  week: number;
  wins: number;
  losses: number;
  pushes: number;
}

/**
 * A week only counts as a Streak Watch claim once there is enough of it graded
 * to mean something: two clean covers is luck, six is a "clean sweep".
 */
export const MIN_PICKS_FOR_BEST_WEEK = 4;

export function isNotableWeek(week: WeeklyRecord): boolean {
  return week.wins + week.losses + week.pushes >= MIN_PICKS_FOR_BEST_WEEK;
}

/**
 * The single best graded week across the league, or null when nobody has
 * strung together enough graded picks in one week yet. Ties break toward
 * fewer losses (a cleaner sweep beats a busier one with the same win count).
 */
export function bestWeekOf<T extends WeeklyRecord>(weeks: T[]): T | null {
  const notable = weeks.filter(isNotableWeek);
  if (notable.length === 0) return null;

  return notable.reduce((best, week) => {
    if (week.wins > best.wins) return week;
    if (week.wins === best.wins && week.losses < best.losses) return week;
    return best;
  });
}
