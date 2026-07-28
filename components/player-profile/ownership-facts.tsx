import type { PlayerOwnershipFacts } from "@/lib/queries/player-profile";

interface OwnershipFactsProps {
  facts: PlayerOwnershipFacts;
}

function Row({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "warm" | "green";
}) {
  const valueClass =
    tone === "warm"
      ? "text-accent-warm"
      : tone === "green"
        ? "text-accent-green"
        : "text-text-primary";
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-body-sm text-text-tertiary">{label}</span>
      <span className={`font-mono tabular-nums font-medium ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}

/** Career ownership facts: how well (or badly) this player has been managed. */
export function OwnershipFacts({ facts }: OwnershipFactsProps) {
  const hasAny =
    facts.careerStarts > 0 ||
    facts.careerBenchedWeeks > 0 ||
    facts.totalBenchPoints > 0;
  if (!hasAny) return null;

  return (
    <div className="card-surface p-4 sm:p-5">
      <p className="text-kicker text-text-tertiary mb-1">Ownership Ledger</p>
      <div className="divide-y divide-divider">
        {facts.careerBestWeek && (
          <Row
            label="Best Week"
            value={`${facts.careerBestWeek.points.toFixed(1)} · ${facts.careerBestWeek.seasonYear} Wk ${facts.careerBestWeek.week}`}
            tone="green"
          />
        )}
        {facts.careerWorstStartedWeek && (
          <Row
            label="Worst Started Week"
            value={`${facts.careerWorstStartedWeek.points.toFixed(1)} · ${facts.careerWorstStartedWeek.seasonYear} Wk ${facts.careerWorstStartedWeek.week}`}
            tone="warm"
          />
        )}
        <Row
          label="Bench Points Left On The Table"
          value={facts.totalBenchPoints.toFixed(1)}
          tone={facts.totalBenchPoints > 0 ? "warm" : "neutral"}
        />
        <Row
          label="Started / Benched Weeks"
          value={`${facts.careerStarts} / ${facts.careerBenchedWeeks}`}
        />
      </div>
    </div>
  );
}
