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
  const isStale = diffMs > 3600000; // > 1 hour

  return (
    <SyncTimestampClient
      relativeTime={relativeTime}
      absoluteTime={absoluteTime}
      isStale={isStale}
    />
  );
}
