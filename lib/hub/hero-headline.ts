// Pure, DB-free copy for the between-weeks hero: the kicker's schedule tail,
// the serif headline, and the data-built dek fallback.
//
// The headline used to be a day count ("Two days to kickoff."), which Blake
// called awful to read: it said nothing about this league. It is now a take,
// built from a ranked ladder where every rung is literally true of its inputs.
// The schedule fact moved to the kicker line ("... · Week 3 · Kickoff
// Thursday"), where a plain fact belongs.
//
// Two modes, keyed on whether the post-week recap renders under the hero:
//   * recap shown: lead with LAST week's finals (a mercy-rule loss, a monster
//     score, a photo finish, a dud), then fall through to the slate rungs;
//   * recap not shown: lead with THIS week's slate (a clash of unbeatens, two
//     winless teams meeting, a division lead in play, a named rivalry, a
//     winless team's next opponent), then fall through to the finals rungs.
// The choice varies with what happened, never with a rotating pool.

import { daysUntil } from "@/lib/hub/live-pill-label";
import { kickoffWeekdayName } from "@/lib/hub/between-weeks";
import { formatRecord } from "@/lib/format-record";
import {
  NO_HERO_CLAIM,
  numeralsIn,
  type HeroClaim,
  type HeroClaimKind,
} from "@/lib/hub/hero-claim";

export {
  NO_HERO_CLAIM,
  numeralSegments,
  repeatsHeroNumber,
  type HeroClaim,
  type HeroClaimKind,
} from "@/lib/hub/hero-claim";

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** A final margin at least this wide is a mercy-rule loss. Matches The Book's
 * blowout special line (lib/book/props.ts, 40.5) to the nearest whole point. */
export const HERO_MERCY_MARGIN = 40;
/** A team score at least this high is a monster week for this league (weekly
 * scores run roughly 90 to 200). */
export const HERO_MONSTER_SCORE = 180;
/** A final decided by this little (and not a tie) is a photo finish. */
export const HERO_PHOTO_MARGIN = 3;
/** A team score at or below this is a dud week. */
export const HERO_DUD_SCORE = 90;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface HeroFinalSide {
  franchiseId: string;
  name: string;
  points: number;
}

/**
 * One completed final from the prior week. getWeekRecap's RecapResult
 * satisfies this shape, as does finalsFromPairedMatchups' output. A margin
 * of 0 is a tie (winner/loser then only order the pair).
 */
export interface HeroFinal {
  winner: HeroFinalSide;
  loser: HeroFinalSide;
  margin: number;
}

export interface HeroSlateTeam {
  franchiseId: string;
  name: string;
  wins: number;
  losses: number;
  ties: number;
}

export interface HeroSlateGame {
  a: HeroSlateTeam;
  b: HeroSlateTeam;
  /** The division's name when this is a division game, else null. */
  divisionName: string | null;
  /** canFlipDivisionLead: the winner is guaranteed to lead or share it. */
  canFlipDivisionLead: boolean;
  /** The commish-named rivalry this pair belongs to, if any. */
  namedRivalry: { name: string } | null;
  /** True for the featured Game of the Week. */
  isGameOfWeek: boolean;
}

export interface HeroHeadlineInput {
  /** True when the post-week recap renders under the hero. */
  recapShown: boolean;
  /** The prior week's finals; empty when it is not complete (or week 1). */
  priorFinals: readonly HeroFinal[];
  /** This week's slate. Records are the standings going into the week. */
  slate: readonly HeroSlateGame[];
  /** Every team's record going into the week (for the unbeaten count). */
  standings: readonly HeroSlateTeam[];
}

export type HeroRung =
  | "mercy"
  | "monster"
  | "photo-finish"
  | "dud"
  | "unbeaten-clash"
  | "winless-clash"
  | "division-flip"
  | "named-rivalry"
  | "winless-watch"
  | "fallback";

export interface HeroLine {
  rung: HeroRung;
  text: string;
  claim: HeroClaim;
}


export const HERO_FALLBACK_HEADLINE = "The slate is set.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NUMBER_WORDS = [
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
  "Eleven",
  "Twelve",
] as const;

/** "Four" for 4; the numeral past twelve. Capitalized (it starts a sentence). */
function countWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

function pts(n: number): string {
  return n.toFixed(1);
}

function games(t: HeroSlateTeam): number {
  return t.wins + t.losses + t.ties;
}

function isUnbeaten(t: HeroSlateTeam): boolean {
  return games(t) > 0 && t.losses === 0 && t.ties === 0;
}

function isWinless(t: HeroSlateTeam): boolean {
  return games(t) > 0 && t.wins === 0 && t.ties === 0;
}

function winPct(t: HeroSlateTeam): number {
  const g = games(t);
  return g === 0 ? 0 : (t.wins + t.ties / 2) / g;
}

function record(t: HeroSlateTeam): string {
  return formatRecord(t.wins, t.losses, t.ties);
}

/** Featured game first, then slate order, so a rung prefers the GotW. */
function gotwFirst(slate: readonly HeroSlateGame[]): HeroSlateGame[] {
  return [...slate].sort((x, y) => Number(y.isGameOfWeek) - Number(x.isGameOfWeek));
}

