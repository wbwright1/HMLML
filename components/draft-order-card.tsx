import Link from "next/link";

interface DraftOrderCardProps {
  picks: { rank: number; franchiseName: string; record: string }[];
  seasonYear?: number;
}

export function DraftOrderCard({ picks, seasonYear }: DraftOrderCardProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h3 className="text-caption uppercase text-text-tertiary mb-4">
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
            <span className="flex-1 font-medium text-text-primary">
              {pick.franchiseName}
            </span>
            <span className="text-text-tertiary tabular-nums">
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
