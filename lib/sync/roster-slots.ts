/**
 * Sleeper writes "0" into a roster's starters array for an empty lineup slot.
 * It is not a player id and must never reach the players table: the daily
 * snapshot has no id "0", so a stub for it would never heal and the roster
 * would show an "Unknown Player" starter forever. The matchup steps already
 * guard against it wherever they read a starters array.
 */
export const EMPTY_SLOT_ID = "0";

/** One roster_players row's worth of slot assignment, before the DB write. */
export interface RosterSlotRow {
  playerId: string;
  slot: "starter" | "bench" | "ir" | "taxi";
}

/** The subset of a Sleeper roster that determines slot assignment. */
export interface RosterSlotSource {
  starters?: string[] | null;
  players?: string[] | null;
  reserve?: string[] | null;
  taxi?: string[] | null;
}

/**
 * Expands one Sleeper roster into its roster_players slot rows.
 *
 * Precedence: `starters` wins, then `reserve` (IR) and `taxi`, and whatever is
 * left in `players` is bench. Sleeper's `players` array is the full roster, so
 * the bench pass subtracts the three specific arrays rather than trusting them
 * to be disjoint from it. Every array is nullable in Sleeper's payload.
 *
 * Sleeper's `EMPTY_SLOT_ID` ("0") placeholder for an unfilled lineup slot is
 * dropped: it is not a player, and the rest of the sync already guards against
 * it wherever a starters array is read.
 */
export function buildRosterSlotRows(roster: RosterSlotSource): RosterSlotRow[] {
  const real = (ids: string[] | null | undefined) =>
    (ids ?? []).filter((pid) => Boolean(pid) && pid !== EMPTY_SLOT_ID);

  const starters = real(roster.starters);
  const reserve = real(roster.reserve);
  const taxi = real(roster.taxi);
  return [
    ...starters.map((pid) => ({ playerId: pid, slot: "starter" as const })),
    ...real(roster.players)
      .filter((pid) => !starters.includes(pid))
      .filter((pid) => !reserve.includes(pid))
      .filter((pid) => !taxi.includes(pid))
      .map((pid) => ({ playerId: pid, slot: "bench" as const })),
    ...reserve.map((pid) => ({ playerId: pid, slot: "ir" as const })),
    ...taxi.map((pid) => ({ playerId: pid, slot: "taxi" as const })),
  ];
}
