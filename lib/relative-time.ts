/**
 * Compact relative timestamp for feed cards: "40m", "5h", "2d". Sub-minute ages
 * render "now". Future timestamps (clock skew) also render "now". Pure so it can
 * be unit-tested; pass `now` in tests for determinism.
 */
export function formatRelativeTime(
  iso: string,
  now: number = Date.now()
): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const diffMs = now - then;
  if (diffMs < 60_000) return "now";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}
