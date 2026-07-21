import Link from "next/link";
import { SuperlativeBadge } from "@/components/superlative-badge";

interface TransactionItem {
  date: string;
  type: "trade" | "waiver" | "free_agent" | "commissioner";
  description: string;
}

interface TransactionActivityCardProps {
  transactions: TransactionItem[];
}

const typeBadgeMap: Record<string, { text: string; variant: "gold" | "green" | "neutral" | "brown" | "silver" }> = {
  trade: { text: "Trade", variant: "gold" },
  waiver: { text: "Waiver", variant: "neutral" },
  free_agent: { text: "FA", variant: "green" },
  commissioner: { text: "Commish", variant: "silver" },
};

export function TransactionActivityCard({
  transactions,
}: TransactionActivityCardProps) {
  if (transactions.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-kicker">
          Recent Moves
        </p>
        <Link
          href="/trades"
          className="text-body-sm text-accent-gold hover:underline whitespace-nowrap"
        >
          View all trades &rarr;
        </Link>
      </div>

      <div className="space-y-3">
        {transactions.map((txn) => {
          const badge = typeBadgeMap[txn.type] ?? typeBadgeMap.commissioner;
          return (
            <div
              key={`${txn.date}-${txn.type}-${txn.description}`}
              className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0"
            >
              <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap mt-0.5">
                {txn.date}
              </span>
              <SuperlativeBadge text={badge.text} variant={badge.variant} />
              <p className="text-body-sm flex-1">{txn.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
