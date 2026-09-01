// Pure, DB-free logic for the between-weeks hub (state 1d). Everything here is
// deterministic and unit-tested; the RSC (components/hub/between-weeks-hub.tsx)
// gathers data and hands it to these helpers.

import { formatRecord } from "@/lib/format-record";
import { daysUntil } from "@/lib/hub/live-pill-label";
import { LEAGUE_TIME_ZONE } from "@/lib/time-zone";

// ---------------------------------------------------------------------------
// Game of the Week heuristic
// ---------------------------------------------------------------------------

export interface GotwTeam {
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  /** Division id, or null for a season with no divisions. */
  division: number | null;
  /** Franchise id, used only to identify the week-1 title-game rematch via
   * markTitleRematch; optional since ranking itself never needs it. */
  franchiseId?: string;
}

export interface GotwCandidate {
  matchupId: number;
  teamA: GotwTeam;
  teamB: GotwTeam;
  /** Each team's projected starting total for this matchup, summed from the
   * week's player_week_points pool. Used only when no games have been played
   * yet (record-based ranking is meaningless at 0-0-0); undefined/omitted is
   * treated as 0. */
  projectedA?: number;
  projectedB?: number;
  /** Set by markTitleRematch when this pairing is exactly last season's
   * champion vs. runner-up. Only honored by selectGameOfTheWeek at week 1. */
  isTitleRematch?: boolean;
}

/** Last completed season's title-game participants, order-insensitive. */
export interface TitleGamePair {
  championFranchiseId: string;
  runnerUpFranchiseId: string;
}

/**
 * Flags the candidate whose two franchises are exactly {champion, runnerUp}
 * from last season's title game (order-insensitive). Pure and shared by both
 * Game of the Week callers (the hub RSC and the content generator) so they
 * agree on the same pick. A null titlePair (no completed season, or the query
 * failed) is a no-op.
 */
export function markTitleRematch(
  candidates: GotwCandidate[],
  titlePair: TitleGamePair | null
): GotwCandidate[] {
  if (!titlePair) return candidates;
  const { championFranchiseId, runnerUpFranchiseId } = titlePair;
  return candidates.map((c) => {
    const ids = new Set([c.teamA.franchiseId, c.teamB.franchiseId]);
    const isRematch = ids.has(championFranchiseId) && ids.has(runnerUpFranchiseId);
    return isRematch ? { ...c, isTitleRematch: true } : c;
  });
}

function teamGames(t: GotwTeam): number {
  return t.wins + t.losses + t.ties;
}

function combinedProjected(c: GotwCandidate): number {
  return (c.projectedA ?? 0) + (c.projectedB ?? 0);
}

function projectedCloseness(c: GotwCandidate): number {
  return Math.abs((c.projectedA ?? 0) - (c.projectedB ?? 0));
}

/**
 * Combined win% across both teams, games-weighted so mid-season matchups with
 * unequal games played are compared fairly (a win is worth 1, a tie 0.5).
 */
export function combinedWinPct(c: GotwCandidate): number {
  const games = teamGames(c.teamA) + teamGames(c.teamB);
  if (games === 0) return 0;
  const points =
    c.teamA.wins + c.teamB.wins + (c.teamA.ties + c.teamB.ties) * 0.5;
  return points / games;
}

function teamWinPct(t: GotwTeam): number {
  const games = teamGames(t);
  return games === 0 ? 0 : (t.wins + t.ties * 0.5) / games;
}

/**
 * How evenly matched the two teams are, by win%. Smaller is closer; a marquee
 * game wants two strong teams that are also near each other in the standings.
 */
export function recordCloseness(c: GotwCandidate): number {
  return Math.abs(teamWinPct(c.teamA) - teamWinPct(c.teamB));
}

export function combinedPointsFor(c: GotwCandidate): number {
  return c.teamA.pointsFor + c.teamB.pointsFor;
}

export function isDivisionGame(c: GotwCandidate): boolean {
  return c.teamA.division != null && c.teamA.division === c.teamB.division;
}

/**
 * Picks the Game of the Week matchupId, or null when there are no candidates.
 *
 * Heuristic: prefer a division matchup (a rematch with stakes); among the pool,
 * rank by the two teams' combined record, breaking ties by how close the two
 * are, then by combined points-for, then matchupId for determinism. When no
 * division game is on the slate, the whole slate is the pool.
 *
 * When no games have been played yet (week 1: every candidate is 0-0-0), the
 * record-based ranking has nothing to sort on and degrades to an arbitrary
 * pick by matchupId. In that case rank by combined projected strength
 * instead (highest first), breaking ties by how evenly matched the two
 * projections are, then matchupId. `anyGamesPlayed` defaults to an
 * auto-detection from the candidates' records so existing callers keep their
 * current behavior unchanged.
 *
 * Week-1 title rematch override: this league opens every season with a
 * rematch of the prior season's championship game (the "HMLML Bowl"). When
 * `week` is exactly 1 and exactly one candidate carries `isTitleRematch`
 * (set by markTitleRematch), that candidate wins outright, before any
 * record- or projection-based ranking runs. The override is scoped to week 1
 * only (weeks 2+ pass `week` unset or non-1 and keep the existing heuristic
 * untouched), and stays inert if zero or more than one candidate is flagged,
 * so the function degrades safely rather than guessing.
 */
