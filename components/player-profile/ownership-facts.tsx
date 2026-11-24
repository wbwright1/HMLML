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
      <span className={`text-body-sm font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}

/** "52.3 · 2024 Wk 5": numerals in mono, the "Wk" letters in Geist. */
function WeekValue({
  points,
  seasonYear,
  week,
}: {
  points: number;
  seasonYear: number;
  week: number;
}) {
  return (
    <>
      <span className="font-mono tabular-nums">{points.toFixed(1)}</span>
      {" · "}
      <span className="font-mono tabular-nums">{seasonYear}</span> Wk{" "}
      <span className="font-mono tabular-nums">{week}</span>
    </>
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
      <p className="text-kicker text-text-tertiary mb-1">Ownership ledger</p>
      {franchiseHistory.length > 0 && (
        <ul className="flex flex-wrap gap-3 py-2">
          {franchiseHistory.map((stint) => {
            const yearRange =
              stint.firstSeasonYear === stint.lastSeasonYear
                ? String(stint.firstSeasonYear)
                : `${stint.firstSeasonYear}–${String(stint.lastSeasonYear).slice(2)}`;
            return (
              <li key={`${stint.franchiseId}-${stint.firstSeasonYear}`}>
                <Link
                  href={`/teams/${stint.slug}`}
                  className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1.5 pr-3 transition-[scale,border-color] duration-150 hover:border-border-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  title={`${stint.name} (${yearRange})`}
                >
                  <FranchiseLogo
                    slug={stint.slug}
                    name={stint.name}
                    avatarUrl={stint.avatarUrl}
                    size={28}
                    decorative
                  />
                  <span className="font-mono tabular-nums text-caption text-text-tertiary">
                    {yearRange}
                  </span>
                  <span className="sr-only">
                    {stint.name}, {yearRange}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="divide-y divide-divider">
        {facts.careerBestWeek && (
          <Row
            label="Best week"
            value={<WeekValue {...facts.careerBestWeek} />}
            tone="green"
          />
        )}
        {facts.careerWorstStartedWeek && (
          <Row
            label="Worst started week"
            value={<WeekValue {...facts.careerWorstStartedWeek} />}
            tone="warm"
          />
        )}
      </div>
    </div>
  );
}
