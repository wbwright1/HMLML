/**
 * Chronological ordering for head-to-head games, oldest first.
 *
 * Season YEAR, never `season_id`. The ids are insertion order, and the legacy
 * import gave 2021 and 2022 HIGHER ids than 2023-2026, so anything that sorts
 * by id treats the oldest seasons as the most recent games. Every streak
 * calculation reads the run at the END of the sorted list, so an id-ordered
 * sort reports streaks backwards: it once had the hub claiming a franchise had
 * "taken the last 2 meetings" off two wins from 2022.
 *
 * Pure and shared so the record-level and rivalry-level streaks cannot drift
 * apart again.
 */
export interface ChronologicalGame {
  seasonYear: number;
  week: number;
}

export function compareGameChronology(
  a: ChronologicalGame,
  b: ChronologicalGame
): number {
  if (a.seasonYear !== b.seasonYear) return a.seasonYear - b.seasonYear;
  return a.week - b.week;
}

/** A copy of `games` in chronological order; the most recent game is last. */
export function sortGamesChronologically<T extends ChronologicalGame>(
  games: T[]
): T[] {
  return [...games].sort(compareGameChronology);
}
