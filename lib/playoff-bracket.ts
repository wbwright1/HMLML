// Pure bracket logic: shapes Sleeper's winners/losers bracket payloads into
// rows for playoff_bracket_matches, names rounds and placement games, and
// resolves the Toilet Bowl champion. No database, no network; every function
// here is unit-tested against real Sleeper payloads.
//
// THE INVERSION (read this before touching anything below):
// This league's losers bracket is a genuine Toilet Bowl. You advance by LOSING
// the game, and Sleeper still records the advancing team in its `w` field.
// Verified against real matchup scores for 2021-2025: every one of the 21
// winners-bracket matches has the higher scorer as `w`, and every one of the
// 26 losers-bracket matches has the LOWER scorer as `w`. Advancement therefore
// always comes from the stored `w`, never from comparing points.

import type { SleeperBracketMatch } from "@/lib/sleeper-schemas";

export type BracketType = "winners" | "losers";

export interface NormalizedBracketMatch {
  bracketType: BracketType;
  round: number;
  matchNumber: number;
  placement: number | null;
  team1RosterId: number | null;
  team2RosterId: number | null;
  team1FromMatch: number | null;
  team2FromMatch: number | null;
  advancingRosterId: number | null;
  eliminatedRosterId: number | null;
}

/**
 * True when the bracket advances the team that LOST the game. The single named
 * home of the inversion, so renderers read intent instead of a bare boolean.
 */
export function advancesByLosing(type: BracketType): boolean {
  return type === "losers";
}

/** Sleeper round number to league week. playoff_week_start is round 1. */
export function roundToWeek(round: number, playoffWeekStart: number): number {
  return playoffWeekStart + round - 1;
}

/**
 * Reads a bracket slot. Sleeper normally puts a numeric roster_id in `t1`/`t2`
 * and the feeder reference in the sibling `t1_from`/`t2_from`, but the API type
 * also permits an object directly in `t1`/`t2`, so both forms are handled.
 */
function readSlot(
  slot: SleeperBracketMatch["t1"],
  from: SleeperBracketMatch["t1_from"],
): { rosterId: number | null; fromMatch: number | null } {
  const fromMatch = readFeeder(from) ?? readFeeder(slot);
  if (typeof slot === "number") return { rosterId: slot, fromMatch };
  return { rosterId: null, fromMatch };
}

function readFeeder(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const ref = value as Record<string, unknown>;
  if (typeof ref.w === "number") return ref.w;
  if (typeof ref.l === "number") return ref.l;
  return null;
}

/** Maps a raw Sleeper bracket payload onto playoff_bracket_matches rows. */
export function normalizeBracketMatches(
  matches: SleeperBracketMatch[],
  type: BracketType,
): NormalizedBracketMatch[] {
  return matches.map((match) => {
    const t1 = readSlot(match.t1, match.t1_from);
    const t2 = readSlot(match.t2, match.t2_from);
    return {
      bracketType: type,
      round: match.r,
      matchNumber: match.m,
      placement: match.p ?? null,
      team1RosterId: t1.rosterId,
      team2RosterId: t2.rosterId,
      team1FromMatch: t1.fromMatch,
      team2FromMatch: t2.fromMatch,
      advancingRosterId: match.w ?? null,
      eliminatedRosterId: match.l ?? null,
    };
  });
}

/**
 * Winners-bracket round names, indexed from the END of the bracket (0 = the
 * final). Counting backwards is what makes the 3-round (6-team, two byes) and
 * 2-round (4-team) shapes both label correctly.
 *
 * Round 1 of a 6-team bracket is a WILD CARD ROUND, not quarterfinals: only
 * four teams play and the top two seeds are on bye. This is the single source
 * of these names site-wide; the hub's playoff banner reads them from here too,
 * so the same round can never be called two different things.
 */
export const WINNERS_ROUND_NAMES_FROM_END = [
  "Championship",
  "Semifinals",
  "Wild Card Round",
] as const;

/** Winners-bracket round names in playing order for a bracket of N rounds. */
export function getWinnersRoundNames(totalRounds: number): string[] {
  return Array.from({ length: totalRounds }, (_, i) =>
    getRoundLabel("winners", i + 1, totalRounds),
  );
}

/**
 * Names a round group from the END of the bracket so both the 3-round (6-team)
 * and 2-round (4-team) shapes label correctly.
 */
export function getRoundLabel(
  type: BracketType,
  round: number,
  totalRounds: number,
): string {
  const fromEnd = totalRounds - round; // 0 = final round

  if (type === "losers") {
    return fromEnd === 0 ? "Toilet Bowl Final" : `Toilet Bowl Round ${round}`;
  }

  return WINNERS_ROUND_NAMES_FROM_END[fromEnd] ?? `Round ${round}`;
}

/**
 * Per-match label for a game that settles a specific finishing position, or
 * null for an ordinary advancement game.
 *
 * Winners bracket: Sleeper's `p` IS the finishing position, so p=3 is the 3rd
 * Place Game.
 *
 * Losers bracket: `p` counts up from the bottom of the standings. With the
 * bracket inverted, the p=1 match settles the last two places, p=3 the two
 * above that, and so on, which means the game decides positions
 * (totalRosters - p) and (totalRosters - p + 1). Verified against the 2021
 * (10-team, 4-team losers bracket) and 2023 (12-team, 6-team losers bracket)
 * brackets. Without a reliable roster count we refuse to invent a position and
 * fall back to a plain placement label.
 */
export function getMatchPlacementLabel(
  type: BracketType,
  placement: number | null,
  totalRosters: number | null,
): string | null {
  if (placement == null) return null;

  if (type === "winners") {
    return placement === 1 ? "Championship" : `${ordinal(placement)} Place Game`;
  }

  if (placement === 1) return "Toilet Bowl Final";
  if (totalRosters == null || totalRosters - placement < 1) {
    return "Placement Game";
  }
  return `${ordinal(totalRosters - placement)} Place Game`;
}

/** "1st", "2nd", "12th": shared with the bracket's champion capsule. */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * The Toilet Bowl champion: the franchise that ADVANCED out of the p === 1
 * losers-bracket match, which in an inverted bracket means the team that lost
 * its way all the way to the bottom. Returns null when the final has not been
 * played, so an in-progress season crowns nobody.
 */
export function deriveToiletBowlChampion(
  losersMatches: SleeperBracketMatch[],
  rosterToFranchise: Map<number, string>,
): string | null {
  const final = losersMatches.find((m) => m.p === 1);
  if (!final || final.w == null) return null;
  return rosterToFranchise.get(final.w) ?? null;
}
