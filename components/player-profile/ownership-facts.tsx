import Link from "next/link";
import { FranchiseLogo } from "@/components/franchise-logo";
import type {
  FranchiseStint,
  PlayerOwnershipFacts,
} from "@/lib/queries/player-profile";

interface OwnershipFactsProps {
  facts: PlayerOwnershipFacts;
  franchiseHistory: FranchiseStint[];
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

/** Every franchise that has ever rostered the player, plus career peaks. */
export function OwnershipFacts({ facts, franchiseHistory }: OwnershipFactsProps) {
  const hasAny =
    franchiseHistory.length > 0 ||
    facts.careerBestWeek != null ||
    facts.careerWorstStartedWeek != null;
  if (!hasAny) return null;

  return (
    <div className="card-surface p-4 sm:p-5">
      <p className="text-kicker text-text-tertiary mb-1">Ownership Ledger</p>
      {franchiseHistory.length > 0 && (
        <ul className="flex flex-wrap gap-3 py-2">
          {franchiseHistory.map((stint) => (
            <li key={stint.franchiseId}>
              <Link
                href={`/teams/${stint.slug}`}
                className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 transition-colors hover:border-border-strong"
                title={stint.name}
              >
                <FranchiseLogo
                  slug={stint.slug}
                  name={stint.name}
                  avatarUrl={stint.avatarUrl}
                  size={28}
                  decorative
                />
                <span className="font-mono tabular-nums text-caption text-text-tertiary">
                  {stint.firstSeasonYear === stint.lastSeasonYear
                    ? stint.firstSeasonYear
                    : `${stint.firstSeasonYear}–${String(stint.lastSeasonYear).slice(2)}`}
                </span>
                <span className="sr-only">{stint.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
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
      </div>
    </div>
  );
}
