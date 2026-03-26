import Link from "next/link";
import { LiveIndicator } from "@/components/live-indicator";

interface MatchupTeamProps {
  name: string;
  slug: string;
  score: number;
  brandingColor?: string | null;
}

interface LiveMatchupCardProps {
  matchupId: number;
  homeTeam: MatchupTeamProps;
  awayTeam: MatchupTeamProps;
  status: "live" | "final" | "upcoming";
  week: number;
  topScorer?: string; // "Josh Allen 32.4 pts"
  kickoffTime?: string; // "SUN 1PM" for upcoming
  seasonYear: number;
}

export function LiveMatchupCard({
  matchupId,
  homeTeam,
  awayTeam,
  status,
  week,
  topScorer,
  kickoffTime,
  seasonYear,
}: LiveMatchupCardProps) {
  const homeWins = status === "final" && homeTeam.score > awayTeam.score;
  const awayWins = status === "final" && awayTeam.score > homeTeam.score;
  const isUpcoming = status === "upcoming";

  const ariaLabel = isUpcoming
    ? `${homeTeam.name} versus ${awayTeam.name}, ${kickoffTime ?? "upcoming"}`
    : `${homeTeam.name} ${homeTeam.score.toFixed(1)} versus ${awayTeam.name} ${awayTeam.score.toFixed(1)}, ${status}`;

  return (
    <Link
      href={`/seasons/${seasonYear}/week/${week}`}
      className="block rounded-xl border border-border bg-surface p-6 transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      aria-label={ariaLabel}
    >
      {/* Status badge row */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-caption uppercase text-text-tertiary">
          Week {week}
        </span>
        {status === "live" && <LiveIndicator />}
        {status === "final" && (
          <span className="text-caption uppercase font-medium text-text-tertiary">
            Final
          </span>
        )}
        {isUpcoming && kickoffTime && (
          <span className="text-caption uppercase text-text-tertiary">
            {kickoffTime}
          </span>
        )}
      </div>

      {/* Matchup scores */}
      <div
        className="space-y-3"
        {...(status === "live" ? { "aria-live": "polite" } : {})}
      >
        {/* Home team */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              className="inline-block w-[3px] h-5 rounded-full shrink-0"
              style={{ backgroundColor: homeTeam.brandingColor ?? "var(--border)" }}
              aria-hidden="true"
            />
            <span
              className={`text-body truncate ${
                homeWins ? "font-bold text-text-primary" : "font-medium text-text-secondary"
              }`}
            >
              {homeTeam.name}
            </span>
            {homeWins && (
              <span className="text-caption font-medium text-text-tertiary">W</span>
            )}
          </div>
          <span
            className={`text-stat text-lg tabular-nums shrink-0 ${
              homeWins
                ? "font-bold text-text-primary"
                : isUpcoming
                  ? "text-text-muted"
                  : "text-text-secondary"
            }`}
          >
            {isUpcoming ? "--" : homeTeam.score.toFixed(1)}
          </span>
        </div>

        {/* Away team */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              className="inline-block w-[3px] h-5 rounded-full shrink-0"
              style={{ backgroundColor: awayTeam.brandingColor ?? "var(--border)" }}
              aria-hidden="true"
            />
            <span
              className={`text-body truncate ${
                awayWins ? "font-bold text-text-primary" : "font-medium text-text-secondary"
              }`}
            >
              {awayTeam.name}
            </span>
            {awayWins && (
              <span className="text-caption font-medium text-text-tertiary">W</span>
            )}
          </div>
          <span
            className={`text-stat text-lg tabular-nums shrink-0 ${
              awayWins
                ? "font-bold text-text-primary"
                : isUpcoming
                  ? "text-text-muted"
                  : "text-text-secondary"
            }`}
          >
            {isUpcoming ? "--" : awayTeam.score.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Top scorer callout (live only) */}
      {status === "live" && topScorer && (
        <p className="mt-3 pt-3 border-t border-border text-body-sm text-text-tertiary">
          Top scorer: {topScorer}
        </p>
      )}
    </Link>
  );
}
