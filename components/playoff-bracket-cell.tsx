import Link from "next/link";
import { TeamLink } from "@/components/team-link";
import type { BracketType } from "@/lib/playoff-bracket";
import type {
  BracketMatchView,
  BracketTeam,
} from "@/lib/queries/playoff-bracket";
import type { BracketCellPlacement } from "@/lib/playoff-bracket-layout";
import {
  getBracketAdvancementLabel,
  getBracketEliminationLabel,
  getBracketShortAdvancementLabel,
  getBracketShortEliminationLabel,
  getFeederLabel,
} from "@/lib/playoff-labels";

/**
 * One cell of the bracket stage: a played match, a first-round bye
 * pass-through, or a slot still waiting on a feeder. Server component, zero
 * client JS; position comes from the caller as a calc() style built off the
 * stage's geometry variables.
 *
 * THE INVERSION: nothing here compares points. Whether a row advanced comes
 * from team.advanced, which is set from the stored advancing_roster_id, so the
 * Toilet Bowl's lower scorer is the one badged "SANK".
 */

const DASH = "–";

function dotColor(color: string | null | undefined): string {
  return color ?? "var(--text-muted)";
}

/** The score a cell shows: real once played, an en dash while pending. */
function formatScore(team: BracketTeam, decided: boolean): string {
  if (team.points != null && (decided || team.points > 0)) {
    return team.points.toFixed(2);
  }
  return DASH;
}

// ---------------------------------------------------------------------------
// Team row
// ---------------------------------------------------------------------------

function TeamRow({
  team,
  match,
  bracketType,
}: {
  team: BracketTeam;
  match: BracketMatchView;
  bracketType: BracketType;
}) {
  const isToiletBowl = bracketType === "losers";
  const advanced = match.decided && team.advanced;
  const eliminated = match.decided && !team.advanced;

  const shortAdvance = getBracketShortAdvancementLabel(bracketType);
  const fullAdvance = getBracketAdvancementLabel(bracketType);
  const shortOut = getBracketShortEliminationLabel(bracketType);
  const fullOut = getBracketEliminationLabel(bracketType);

  return (
    <div
      data-testid="bracket-team-row"
      data-state={advanced ? "advanced" : eliminated ? "eliminated" : "pending"}
      data-tone={advanced && isToiletBowl ? "sank" : undefined}
      className="bracket-row"
    >
      <span
        className="bracket-dot"
        style={{ background: dotColor(team.franchiseBrandingColor) }}
        aria-hidden="true"
      />
      {isLinked(match) ? (
        <span className="bracket-name">{team.franchiseName}</span>
      ) : (
        <TeamLink slug={team.franchiseSlug} className="bracket-name">
          {team.franchiseName}
        </TeamLink>
      )}
      {advanced && (
        <span
          className="bracket-chip"
          data-tone={isToiletBowl ? "sank" : undefined}
        >
          {shortAdvance}
          {shortAdvance !== fullAdvance && (
            <span className="sr-only"> {fullAdvance}</span>
          )}
        </span>
      )}
      {eliminated && (
        <span className="bracket-out">
          {shortOut}
          {shortOut !== fullOut && <span className="sr-only"> {fullOut}</span>}
        </span>
      )}
      <span className="bracket-score font-mono">
        {formatScore(team, match.decided)}
      </span>
    </div>
  );
}

