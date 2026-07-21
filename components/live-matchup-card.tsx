import Link from "next/link";
import { FranchiseLogo } from "@/components/franchise-logo";
import { LiveIndicator } from "@/components/live-indicator";

interface MatchupTeamProps {
  name: string;
  slug: string;
  score: number;
  abbreviation?: string | null;
  brandingColor?: string | null;
}

interface LiveMatchupCardProps {
  matchupId: number;
  homeTeam: MatchupTeamProps;
  awayTeam: MatchupTeamProps;
  status: "live" | "final" | "upcoming";
  week: number;
  /** Optional editorial aside shown in the footer (e.g. "mercy rule material"). */
  aside?: string;
  kickoffTime?: string; // "SUN 1PM" for upcoming
  seasonYear: number;
}

export function LiveMatchupCard({
  matchupId,
  homeTeam,
  awayTeam,
  status,
  week,
  aside,
  kickoffTime,
  seasonYear,
}: LiveMatchupCardProps) {
  const isUpcoming = status === "upcoming";
  // During live play the leader is emphasized; on final the winner. Both reduce
  // to "the higher score reads in ink, the other in tertiary".
  const homeLeads = !isUpcoming && homeTeam.score >= awayTeam.score;
  const awayLeads = !isUpcoming && awayTeam.score > homeTeam.score;

  const ariaLabel = isUpcoming
    ? `${homeTeam.name} versus ${awayTeam.name}, ${kickoffTime ?? "upcoming"}`
    : `${homeTeam.name} ${homeTeam.score.toFixed(1)} versus ${awayTeam.name} ${awayTeam.score.toFixed(1)}, ${status}`;

  return (
    <Link
      href={`/matchups/${seasonYear}/${week}/${matchupId}`}
      className="card-surface block p-5 transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      aria-label={ariaLabel}
    >
      {/* Status row */}
      <div className="flex items-center justify-between mb-4 min-h-5">
        {status === "live" && <LiveIndicator />}
        {status === "final" && (
          <span className="text-kicker">Final</span>
        )}
        {isUpcoming && (
          <span className="text-kicker">
            {kickoffTime ?? `Week ${week}`}
          </span>
        )}
      </div>

      {/* Team rows */}
      <div
        className="space-y-3"
        {...(status === "live" ? { "aria-live": "polite" } : {})}
      >
        <TeamRow team={homeTeam} leads={homeLeads} isUpcoming={isUpcoming} />
        <TeamRow team={awayTeam} leads={awayLeads} isUpcoming={isUpcoming} />
      </div>

      {/* Editorial aside (optional) */}
      {aside && (
        <p className="mt-4 pt-3 border-t border-divider text-body-sm italic text-accent-warm">
          {aside}
        </p>
      )}
    </Link>
  );
}

function TeamRow({
  team,
  leads,
  isUpcoming,
}: {
  team: MatchupTeamProps;
  leads: boolean;
  isUpcoming: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <FranchiseLogo
          slug={team.slug}
          name={team.name}
          abbreviation={team.abbreviation ?? undefined}
          brandingColor={team.brandingColor ?? undefined}
          size="sm"
          decorative
        />
        <span
          className={`text-body truncate ${
            leads ? "font-bold text-text-primary" : "font-medium text-text-secondary"
          }`}
        >
          {team.name}
        </span>
      </div>
      <span
        className={`text-stat text-2xl shrink-0 ${
          leads
            ? "text-text-primary"
            : isUpcoming
              ? "text-text-muted"
              : "text-text-tertiary"
        }`}
      >
        {isUpcoming ? "--" : team.score.toFixed(1)}
      </span>
    </div>
  );
}
