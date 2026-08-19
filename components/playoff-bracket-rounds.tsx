import Link from "next/link";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { SuperlativeBadge } from "@/components/superlative-badge";
import {
  getBracketAdvancementLabel,
  getBracketEliminationLabel,
} from "@/lib/playoff-labels";
import type { BracketType } from "@/lib/playoff-bracket";
import type {
  BracketMatchView,
  BracketRound,
  BracketTeam,
} from "@/lib/queries/playoff-bracket";

/**
 * The rendered bracket: one card per round, rounds stacked on mobile and laid
 * out side by side from lg up. Server component, zero client JS.
 *
 * THE INVERSION: in the Toilet Bowl the advancing team is the one that LOST
 * the game, so this component never derives a result from the scores and never
 * prints a "W" there. The advancing team is badged "SANK" (rust) instead of
 * "ADVANCES" (green), and the round header carries the explainer line.
 */

interface PlayoffBracketRoundsProps {
  rounds: BracketRound[];
  bracketType: BracketType;
  seasonYear: number;
}

export function PlayoffBracketRounds({
  rounds,
  bracketType,
  seasonYear,
}: PlayoffBracketRoundsProps) {
  if (rounds.length === 0) return null;

  const columns =
    rounds.length >= 3
      ? "lg:grid-cols-3"
      : rounds.length === 2
        ? "lg:grid-cols-2"
        : "lg:grid-cols-1";

  return (
    <div
      data-testid={`bracket-${bracketType}`}
      className={`space-y-6 lg:grid lg:items-start lg:gap-6 lg:space-y-0 ${columns}`}
    >
      {rounds.map((round) => (
        <BracketRoundGroup
          key={`${bracketType}-r${round.round}`}
          round={round}
          bracketType={bracketType}
          seasonYear={seasonYear}
        />
      ))}
    </div>
  );
}

function BracketRoundGroup({
  round,
  bracketType,
  seasonYear,
}: {
  round: BracketRound;
  bracketType: BracketType;
  seasonYear: number;
}) {
  return (
    <div className="card-surface p-4 md:p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-kicker whitespace-nowrap">{round.label}</h3>
        <span className="text-caption whitespace-nowrap text-text-tertiary">
          Week <span className="font-mono tabular-nums">{round.week}</span>
        </span>
      </div>
      <div className="space-y-3">
        {round.matches.map((match) => (
          <BracketMatchCard
            key={`${bracketType}-m${match.matchNumber}`}
            match={match}
            seasonYear={seasonYear}
          />
        ))}
      </div>
    </div>
  );
}

function BracketMatchCard({
  match,
  seasonYear,
}: {
  match: BracketMatchView;
  seasonYear: number;
}) {
  const isToiletBowl = match.bracketType === "losers";
  const isHeadline = match.placement === 1;
  // The Toilet Bowl final is the sting, not a prize: gold is reserved for the
  // real championship.
  const emphasis = isHeadline
    ? isToiletBowl
      ? "border-accent-warm/30 ring-1 ring-accent-warm/20"
      : "border-accent-gold/30 ring-1 ring-accent-gold/20"
    : "border-border";

  const body = (
    <div
      data-testid={`bracket-match-${match.bracketType}-${match.matchNumber}`}
      className={`w-full overflow-hidden rounded-lg border bg-surface transition-colors hover:border-border-strong ${emphasis}`}
    >
      {match.placementLabel && (
        <div className="flex items-center gap-2 border-b border-divider px-4 py-2">
          <span
            className={`text-caption ${
              isHeadline
                ? isToiletBowl
                  ? "text-accent-warm"
                  : "text-accent-gold"
                : "text-text-tertiary"
            }`}
          >
            {match.placementLabel}
          </span>
        </div>
      )}
      <BracketTeamRow
        team={match.team1}
        fromMatch={match.team1FromMatch}
        match={match}
      />
      <div className="h-px bg-divider" />
      <BracketTeamRow
        team={match.team2}
        fromMatch={match.team2FromMatch}
        match={match}
      />
    </div>
  );

  // Only link out once the week has real games behind it.
  if (!match.team1 && !match.team2) return body;

  return (
    <Link
      href={`/seasons/${seasonYear}/week/${match.week}`}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-gold/50 rounded-lg"
    >
      {body}
    </Link>
  );
}

function BracketTeamRow({
  team,
  fromMatch,
  match,
}: {
  team: BracketTeam | null;
  fromMatch: number | null;
  match: BracketMatchView;
}) {
  if (!team) {
    return (
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-body-sm text-text-muted">
          {fromMatch != null ? `TBD from match ${fromMatch}` : "TBD"}
        </span>
      </div>
    );
  }

  const isToiletBowl = match.bracketType === "losers";
  const advanced = match.decided && team.advanced;
  const eliminated = match.decided && !team.advanced;

  // Emphasis follows the story of the bracket: up top the team that moved on
  // is the winner, in the Toilet Bowl it is the team that sank.
  const rowBg = advanced
    ? isToiletBowl
      ? "bg-accent-warm-light"
      : "bg-surface-muted"
    : "";

  return (
    <div
      data-testid="bracket-team-row"
      data-state={advanced ? "advanced" : eliminated ? "eliminated" : "pending"}
      className={`flex items-center gap-2 px-3 py-3 md:gap-3 md:px-4 ${rowBg}`}
    >
      {/* min-w-0 lets the franchise name truncate instead of pushing the score
          and badge out of the card on a narrow round column. */}
      <div className="min-w-0 flex-1">
        <FranchiseIdentity
          franchise={{
            slug: team.franchiseSlug,
            name: team.franchiseName,
            abbreviation: team.franchiseAbbreviation ?? undefined,
            brandingColor: team.franchiseBrandingColor ?? undefined,
            avatarUrl: team.avatarUrl,
          }}
          variant="compact"
        />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {advanced && (
          <SuperlativeBadge
            text={getBracketAdvancementLabel(match.bracketType)}
            variant={isToiletBowl ? "brown" : "green"}
          />
        )}
        {eliminated && (
          <span className="text-caption text-text-tertiary">
            {getBracketEliminationLabel(match.bracketType)}
          </span>
        )}
        <span
          className={`font-mono text-sm tabular-nums ${
            advanced && !isToiletBowl
              ? "font-bold text-text-primary"
              : advanced
                ? "font-bold text-accent-warm"
                : "text-text-tertiary"
          }`}
        >
          {team.points != null && team.points > 0 ? team.points.toFixed(2) : "-"}
        </span>
      </div>
    </div>
  );
}
