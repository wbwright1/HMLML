import Link from "next/link";
import { FranchiseLogo } from "@/components/franchise-logo";
import { LiveIndicator } from "@/components/live-indicator";

interface MatchupTeamProps {
  name: string;
  slug: string;
  score: number;
  abbreviation?: string | null;
  brandingColor?: string | null;
  /** Per-season Sleeper crest; null/omitted falls back to the monogram. */
  avatarUrl?: string | null;
}

interface LiveMatchupCardProps {
  matchupId: number;
  homeTeam: MatchupTeamProps;
  awayTeam: MatchupTeamProps;
  status: "live" | "final" | "upcoming";
  week: number;
  /** Optional editorial aside shown in the footer (e.g. "mercy rule material"). */
  aside?: string;
  /** When true, badges the card as a Rivalry Week matchup (mutual top rivals). */
  isRivalry?: boolean;
  kickoffTime?: string; // "SUN 1PM" for upcoming
  seasonYear: number;
  /**
   * Home team's win probability in [0, 1], server-computed from hourly-synced
   * projections. When set on a live card, renders the win-probability bar.
   * Omit (undefined) to hide the bar entirely (data not yet available).
   */
  winProbHome?: number;
  /**
   * Starters each side has yet to score. When set on a live card, renders the
   * "N V M TO PLAY" status label. Omit to hide it.
   */
  playersLeft?: { home: number; away: number };
}

export function LiveMatchupCard({
  matchupId,
  homeTeam,
  awayTeam,
  status,
  week,
  aside,
  isRivalry,
  kickoffTime,
  seasonYear,
  winProbHome,
  playersLeft,
}: LiveMatchupCardProps) {
  const isUpcoming = status === "upcoming";
  // During live play the leader is emphasized; on final the winner. Both reduce
  // to "the higher score reads in ink, the other in tertiary".
  const homeLeads = !isUpcoming && homeTeam.score >= awayTeam.score;
  const awayLeads = !isUpcoming && awayTeam.score > homeTeam.score;

  // Win-prob bar and players-left are live-only, and only when the server had
  // the underlying player data. Finals keep the W/L emphasis with no bar.
  const showWinProb = status === "live" && winProbHome != null;
  const homePct = showWinProb ? Math.round(winProbHome * 100) : 0;
  const showPlayersLeft = status === "live" && playersLeft != null;

  const rivalryLabel = isRivalry ? ", Rivalry Week" : "";
  const ariaLabel = isUpcoming
    ? `${homeTeam.name} versus ${awayTeam.name}, ${kickoffTime ?? "upcoming"}${rivalryLabel}`
    : `${homeTeam.name} ${homeTeam.score.toFixed(1)} versus ${awayTeam.name} ${awayTeam.score.toFixed(1)}, ${status}${showWinProb ? `, ${homeTeam.name} win probability ${homePct} percent` : ""}${showPlayersLeft ? `, ${playersLeft.home} versus ${playersLeft.away} players left to play` : ""}${rivalryLabel}`;

  return (
    <Link
      href={`/matchups/${seasonYear}/${week}/${matchupId}`}
      className="card-surface block p-5 transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      aria-label={ariaLabel}
    >
      {/* Status row */}
      <div className="flex items-center justify-between gap-3 mb-4 min-h-5">
        {status === "live" && <LiveIndicator />}
        {status === "final" && (
          <span className="text-kicker">Final</span>
        )}
        {isUpcoming && (
          <span className="text-kicker">
            {kickoffTime ?? `Week ${week}`}
          </span>
        )}
        {isRivalry && (
          <span className="text-kicker text-accent-gold" title="Mutual top rivals">
            Rivalry Week
          </span>
        )}
        {showPlayersLeft && (
          <span className="ml-auto shrink-0 whitespace-nowrap font-mono text-[10px] font-semibold uppercase tracking-[0.08em] tabular-nums text-text-tertiary">
            {playersLeft.home} V {playersLeft.away} to play
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

      {/* Win-probability bar (home share fills from the left) + aside */}
      {showWinProb ? (
        <div className="mt-4">
          <div
            className="h-[3px] overflow-hidden rounded-full bg-surface-muted"
            aria-hidden="true"
          >
            <span
              className="block h-full rounded-full bg-accent-gold"
              style={{ width: `${homePct}%` }}
            />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-3 text-caption normal-case tracking-normal text-text-tertiary">
            <span>
              Win prob <span className="font-mono tabular-nums">{homePct}%</span>
            </span>
            {aside && (
              <span className="font-serif italic text-accent-warm">
                {aside}
              </span>
            )}
          </div>
        </div>
      ) : (
        aside && (
          <p className="mt-4 pt-3 border-t border-divider text-body-sm italic text-accent-warm">
            {aside}
          </p>
        )
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
          avatarUrl={team.avatarUrl}
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
