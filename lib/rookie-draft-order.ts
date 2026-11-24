// The league's rookie draft order rule. Pure: no database, no network.
//
// Rule (set by the commish, 2026-11-24). Max PF is Sleeper's max potential
// points for (`ppts`), REGULAR SEASON ONLY:
//   1. Non-playoff teams pick first, lowest Max PF first.
//   2. The 5th- and 6th-place playoff finishers (the two Wild Card Round
//      losers) pick next, also lowest Max PF first.
//   3. Then 4th place, 3rd place, 2nd place, and the champion picks last.
//   A tie in Max PF goes to record: the worse record picks first.
//
// Slots that depend on results not yet known are returned as TBD
// (franchiseId null): during the regular season only the non-playoff slots
// can be filled, from the projected field.

export interface DraftOrderTeam {
  franchiseId: string;
  wins: number;
  losses: number;
  ties: number;
  /** Regular-season max potential points; null when Sleeper has not reported it. */
  maxPointsFor: number | null;
}

export interface PlayoffFinish {
  /** Franchise ids in the playoff field (actual or projected), or null if unknown. */
  field: string[] | null;
  /** The two Wild Card Round losers (5th and 6th place), once known. */
  fifthSixth: string[] | null;
  fourth: string | null;
  third: string | null;
  runnerUp: string | null;
  champion: string | null;
}

export type DraftSlotBasis =
  | "non-playoff (Max PF)"
  | "5th/6th place (Max PF)"
  | "4th place"
  | "3rd place"
  | "2nd place"
  | "champion";

export interface DraftSlot {
  pick: number;
  /** null = TBD. */
  franchiseId: string | null;
  basis: DraftSlotBasis;
}

function winPct(t: DraftOrderTeam): number {
  const g = t.wins + t.losses + t.ties;
  return g > 0 ? (t.wins + t.ties * 0.5) / g : 0;
}

/**
 * Lowest Max PF first; a Max PF tie goes to the worse record; a team with no
 * Max PF sorts after every team that has one; franchise id keeps it total.
 */
export function byReverseMaxPf(a: DraftOrderTeam, b: DraftOrderTeam): number {
  const am = a.maxPointsFor ?? Number.POSITIVE_INFINITY;
  const bm = b.maxPointsFor ?? Number.POSITIVE_INFINITY;
  if (am !== bm) return am - bm;
  const pa = winPct(a);
  const pb = winPct(b);
  if (pa !== pb) return pa - pb;
  return a.franchiseId < b.franchiseId ? -1 : a.franchiseId > b.franchiseId ? 1 : 0;
}

/** First-round order (every round, since the draft is linear). */
export function rookieDraftOrder(teams: DraftOrderTeam[], finish: PlayoffFinish): DraftSlot[] {
  const byId = new Map(teams.map((t) => [t.franchiseId, t]));
  const slots: DraftSlot[] = [];
  const push = (franchiseId: string | null, basis: DraftSlotBasis) =>
    slots.push({ pick: slots.length + 1, franchiseId, basis });

  const inField = finish.field ? new Set(finish.field) : null;
  const fieldSize = finish.field?.length ?? 6;
  const nonPlayoffCount = Math.max(0, teams.length - fieldSize);

  if (inField) {
    teams
      .filter((t) => !inField.has(t.franchiseId))
      .sort(byReverseMaxPf)
      .forEach((t) => push(t.franchiseId, "non-playoff (Max PF)"));
  } else {
    for (let i = 0; i < nonPlayoffCount; i++) push(null, "non-playoff (Max PF)");
  }

  const fifthSixth = (finish.fifthSixth ?? [])
    .map((id) => byId.get(id))
    .filter((t): t is DraftOrderTeam => t != null);
  if (fifthSixth.length === 2) {
    fifthSixth.sort(byReverseMaxPf).forEach((t) => push(t.franchiseId, "5th/6th place (Max PF)"));
  } else {
    push(null, "5th/6th place (Max PF)");
    push(null, "5th/6th place (Max PF)");
  }

  push(finish.fourth, "4th place");
  push(finish.third, "3rd place");
  push(finish.runnerUp, "2nd place");
  push(finish.champion, "champion");
  return slots;
}

export interface WinnersBracketMatch {
  round: number;
  placement: number | null;
  team1RosterId: number | null;
  team2RosterId: number | null;
  advancingRosterId: number | null;
  eliminatedRosterId: number | null;
}

/**
 * Reads the finish from a stored winners bracket (6 teams, top-2 byes). The
 * field is every team that appears in it; round-1 losers are 5th/6th; the
 * placement-3 game settles 3rd/4th and the placement-1 game the title. Unplayed
 * games leave their slots null (TBD).
 */
export function finishFromWinnersBracket(
  matches: WinnersBracketMatch[],
  rosterToFranchise: Map<number, string>,
): PlayoffFinish {
  const fid = (r: number | null) => (r == null ? null : rosterToFranchise.get(r) ?? null);
  const field = new Set<string>();
  for (const m of matches) {
    for (const r of [m.team1RosterId, m.team2RosterId]) {
      const id = fid(r);
      if (id) field.add(id);
    }
  }
  const roundOneLosers = matches
    .filter((m) => m.round === 1)
    .map((m) => fid(m.eliminatedRosterId))
    .filter((id): id is string => id != null);
  const third = matches.find((m) => m.placement === 3);
  const final = matches.find((m) => m.placement === 1);
  return {
    field: field.size > 0 ? [...field] : null,
    fifthSixth: roundOneLosers.length === 2 ? roundOneLosers : null,
    fourth: fid(third?.eliminatedRosterId ?? null),
    third: fid(third?.advancingRosterId ?? null),
    runnerUp: fid(final?.eliminatedRosterId ?? null),
    champion: fid(final?.advancingRosterId ?? null),
  };
}
