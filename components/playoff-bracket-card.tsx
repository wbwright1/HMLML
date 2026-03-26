import Link from "next/link";
import { SuperlativeBadge } from "@/components/superlative-badge";

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
    <div className="rounded-xl border border-border bg-card p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-h3">
          {variant === "compact" ? "Current Round" : "Playoff Bracket"}
        </h3>
        {championName && (
          <div className="flex items-center gap-2">
            <span className="text-body-sm font-bold text-gold">
              {championName}
            </span>
            <SuperlativeBadge text="CHAMP" variant="gold" />
          </div>
        )}
      </div>

      <div className={`space-y-8 ${variant === "full" ? "md:flex md:gap-8 md:space-y-0" : ""}`}>
        {displayRounds.map((round) => (
          <div key={round.name} className="flex-1 space-y-3">
            <p className="text-caption uppercase tracking-widest text-muted-foreground">
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
          className="text-sm text-accent-green hover:underline"
        >
          View Full Bracket
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
      className="block rounded-lg border border-border bg-surface hover:bg-muted/30 transition-colors overflow-hidden"
    >
      <BracketTeamRow
        team={teamA}
        isWinner={winner === "a"}
        isLoser={winner === "b"}
        isLive={isLive}
      />
      <div className="h-px bg-border" />
      <BracketTeamRow
        team={teamB}
        isWinner={winner === "b"}
        isLoser={winner === "a"}
        isLive={isLive}
      />
      {isLive && (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-accent-green-light">
          <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" aria-hidden="true" />
          <span className="text-xs font-medium text-accent-green">LIVE</span>
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
        isWinner ? "bg-muted/40" : ""
      } ${isLoser ? "opacity-50" : ""}`}
      style={{
        borderLeft: team.brandingColor
          ? `3px solid ${team.brandingColor}`
          : undefined,
      }}
    >
      {team.seed != null && (
        <span className="text-xs text-muted-foreground tabular-nums w-4">
          {team.seed}
        </span>
      )}
      <span
        className={`text-sm flex-1 truncate ${
          isWinner ? "font-bold" : ""
        }`}
      >
        {team.name}
      </span>
      <span
        className={`text-sm tabular-nums shrink-0 ${
          isWinner ? "font-bold" : "text-muted-foreground"
        }`}
      >
        {team.score > 0 || isLive ? team.score.toFixed(1) : "-"}
      </span>
    </div>
  );
}