function line(
  rung: HeroRung,
  text: string,
  kind: HeroClaimKind,
  franchiseIds: readonly string[]
): HeroLine {
  return { rung, text, claim: { kind, franchiseIds, numbers: numeralsIn(text) } };
}

// ---------------------------------------------------------------------------
// Rungs: last week's finals
// ---------------------------------------------------------------------------

function decided(finals: readonly HeroFinal[]): HeroFinal[] {
  return finals.filter((f) => f.margin > 0);
}

function mercyRung(finals: readonly HeroFinal[]): HeroLine | null {
  const worst = decided(finals).reduce<HeroFinal | null>(
    (best, f) => (!best || f.margin > best.margin ? f : best),
    null
  );
  if (!worst || worst.margin < HERO_MERCY_MARGIN) return null;
  return line(
    "mercy",
    `${worst.loser.name} lost by ${pts(worst.margin)}. It was not that close.`,
    "blowout",
    [worst.loser.franchiseId, worst.winner.franchiseId]
  );
}

function allSides(finals: readonly HeroFinal[]): HeroFinalSide[] {
  return finals.flatMap((f) => [f.winner, f.loser]);
}

function monsterRung(finals: readonly HeroFinal[]): HeroLine | null {
  const sides = allSides(finals);
  if (sides.length === 0) return null;
  const top = sides.reduce((a, b) => (b.points > a.points ? b : a));
  if (top.points < HERO_MONSTER_SCORE) return null;
  // "and the rest of the league noticed" needs the top score to be the top
  // score alone: a shared high is not a statement about one team.
  if (sides.filter((s) => s.points === top.points).length > 1) return null;
  return line(
    "monster",
    `${top.name} put up ${pts(top.points)} and the rest of the league noticed.`,
    "monster-score",
    [top.franchiseId]
  );
}

function photoFinishRung(finals: readonly HeroFinal[]): HeroLine | null {
  const closest = decided(finals).reduce<HeroFinal | null>(
    (best, f) => (!best || f.margin < best.margin ? f : best),
    null
  );
  if (!closest || closest.margin > HERO_PHOTO_MARGIN) return null;
  return line(
    "photo-finish",
    `Decided by ${pts(closest.margin)}. ${closest.loser.name} is still refreshing the box score.`,
    "photo-finish",
    [closest.loser.franchiseId, closest.winner.franchiseId]
  );
}

function dudRung(finals: readonly HeroFinal[]): HeroLine | null {
  const sides = allSides(finals);
  if (sides.length === 0) return null;
  const low = sides.reduce((a, b) => (b.points < a.points ? b : a));
  if (low.points > HERO_DUD_SCORE) return null;
  if (sides.filter((s) => s.points === low.points).length > 1) return null;
  return line("dud", `${low.name} managed ${pts(low.points)}. That was the whole week.`, "dud", [
    low.franchiseId,
  ]);
}

function finalsRungs(finals: readonly HeroFinal[]): HeroLine[] {
  return [mercyRung(finals), monsterRung(finals), photoFinishRung(finals), dudRung(finals)].filter(
    (l): l is HeroLine => l != null
  );
}

// ---------------------------------------------------------------------------
// Rungs: this week's slate
// ---------------------------------------------------------------------------

function unbeatenClashRung(input: HeroHeadlineInput): HeroLine | null {
  // Only when the Game of the Week itself is two unbeatens: the headline is
  // the hook for the card below it, not a stat with nowhere to go.
  const gotw = input.slate.find((g) => g.isGameOfWeek);
  if (!gotw || !isUnbeaten(gotw.a) || !isUnbeaten(gotw.b)) return null;
  if (record(gotw.a) !== record(gotw.b)) return null;
  const rec = record(gotw.a);
  const count = input.standings.filter((t) => isUnbeaten(t) && record(t) === rec).length;
  if (count < 2) return null;
  const text =
    count === 2
      ? `Two teams are ${rec}, and they play each other this week.`
      : `${countWord(count)} teams are ${rec}. Two of them play each other this week.`;
  return line("unbeaten-clash", text, "slate", [gotw.a.franchiseId, gotw.b.franchiseId]);
}

function winlessClashRung(input: HeroHeadlineInput): HeroLine | null {
  const clash = gotwFirst(input.slate).find((g) => isWinless(g.a) && isWinless(g.b));
  if (!clash || games(clash.a) !== games(clash.b)) return null;
  return line(
    "winless-clash",
    `Somebody is about to be ${formatRecord(0, clash.a.losses + 1, 0)}.`,
    "slate",
    [clash.a.franchiseId, clash.b.franchiseId]
  );
}

function divisionFlipRung(input: HeroHeadlineInput): HeroLine | null {
  const anyPlayed = input.standings.some((t) => games(t) > 0);
  if (!anyPlayed) return null;
  const game = gotwFirst(input.slate).find((g) => g.canFlipDivisionLead && g.divisionName);
  if (!game) return null;
  return line(
    "division-flip",
    `${game.a.name} and ${game.b.name} play for a share of ${game.divisionName}.`,
    "slate",
    [game.a.franchiseId, game.b.franchiseId]
  );
}

