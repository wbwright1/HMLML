import Link from "next/link";

interface StandingsEntry {
  rank: number;
  franchiseName: string;
  franchiseSlug: string;
  record: string;
  brandingColor?: string | null;
}

interface StandingsSnapshotCardProps {
  standings: StandingsEntry[];
  week: number;
  seasonYear: number;
}

export function StandingsSnapshotCard({
  standings,
  week,
  seasonYear,
}: StandingsSnapshotCardProps) {
  if (standings.length === 0) return null;

  // Show top 3 + last place
  const top3 = standings.slice(0, 3);
  const lastPlace = standings.length > 3 ? standings[standings.length - 1] : null;
  const hasGap = lastPlace && lastPlace.rank > 4;

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-caption uppercase tracking-widest text-text-tertiary">
          Standings, Week {week}
        </p>
        <Link
          href="/records"
          className="text-body-sm font-medium text-accent-green hover:underline"
        >
          View Full
        </Link>
      </div>

      <div className="space-y-2">
        {top3.map((entry) => (
          <StandingsRow
            key={entry.franchiseSlug}
            entry={entry}
            isLeader={entry.rank === 1}
            isLastPlace={false}
          />
        ))}

        {hasGap && (
          <div className="flex justify-center py-1">
            <span className="text-text-muted text-body-sm" aria-hidden="true">
              &middot;&middot;&middot;
            </span>
          </div>
        )}

        {lastPlace && (
          <StandingsRow
            entry={lastPlace}
            isLeader={false}
            isLastPlace
          />
        )}
      </div>
    </div>
  );
}

function StandingsRow({
  entry,
  isLeader,
  isLastPlace,
}: {
  entry: StandingsEntry;
  isLeader: boolean;
  isLastPlace: boolean;
}) {
  const accentColor = isLeader
    ? "text-accent-green"
    : isLastPlace
      ? "text-accent-warm"
      : "text-text-tertiary";

  return (
    <Link
      href={`/teams/${entry.franchiseSlug}`}
      className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface-muted"
    >
      <span
        className="inline-block w-[3px] h-5 rounded-full shrink-0"
        style={{ backgroundColor: entry.brandingColor ?? "var(--border)" }}
        aria-hidden="true"
      />
      <span className={`text-body-sm tabular-nums font-medium w-5 text-center ${accentColor}`}>
        {entry.rank}
      </span>
      <span
        className={`text-body flex-1 min-w-0 truncate ${
          isLeader ? "font-bold text-text-primary" : "font-medium text-text-secondary"
        }`}
      >
        {entry.franchiseName}
      </span>
      <span className="text-body-sm tabular-nums text-text-tertiary shrink-0">
        {entry.record}
      </span>
    </Link>
  );
}
