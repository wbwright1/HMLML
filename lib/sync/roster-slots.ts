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
 */
export function buildRosterSlotRows(roster: RosterSlotSource): RosterSlotRow[] {
  const starters = roster.starters ?? [];
  const reserve = roster.reserve ?? [];
  const taxi = roster.taxi ?? [];
  return [
    ...starters.map((pid) => ({ playerId: pid, slot: "starter" as const })),
    ...(roster.players ?? [])
      .filter((pid) => !starters.includes(pid))
      .filter((pid) => !reserve.includes(pid))
      .filter((pid) => !taxi.includes(pid))
      .map((pid) => ({ playerId: pid, slot: "bench" as const })),
    ...reserve.map((pid) => ({ playerId: pid, slot: "ir" as const })),
    ...taxi.map((pid) => ({ playerId: pid, slot: "taxi" as const })),
  ];
}
