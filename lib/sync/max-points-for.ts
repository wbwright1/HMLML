/**
 * Sleeper's max potential points for a roster (`ppts` + `ppts_decimal`/100),
 * which Sleeper accumulates over the regular season only. Null when Sleeper
 * has not reported it (e.g. before week 1), so a missing value is never
 * mistaken for zero by the rookie draft order.
 */
export function maxPointsForOf(settings: { ppts?: number; ppts_decimal?: number }): number | null {
  if (settings.ppts == null) return null;
  return settings.ppts + (settings.ppts_decimal ?? 0) / 100;
}
