import Link from "next/link";
import { SuperlativeBadge } from "@/components/superlative-badge";

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
      className="group block rounded-xl border border-border bg-surface p-6 transition-colors hover:border-accent-green/40 hover:bg-surface/80"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-3">
            <h3 className="text-h3 group-hover:text-accent-green transition-colors">
              {seasonYear}
            </h3>
            <span className="text-body-sm text-text-tertiary">
              {teamCount} teams
            </span>
            {isLegacy && (
              <span className="text-xs uppercase tracking-wider text-text-tertiary bg-surface-muted px-2 py-0.5 rounded-full">
                Legacy Era
              </span>
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
              Most PF: {mostPF.franchiseName} ({mostPF.points.toFixed(1)})
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
