import Link from "next/link";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { LiveIndicator } from "@/components/live-indicator";

interface BracketTeam {
  name: string;
  slug: string;
  score: number;
  seed?: number;
  brandingColor?: string | null;
}

interface BracketMatchup {
  teamA: BracketTeam;
  teamB: BracketTeam;
  winner?: "a" | "b" | null;
  isLive?: boolean;
  week: number;
}

interface BracketRound {
  name: string;
  matchups: BracketMatchup[];
}

interface PlayoffBracketCardProps {
  rounds: BracketRound[];
  seasonYear: number;
  variant: "compact" | "full";
  championName?: string | null;
}

export function PlayoffBracketCard({
  rounds,
  seasonYear,
  variant,
  championName,
}: PlayoffBracketCardProps) {
  const displayRounds =
    variant === "compact" ? rounds.slice(-1) : rounds;

  return (
    <div className="rounded-lg border border-border bg-surface p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-h3">
          {variant === "compact" ? "Current Round" : "Playoff Bracket"}
        </h3>
        {championName && (
          <div className="flex items-center gap-2">
            <span className="text-body-sm font-bold text-accent-gold">
              {championName}
            </span>
            <SuperlativeBadge text="CHAMP" variant="gold" />
          </div>
        )}
      </div>

      <div className={`space-y-8 ${variant === "full" ? "md:flex md:gap-8 md:space-y-0" : ""}`}>
        {displayRounds.map((round) => (
          <div key={round.name} className="flex-1 space-y-3">
            <p className="text-kicker">
              {round.name}
            </p>
            <div className="space-y-2">
              {round.matchups.map((matchup) => (
                <BracketMatchupCard
                  key={`${matchup.week}-${matchup.teamA.slug}-${matchup.teamB.slug}`}
                  matchup={matchup}
                  seasonYear={seasonYear}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {variant === "compact" && (
        <Link
          href={`/playoffs/${seasonYear}`}
          className="inline-flex items-center gap-1 text-body-sm font-medium text-accent-gold hover:brightness-110 transition-all"
        >
          View Full Bracket &rarr;
        </Link>
      )}
    </div>
  );
}

function BracketMatchupCard({
  matchup,
  seasonYear,
}: {
  matchup: BracketMatchup;
  seasonYear: number;
}) {
  const { teamA, teamB, winner, isLive } = matchup;

  return (
    <Link
      href={`/seasons/${seasonYear}/week/${matchup.week}`}
      className="block rounded-lg border border-border bg-surface hover:border-border-strong transition-colors overflow-hidden"
    >
      <BracketTeamRow
        team={teamA}
        isWinner={winner === "a"}
        isLoser={winner === "b"}
        isLive={isLive}
      />
      <div className="h-px bg-divider" />
      <BracketTeamRow
        team={teamB}
        isWinner={winner === "b"}
        isLoser={winner === "a"}
        isLive={isLive}
      />
      {isLive && (
        <div className="flex items-center px-3 py-1.5 bg-accent-green-light border-t border-divider">
          <LiveIndicator />
        </div>
      )}
    </Link>
  );
}

function BracketTeamRow({
  team,
  isWinner,
  isLoser,
  isLive,
}: {
  team: BracketTeam;
  isWinner: boolean;
  isLoser: boolean;
  isLive?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 ${
        isWinner ? "bg-surface-muted" : ""
      }`}
      style={{
        borderLeft: team.brandingColor
          ? `3px solid ${team.brandingColor}`
          : undefined,
      }}
    >
      {team.seed != null && (
        <span className="font-mono text-xs text-text-tertiary tabular-nums w-4">
          {team.seed}
        </span>
      )}
      <span
        className={`text-sm flex-1 truncate ${
          isWinner ? "font-bold text-text-primary" : isLoser ? "text-text-tertiary" : "text-text-secondary"
        }`}
      >
        {team.name}
      </span>
      <span
        className={`font-mono text-sm tabular-nums shrink-0 ${
          isWinner ? "font-bold text-text-primary" : "text-text-tertiary"
        }`}
      >
        {team.score > 0 || isLive ? team.score.toFixed(1) : "-"}
      </span>
    </div>
  );
}
