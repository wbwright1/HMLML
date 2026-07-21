/**
 * Shared division-name resolver. Sleeper's league.metadata carries optional
 * `division_N` keys with a friendly name; this league's metadata does not set
 * them (verified live: metadata is only {auto_continue, keeper_deadline}), so
 * every caller falls back to "Division N". Centralized here so the sync layer,
 * the schedule generator script, and query code never drift on the fallback.
 */
export function resolveDivisionName(
  metadata: Record<string, string> | null | undefined,
  divisionNumber: number,
): string {
  return metadata?.[`division_${divisionNumber}`]?.trim() || `Division ${divisionNumber}`;
}
