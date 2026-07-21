import Link from "next/link";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { FranchiseLogo } from "@/components/franchise-logo";

interface SeasonTimelineCardProps {
  seasonYear: number;
  teamCount: number;
  championName?: string | null;
  championSlug?: string | null;
  runnerUpName?: string | null;
  mostPF?: { franchiseName: string; points: number } | null;
  isLegacy?: boolean;
  status?: string | null;
}

export function SeasonTimelineCard({
  seasonYear,
  teamCount,
  championName,
  championSlug,
  runnerUpName,
  mostPF,
  isLegacy,
  status,
}: SeasonTimelineCardProps) {
  return (
    <Link
      href={`/seasons/${seasonYear}`}
      className="group block rounded-lg border border-border bg-surface p-6 transition-colors duration-150 hover:border-border-strong"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {championSlug && championName && (
          <FranchiseLogo
            slug={championSlug}
            name={championName}
            size="md"
            decorative
          />
        )}

        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-3">
            <h3 className="font-serif italic text-2xl tracking-tight text-text-primary group-hover:text-accent-gold transition-colors">
              {seasonYear}
            </h3>
            <span className="font-mono text-body-sm tabular-nums text-text-tertiary">
              {teamCount} teams
            </span>
            {isLegacy && (
              <SuperlativeBadge text="Legacy Era" variant="neutral" />
            )}
            {status && status !== "complete" && (
              <SuperlativeBadge
                text={status === "in_season" ? "In Season" : "Pre-Draft"}
                variant="green"
              />
            )}
          </div>

          {championName && (
            <div className="flex items-center gap-2">
              <span className="text-body-sm text-text-tertiary">Champion:</span>
              <span className="text-body-sm font-bold text-accent-gold">
                {championName}
              </span>
              <SuperlativeBadge text="CHAMP" variant="gold" />
            </div>
          )}

          {runnerUpName && (
            <p className="text-body-sm text-text-tertiary">
              Runner-up: {runnerUpName}
            </p>
          )}

          {mostPF && (
            <p className="text-body-sm text-text-tertiary">
              Most PF: {mostPF.franchiseName}{" "}
              <span className="font-mono tabular-nums">
                ({mostPF.points.toFixed(1)})
              </span>
            </p>
          )}
        </div>

        <span
          className="text-text-tertiary group-hover:text-text-primary transition-colors shrink-0"
          aria-hidden="true"
        >
          &rarr;
        </span>
      </div>
    </Link>
  );
}
