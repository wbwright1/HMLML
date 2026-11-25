// Who currently owns each rookie draft pick, rebuilt from the league's own
// synced trades (transactions.draft_picks_involved). Pure: no database.
//
// Each traded pick names its draft season, round, the roster whose slot it is
// (roster_id: the original owner) and the roster that received it (owner_id).
// Replaying a season's moves oldest-first leaves the current owner of every
// pick that ever changed hands; untraded picks stay with their original roster.

export interface PickMove {
  season: string;
  round: number;
  /** Roster whose draft slot this is (the pick's original owner). */
  rosterId: number;
  /** Roster that received the pick in this trade. */
  ownerId: number;
  /** When the trade happened (ms since epoch); orders the replay. */
  at: number;
}

export function pickKey(round: number, originalRosterId: number): string {
  return `${round}:${originalRosterId}`;
}

/**
 * Current owner roster of every traded pick for one draft season, keyed by
 * pickKey(round, originalRosterId). Picks absent from the map were never
 * traded (or came back to their original roster, which is left in the map
 * as the original roster itself).
 */
export function resolvePickOwners(moves: PickMove[], season: string | number): Map<string, number> {
  const target = String(season);
  const owners = new Map<string, number>();
  [...moves]
    .filter((m) => m.season === target)
    .sort((a, b) => a.at - b.at)
    .forEach((m) => owners.set(pickKey(m.round, m.rosterId), m.ownerId));
  return owners;
}

/** The roster that owns a pick: the last receiver, else the original roster. */
export function ownerOf(owners: Map<string, number>, round: number, originalRosterId: number): number {
  return owners.get(pickKey(round, originalRosterId)) ?? originalRosterId;
}
