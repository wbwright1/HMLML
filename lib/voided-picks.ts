/**
 * The league ran a full startup redraft between the 2022 and 2023 seasons.
 * Any trade whose league year predates the redraft that also included a pick
 * for the redraft season (or later) is carrying a phantom asset: that pick
 * never conveyed, since the redraft reset every roster slot from scratch.
 */
export const REDRAFT_SEASON = 2023;

/**
 * True when a traded pick could never have conveyed because the league's
 * startup redraft (REDRAFT_SEASON) reset the draft board before the pick's
 * season arrived, and the trade that moved it predates the redraft.
 */
export function isVoidedPick(tradeSeasonYear: number, pickSeason: string): boolean {
  return tradeSeasonYear < REDRAFT_SEASON && Number(pickSeason) >= REDRAFT_SEASON;
}