/** A slot whose occupant is still being decided upstream. */
function PendingRow({
  fromMatch,
  bracketType,
}: {
  fromMatch: number | null;
  bracketType: BracketType;
}) {
  return (
    <div
      data-testid="bracket-team-row"
      data-state="pending"
      className="bracket-row"
    >
      <span className="bracket-dot" data-hollow="true" aria-hidden="true" />
      <span className="bracket-sub">
        {fromMatch != null ? getFeederLabel(bracketType, fromMatch) : "TBD"}
      </span>
      <span className="bracket-score font-mono">{DASH}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

export function BracketCell({
  cell,
  bracketType,
  seasonYear,
  style,
}: {
  cell: BracketCellPlacement;
  bracketType: BracketType;
  seasonYear: number;
  style: React.CSSProperties;
}) {
  if (cell.kind === "match" && cell.match) return (
    <BracketMatchCell
      cell={cell}
      match={cell.match}
      bracketType={bracketType}
      seasonYear={seasonYear}
      style={style}
    />
  );

  // A bye or an unfilled slot: same footprint so the geometry holds and the
  // connector runs straight through, dashed so it never reads as a played game.
  return (
    <div
      data-testid={`bracket-cell-${bracketType}-${cell.kind}`}
      data-kind={cell.kind}
      className="bracket-cell"
      style={style}
    >
      {cell.kind === "bye" && cell.byeTeam ? (
        <>
          <div className="bracket-row">
            <span
              className="bracket-dot"
              style={{ background: dotColor(cell.byeTeam.franchiseBrandingColor) }}
              aria-hidden="true"
            />
            <TeamLink
              slug={cell.byeTeam.franchiseSlug}
              className="bracket-name font-bold text-text-primary"
            >
              {cell.byeTeam.franchiseName}
            </TeamLink>
          </div>
          <div className="bracket-row">
            <span className="bracket-sub">First-round bye</span>
          </div>
        </>
      ) : (
        <>
          <PendingRow fromMatch={cell.fromMatch} bracketType={bracketType} />
          <div className="bracket-row">
            <span className="bracket-sub">TBD</span>
          </div>
        </>
      )}
    </div>
  );
}

function BracketMatchCell({
  cell,
  match,
  bracketType,
  seasonYear,
  style,
}: {
  cell: BracketCellPlacement;
  match: BracketMatchView;
  bracketType: BracketType;
  seasonYear: number;
  style: React.CSSProperties;
}) {
  // Positioned by the stage when bare; when the match has a week behind it the
  // link takes the position and the cell sits statically inside it, so the
  // whole cell is one hit target.
  const linked = isLinked(match);
  const cellNode = (
    <div
      data-testid={`bracket-match-${bracketType}-${match.matchNumber}`}
      data-kind="match"
      data-final={cell.isFinal ? bracketType : undefined}
      className="bracket-cell"
      style={linked ? { position: "static" } : style}
    >
      {/* The gold (or rust) ring is the only visual marker of the final, and a
          ring is color alone: the label carries the same fact in text. */}
      {cell.isFinal && match.placementLabel && (
        <span className="sr-only">{match.placementLabel}</span>
      )}
      <MatchRows match={match} bracketType={bracketType} />
    </div>
  );

  if (!linked) return cellNode;

  return (
    <Link
      href={`/seasons/${seasonYear}/week/${match.week}`}
      className="absolute rounded-[var(--bk-radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-gold/50"
      style={{
        ...style,
        width: "var(--bk-cell-w)",
        height: "var(--bk-cell-h)",
      }}
    >
      {cellNode}
    </Link>
  );
}

function isLinked(match: BracketMatchView): boolean {
  return match.week != null && Boolean(match.team1 || match.team2);
}

function MatchRows({
  match,
  bracketType,
}: {
  match: BracketMatchView;
  bracketType: BracketType;
}) {
  return (
    <>
      {match.team1 ? (
        <TeamRow team={match.team1} match={match} bracketType={bracketType} />
      ) : (
        <PendingRow fromMatch={match.team1FromMatch} bracketType={bracketType} />
      )}
      {match.team2 ? (
        <TeamRow team={match.team2} match={match} bracketType={bracketType} />
      ) : (
        <PendingRow fromMatch={match.team2FromMatch} bracketType={bracketType} />
      )}
    </>
  );
}

/**
 * A placement game, rendered in the lane below the bracket rather than in the
 * columns: it decides where somebody finished, not who moves on.
 */
export function BracketPlacementCell({
  match,
  bracketType,
  seasonYear,
}: {
  match: BracketMatchView;
  bracketType: BracketType;
  seasonYear: number;
}) {
  const body = (
    <div
      data-testid={`bracket-match-${bracketType}-${match.matchNumber}`}
      data-kind="placement"
      className="overflow-hidden rounded-[9px] border border-border bg-surface transition-colors hover:border-border-strong lg:rounded-[10px]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-divider px-2.5 pb-1 pt-1.5 lg:px-3">
        <span className="text-[8px] font-bold uppercase tracking-[.1em] text-text-tertiary lg:text-[9px] lg:tracking-[.12em]">
          {match.placementLabel ?? "Placement Game"}
        </span>
        {match.week != null && (
          <span className="bracket-score font-mono">WK {match.week}</span>
        )}
      </div>
      <MatchRows match={match} bracketType={bracketType} />
    </div>
  );

  if (!isLinked(match)) return body;

  return (
    <Link
      href={`/seasons/${seasonYear}/week/${match.week}`}
      className="block rounded-[9px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-gold/50 lg:rounded-[10px]"
    >
      {body}
    </Link>
  );
}
