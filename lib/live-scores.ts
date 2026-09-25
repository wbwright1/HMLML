import type { NflState } from "@/lib/queries/nfl-state";

/**
 * Pure helpers behind the live-score path (`/api/live-scores`) and the hub's
 * current-week query. No DB, no fetch: unit-tested in live-scores.test.ts.
 */

/**
 * Picks the week that is "now" for a season.
 *
 * The hourly sync writes the full regular-season schedule ahead of time, so
 * the highest synced week is usually the LAST regular-season week, not the
 * current one (#312: the live poller refreshed week 14 all through week 3).
 * The NFL state week wins whenever it belongs to this season; the highest
 * synced week is only a fallback for a Sleeper outage or a season mismatch,
 * and 1 covers a season with nothing synced yet.
 */
export function pickCurrentWeek(input: {
  nflState: Pick<NflState, "season" | "week"> | null;
  seasonYear: number;
  maxSyncedWeek: number | null;
}): number {
  const { nflState, seasonYear, maxSyncedWeek } = input;
  if (nflState && nflState.season === String(seasonYear)) return nflState.week;
  return maxSyncedWeek ?? 1;
}

/** Status a live refresh writes for one roster: points on the board means kicked off. */
export function deriveLiveStatus(points: number): "in_progress" | "scheduled" {
  return points > 0 ? "in_progress" : "scheduled";
}

export interface LiveScoreRow {
  rosterId: string;
  points: number | null;
  status: string | null;
}

/**
 * Throttle decision for the live-surface revalidation, with a trailing edge.
 *
 * A change inside the throttle window is already written to the DB, so the
 * next poll's diff sees nothing new; without `pending` that last change (say,
 * Monday night's final points) would never reach the ISR pages until the next
 * hourly sync. So a suppressed change sets `pending`, and any later call past
 * the window fires it even when that call saw no change of its own.
 */
export function decideLiveRevalidation(input: {
  changed: boolean;
  pending: boolean;
  now: number;
  lastRevalidateAt: number;
  minIntervalMs: number;
}): { revalidate: boolean; pending: boolean } {
  const { changed, pending, now, lastRevalidateAt, minIntervalMs } = input;
  const due = changed || pending;
  if (!due) return { revalidate: false, pending: false };
  if (now - lastRevalidateAt >= minIntervalMs) return { revalidate: true, pending: false };
  return { revalidate: false, pending: true };
}

/**
 * Whether a live refresh's incoming rows change anything already stored.
 *
 * Rows already `complete` are skipped because the upsert never touches them
 * (its `setWhere` guard), so they cannot be a change. A roster with no stored
 * row is a change (the upsert inserts it).
 */
export function hasLiveScoreChanges(
  existing: readonly LiveScoreRow[],
  incoming: readonly LiveScoreRow[]
): boolean {
  const byRoster = new Map(existing.map((r) => [r.rosterId, r]));
  for (const next of incoming) {
    const prev = byRoster.get(next.rosterId);
    if (!prev) return true;
    if (prev.status === "complete") continue;
    if (prev.status !== next.status) return true;
    if (Math.abs((prev.points ?? 0) - (next.points ?? 0)) > 1e-6) return true;
  }
  return false;
}
