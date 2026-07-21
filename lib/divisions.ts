/**
 * Shared division-name resolver. Sleeper's league.metadata carries optional
 * `division_N` keys with a friendly name; this league's metadata does not set
 * them (verified live: metadata is only {auto_continue, keeper_deadline}), so
 * every caller falls back to "Division N". Centralized here so the sync layer,
 * the schedule generator script, and query code never drift on the fallback.
 */
export function resolveDivisionName(
  metadata: Record<string, unknown> | null | undefined,
  divisionNumber: number,
): string {
  // String-guard: Sleeper does not guarantee metadata values are strings, so
  // the schema types them as unknown. Only a non-empty string overrides the
  // "Division N" default.
  const raw = metadata?.[`division_${divisionNumber}`];
  const name = typeof raw === "string" ? raw.trim() : "";
  return name || `Division ${divisionNumber}`;
}
