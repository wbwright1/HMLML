import { getLatestSuccessfulSync } from "@/lib/queries/sync-log";
import { SyncTimestampClient } from "./sync-timestamp-client";

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60)
    return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? "s" : ""} ago`;
  return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;
}

const HOURLY_STALE_THRESHOLD_MS = 7_200_000; // 2 hours
const DAILY_STALE_THRESHOLD_MS = 93_600_000; // 26 hours

/**
 * Data types synced on the daily cadence (see lib/sync/daily.ts logSyncStart
 * calls). "rosters" is deliberately excluded here even though daily.ts also
 * logs it: lib/sync/hourly.ts re-syncs rosters every hour under the same
 * data_type string, so the freshest row for "rosters" is effectively
 * hourly-cadence and should use the tighter 2h threshold.
 */
const DAILY_CADENCE_DATA_TYPES = new Set([
  "league",
  "members",
  "players",
  "drafts",
  "playoffs",
  "daily", // generic label, never an actual data_type value, kept for clarity
]);

/** Stale threshold in ms, branched by data type's sync cadence */
export function getStaleThresholdMs(dataType: string): number {
  if (DAILY_CADENCE_DATA_TYPES.has(dataType)) return DAILY_STALE_THRESHOLD_MS;
  return HOURLY_STALE_THRESHOLD_MS; // hourly and all other types
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block size-3"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export async function SyncTimestamp({
  dataType = "league",
}: {
  dataType?: string;
}) {
  let syncEntry: Awaited<ReturnType<typeof getLatestSuccessfulSync>> | null =
    null;

  try {
    syncEntry = await getLatestSuccessfulSync(dataType);
  } catch {
    // DB unavailable — fall through to error state
  }

  if (!syncEntry || !syncEntry.completedAt) {
    return (
      <span className="text-caption text-muted-foreground">
        <ClockIcon /> Data may be outdated
      </span>
    );
  }

  const completedAt = syncEntry.completedAt;
  const relativeTime = getRelativeTime(completedAt);
  const absoluteTime = completedAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const diffMs = Date.now() - completedAt.getTime();
  const isStale = diffMs > getStaleThresholdMs(dataType);

  return (
    <SyncTimestampClient
      relativeTime={relativeTime}
      absoluteTime={absoluteTime}
      isStale={isStale}
    />
  );
}