function namedRivalryRung(input: HeroHeadlineInput): HeroLine | null {
  const game = gotwFirst(input.slate).find((g) => g.namedRivalry);
  if (!game?.namedRivalry) return null;
  return line(
    "named-rivalry",
    game.isGameOfWeek
      ? `${game.namedRivalry.name} is the Game of the Week.`
      : `${game.namedRivalry.name} is back on the slate.`,
    "slate",
    [game.a.franchiseId, game.b.franchiseId]
  );
}

function winlessWatchRung(input: HeroHeadlineInput): HeroLine | null {
  // The winless team with the hardest next game: the sharpest version of it.
  let best: { team: HeroSlateTeam; opp: HeroSlateTeam } | null = null;
  for (const g of input.slate) {
    for (const [team, opp] of [
      [g.a, g.b],
      [g.b, g.a],
    ] as const) {
      if (!isWinless(team) || isWinless(opp)) continue;
      if (!best || winPct(opp) > winPct(best.opp)) best = { team, opp };
    }
  }
  if (!best) return null;
  return line(
    "winless-watch",
    `${best.team.name} is ${record(best.team)} and gets ${best.opp.name} (${record(best.opp)}) next.`,
    "slate",
    [best.team.franchiseId, best.opp.franchiseId]
  );
}

function slateRungs(input: HeroHeadlineInput): HeroLine[] {
  return [
    unbeatenClashRung(input),
    winlessClashRung(input),
    divisionFlipRung(input),
    namedRivalryRung(input),
    winlessWatchRung(input),
  ].filter((l): l is HeroLine => l != null);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Every rung that fires, in preference order for the current mode, ending
 * with the neutral fallback. The headline is the first; the dek fallback is
 * the first whose rung differs from the headline's.
 */
export function heroHeadlineLadder(input: HeroHeadlineInput): HeroLine[] {
  const finals = finalsRungs(input.priorFinals);
  const slate = slateRungs(input);
  const ordered = input.recapShown ? [...finals, ...slate] : [...slate, ...finals];
  return [...ordered, { rung: "fallback", text: HERO_FALLBACK_HEADLINE, claim: NO_HERO_CLAIM }];
}

/** The hero headline: the sharpest true line for this week. */
export function heroHeadline(input: HeroHeadlineInput): HeroLine {
  return heroHeadlineLadder(input)[0];
}

/**
 * A second data sentence for the dek when no stored dek can render, built
 * from a DIFFERENT rung than the headline so the two never say the same
 * thing. Null when nothing else fires (the caller then uses the neutral
 * HERO_DEK_FALLBACK constant).
 */
export function heroDekFromData(input: HeroHeadlineInput, headline: HeroLine): string | null {
  const next = heroHeadlineLadder(input).find(
    (l) => l.rung !== headline.rung && l.rung !== "fallback"
  );
  return next?.text ?? null;
}

/**
 * The kicker's schedule clause: "Kickoff Thursday", "Kickoff Today", or "The
 * Slate Is Set" when the kickoff is unknown, already past, or a week or more
 * out (a bare weekday would then be ambiguous). Title case like the rest of
 * the kicker; the kicker class uppercases it.
 */
export function heroKickerTail(nextKickoff: Date | null, now: Date = new Date()): string {
  if (!nextKickoff || nextKickoff.getTime() <= now.getTime()) return "The Slate Is Set";
  const days = daysUntil(nextKickoff, now);
  if (days === 0) return "Kickoff Today";
  if (days > 6) return "The Slate Is Set";
  return `Kickoff ${kickoffWeekdayName(nextKickoff)}`;
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/** The paired-matchup fields finalsFromPairedMatchups reads. */
export interface PairedFinalLike {
  status: string;
  homeTeam: { franchiseId: string; franchiseName: string; points: number; isWinner: boolean | null };
  awayTeam: { franchiseId: string; franchiseName: string; points: number; isWinner: boolean | null };
}

/**
 * Prior-week finals from getMatchupsByWeek rows. Empty unless EVERY matchup
 * is `complete` (the same gate getWeekRecap uses: a half-played week has no
 * finals to talk about, and the signal is status, never a points heuristic).
 */
export function finalsFromPairedMatchups(paired: readonly PairedFinalLike[]): HeroFinal[] {
  if (paired.length === 0 || paired.some((m) => m.status !== "complete")) return [];
  return paired.map((m) => {
    const h = m.homeTeam;
    const a = m.awayTeam;
    // Sleeper's is_winner is authoritative; points only order the pair when
    // neither side carries the flag (getWeekRecap does the same).
    const homeWon = h.isWinner === true || (a.isWinner !== true && h.points >= a.points);
    const [w, l] = homeWon ? [h, a] : [a, h];
    return {
      winner: { franchiseId: w.franchiseId, name: w.franchiseName, points: w.points },
      loser: { franchiseId: l.franchiseId, name: l.franchiseName, points: l.points },
      margin: Math.round(Math.abs(w.points - l.points) * 10) / 10,
    };
  });
}