export function selectGameOfTheWeek(
  candidates: GotwCandidate[],
  anyGamesPlayed?: boolean,
  week?: number
): number | null {
  if (candidates.length === 0) return null;

  if (week === 1) {
    const flagged = candidates.filter((c) => c.isTitleRematch);
    if (flagged.length === 1) return flagged[0].matchupId;
  }

  const played =
    anyGamesPlayed ??
    candidates.some((c) => teamGames(c.teamA) + teamGames(c.teamB) > 0);

  const divisionGames = candidates.filter(isDivisionGame);
  const pool = divisionGames.length > 0 ? divisionGames : candidates;

  const ranked = [...pool].sort((a, b) => {
    if (!played) {
      const projDiff = combinedProjected(b) - combinedProjected(a);
      if (projDiff !== 0) return projDiff;

      const closenessDiff = projectedCloseness(a) - projectedCloseness(b);
      if (closenessDiff !== 0) return closenessDiff;

      return a.matchupId - b.matchupId;
    }

    const winPctDiff = combinedWinPct(b) - combinedWinPct(a);
    if (winPctDiff !== 0) return winPctDiff;

    const closenessDiff = recordCloseness(a) - recordCloseness(b);
    if (closenessDiff !== 0) return closenessDiff;

    const pfDiff = combinedPointsFor(b) - combinedPointsFor(a);
    if (pfDiff !== 0) return pfDiff;

    return a.matchupId - b.matchupId;
  });

  return ranked[0].matchupId;
}

// ---------------------------------------------------------------------------
// Hero headline
// ---------------------------------------------------------------------------

const DAY_WORDS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
] as const;

/**
 * Serif hero headline derived from the days-to-kickoff count, staying graceful
 * across counts and degrading to a static line when the kickoff is unknown or
 * already past. Copy carries the site voice; no em-dashes.
 */
export function betweenWeeksHeadline(
  nextKickoff: Date | null,
  now: Date = new Date()
): string {
  if (!nextKickoff) return "The slate is set.";
  if (nextKickoff.getTime() - now.getTime() <= 0) return "The slate is set.";

  // Shared floor-based day count (matches the countdown DAYS card and the pill).
  const days = daysUntil(nextKickoff, now);
  if (days === 0) return "Kickoff is today.";

  const word = DAY_WORDS[days] ?? String(days);
  const unit = days === 1 ? "day" : "days";
  return `${word} ${unit} until it matters again.`;
}

// ---------------------------------------------------------------------------
// Head-to-head formatting
// ---------------------------------------------------------------------------

export interface H2HInput {
  /** Wins for team A (the left/home team) over team B. */
  wins: number;
  losses: number;
  ties: number;
}

/**
 * Compact all-time series line for the Game of the Week header, e.g.
 * "All-time GW leads 14-9". Reads from team A's perspective; the leader's
 * abbreviation is named so color is never the only signal.
 */
export function formatH2HLine(
  h2h: H2HInput,
  abbrevA: string,
  abbrevB: string
): string {
  const total = h2h.wins + h2h.losses + h2h.ties;
  if (total === 0) return "First-ever meeting";
  if (h2h.wins > h2h.losses) return `All-time ${abbrevA} leads ${h2h.wins}-${h2h.losses}`;
  if (h2h.losses > h2h.wins) return `All-time ${abbrevB} leads ${h2h.losses}-${h2h.wins}`;
  return `All-time series even ${h2h.wins}-${h2h.losses}`;
}

/**
 * The all-time series record for a slate card's top-right, from team A's
 * perspective ("6-0"). Two teams that have never met show "1st mtg" (the short
 * form; the Game of the Week card says "First-ever meeting" via formatH2HLine).
 */
export function formatSlateH2H(h2h: H2HInput): string {
  if (h2h.wins + h2h.losses + h2h.ties === 0) return "1st mtg";
  return formatRecord(h2h.wins, h2h.losses, h2h.ties);
}

/**
 * The Game of the Week kicker's second clause, kept truthful and generic.
 * Before a single game has been played, "first place" and "bragging rights"
 * are both fabrications (nobody has won or lost anything yet), so that case
 * gets its own truthful branch. Once games exist: either team leading its
 * division means first place is on the line; otherwise we fall back to
 * bragging rights so we never overstate the stakes.
 */
export function stakesClause(
  aLeadsDivision: boolean,
  bLeadsDivision: boolean,
  anyGamesPlayed: boolean
): string {
  if (!anyGamesPlayed) return "Season openers";
  return aLeadsDivision || bLeadsDivision
    ? "First place on the line"
    : "Bragging rights on the line";
}

/**
 * A truthful, records-based angle for a slate matchup when no editorial blurb
 * exists for the pair. Site voice, no em-dashes. `kickoffWeekday` names the
 * actual day the slate opens (e.g. "Wednesday" for the 2026 week-1 opener),
 * never a hardcoded day.
 */
export function genericSlateAngle(
  recordA: string,
  recordB: string,
  kickoffWeekday: string
): string {
  return `${recordA} against ${recordB}. Somebody's number moves ${kickoffWeekday}.`;
}

/**
 * Full weekday name (e.g. "Wednesday") of a kickoff instant in the league's
 * home timezone, for genericSlateAngle. Falls back to "kickoff" when there is
 * no kickoff date to name a day from.
 */
export function kickoffWeekdayName(target: Date | null): string {
  if (!target) return "kickoff";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: LEAGUE_TIME_ZONE,
  }).format(target);
}
