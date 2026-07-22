/**
 * Formats a win-loss(-tie) record for display: "9-5", or "9-5-1" when there are
 * ties. Nulls are treated as zero. Shared by the preseason field, the
 * between-weeks slate cards, and anywhere else a compact record is shown so the
 * formatting lives in exactly one place.
 */
export function formatRecord(
  wins: number | null,
  losses: number | null,
  ties: number | null,
): string {
  const w = wins ?? 0;
  const l = losses ?? 0;
  const t = ties ?? 0;
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}
