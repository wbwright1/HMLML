import Link from "next/link";

interface DraftOrderCardProps {
  picks: { rank: number; franchiseName: string; record: string }[];
  showAll?: boolean;
}

export function DraftOrderCard({ picks, showAll = false }: DraftOrderCardProps) {
  const displayPicks = showAll ? picks : picks.slice(0, 4);

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h3 className="text-caption uppercase text-text-tertiary mb-4">
        DRAFT ORDER
      </h3>

      <ol className="space-y-2">
        {displayPicks.map((pick) => (
          <li
            key={pick.rank}
            className="flex items-center gap-3 text-body-sm"
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

      {!showAll && picks.length > 4 && (
        <Link
          href="/drafts"
          className="block mt-4 text-body-sm font-medium text-primary hover:underline"
        >
          Full Draft Order
        </Link>
      )}
    </div>
  );
}
