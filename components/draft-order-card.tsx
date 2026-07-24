import Link from "next/link";

interface DraftOrderCardProps {
  picks: { rank: number; franchiseName: string; record: string; originalOwnerName?: string }[];
  seasonYear?: number;
}

export function DraftOrderCard({ picks, seasonYear }: DraftOrderCardProps) {
  return (
    <div className="card-surface p-5">
      <h3 className="text-kicker mb-4">
        DRAFT ORDER
      </h3>

      <ol className="space-y-1">
        {picks.map((pick, index) => (
          <li
            key={pick.rank}
            className={`flex items-center gap-3 text-body-sm py-1.5 rounded ${
              index % 2 === 1 ? "bg-surface-muted/50" : ""
            }`}
          >
            <span className="w-6 text-center font-bold text-text-primary tabular-nums">
              {pick.rank}
            </span>
            <span className="flex-1 min-w-0 truncate">
              <span className="font-medium text-text-primary">
                {pick.franchiseName}
              </span>
              {pick.originalOwnerName && (
                <span className="text-text-tertiary text-xs ml-1">
                  (via {pick.originalOwnerName})
                </span>
              )}
            </span>
            <span className="text-text-tertiary tabular-nums shrink-0 whitespace-nowrap">
              {pick.record}
            </span>
          </li>
        ))}
      </ol>

      {seasonYear && (
        <Link
          href={`/drafts/${seasonYear}`}
          className="block mt-4 text-body-sm font-medium text-accent-green hover:underline"
        >
          View Full Draft Order (All 3 Rounds) &rarr;
        </Link>
      )}
    </div>
  );
}
