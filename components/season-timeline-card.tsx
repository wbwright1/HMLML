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
      className="group block rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-card/80"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-3">
            <h3 className="text-h3 group-hover:text-primary transition-colors">
              {seasonYear}
            </h3>
            <span className="text-body-sm text-muted-foreground">
              {teamCount} teams
            </span>
            {isLegacy && (
              <span className="text-xs uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
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
              <span className="text-body-sm text-muted-foreground">Champion:</span>
              <span className="text-body-sm font-bold text-gold">
                {championName}
              </span>
              <SuperlativeBadge text="CHAMP" variant="gold" />
            </div>
          )}

          {runnerUpName && (
            <p className="text-body-sm text-muted-foreground">
              Runner-up: {runnerUpName}
            </p>
          )}

          {mostPF && (
            <p className="text-body-sm text-muted-foreground">
              Most PF: {mostPF.franchiseName} ({mostPF.points.toFixed(1)})
            </p>
          )}
        </div>

        <span
          className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0"
          aria-hidden="true"
        >
          &rarr;
        </span>
      </div>
    </Link>
  );
}
