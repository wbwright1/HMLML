// Pure, DB-free logic for the between-weeks hub (state 1d). Everything here is
// deterministic and unit-tested; the data is gathered once by
// lib/hub/gotw-context.ts (shared by the hub RSC and the content generator, so
// the two can never feature different games) and handed to these helpers.

import { formatRecord } from "@/lib/format-record";
import { LEAGUE_TIME_ZONE } from "@/lib/time-zone";
import type { PlayoffRaceTag } from "@/lib/queries/playoff-race";

// ---------------------------------------------------------------------------
// Game of the Week: inputs
// ---------------------------------------------------------------------------

export interface GotwTeam {
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  /** Division id, or null for a season with no divisions. */
  division: number | null;
  /** Franchise id; identifies the week-1 title rematch via markTitleRematch. */
  franchiseId?: string;
  /** 1-based place inside the division by the seedTeams tiebreak chain. */
  divisionRank?: number | null;
  /** 1-based place league-wide by the seedTeams tiebreak chain. */
  overallRank?: number | null;
  /** Provable playoff-race tag (lib/queries/playoff-race.ts, week 8+ only). */
  raceTag?: PlayoffRaceTag | null;
  /**
   * Projected starting total for this matchup, from the week's starter pool.
   * Only drives the ranking before any game has been played (a 0-0 record
   * has nothing to rank on); omitted is treated as 0.
   */
  projected?: number;
}

/** All-time series from team A's perspective. */
export interface GotwH2H {
  wins: number;
  losses: number;
  ties: number;
}

export interface GotwLastMeeting {
  seasonYear: number;
  week: number;
  /** Winning side, or null for a tie. */
  winner: "A" | "B" | null;
  pointsA: number;
  pointsB: number;
  isPlayoff: boolean;
}

/** A commish-named rivalry (lib/queries/rivalries.ts, via namedRivalryLookupFrom). */
export interface GotwNamedRivalry {
  name: string;
  tagline: string | null;
}

export interface GotwCandidate {
  matchupId: number;
  teamA: GotwTeam;
  teamB: GotwTeam;
  /** Set by markTitleRematch; only honored at week 1. */
  isTitleRematch?: boolean;
  /**
   * Division game in which EITHER side leaves the week leading (or sharing
   * the lead of) the division if it wins, whatever the division's other
   * games do. See canFlipDivisionLead.
   */
  canFlipDivisionLead?: boolean;
  h2h?: GotwH2H | null;
  lastMeeting?: GotwLastMeeting | null;
  /** Season years the pair met in a playoff game, newest first. */
  playoffMeetingYears?: number[];
  /** Mutual most-played opponents (lib/queries/rivalry-week.ts). */
  isMutualRival?: boolean;
  namedRivalry?: GotwNamedRivalry | null;
  /** The Book's spread for this game when The Book is trading this week. */
  bookSpread?: number | null;
  /** How many of the two franchises were featured as last week's GotW (0-2). */
  featuredLastWeek?: number;
}

export interface GotwSelectContext {
  week: number;
  /** League-wide: has any game of this season been played? Defaults to a
   * detection from the candidates' records. */
  anyGamesPlayed?: boolean;
}

// ---------------------------------------------------------------------------
// Game of the Week: reasons and weights
// ---------------------------------------------------------------------------

/**
 * Why a game is worth featuring. Every reason is a claim the data proves, so
 * the kicker and blurb built from them are true by construction.
 */
export type GotwReason =
  | "title-rematch"
  | "named-rivalry"
  | "division-lead-flip"
  | "playoff-clinch"
  | "unbeatens"
  | "top-of-table"
  | "series-on-the-line"
  | "coin-flip-line"
  | "playoff-history"
  | "mutual-rival"
  | "season-opener"
  | "pride";

/**
 * Score added per reason. Declaration order doubles as the tiebreak order
 * between equal weights, so it is also the order reasons are reported in.
 *
 * - title-rematch: informational only; the week-1 rematch is an OVERRIDE
 *   (selectGameOfTheWeek returns it before any scoring runs).
 * - named-rivalry is the biggest bonus: a rivalry the league named itself is
 *   the one game nobody needs sold to them. It still does not beat two
 *   unbeatens fighting for a division on its own merits.
 * - division-lead-flip / playoff-clinch: real standings consequences.
 * - unbeatens stacks on top of the record-quality base on purpose, so two
 *   2-0 teams crush a 2-0 team against an 0-2 team.
 * - The small ones (series, line, playoff history, mutual rival) break ties
 *   between otherwise similar games.
 */
export const GOTW_REASON_WEIGHTS: Readonly<Record<GotwReason, number>> = Object.freeze({
  "title-rematch": 100,
  "named-rivalry": 25,
  "division-lead-flip": 15,
  "playoff-clinch": 15,
  unbeatens: 10,
  "top-of-table": 8,
  "series-on-the-line": 5,
  "coin-flip-line": 5,
  "playoff-history": 4,
  "mutual-rival": 4,
  "season-opener": 0,
  pride: 0,
});

const REASON_ORDER = Object.keys(GOTW_REASON_WEIGHTS) as GotwReason[];

/**
 * Weight of the record-quality base. Quality is a 0..1 blend that leans on
 * the WORSE of the two teams (65/35), because a marquee game needs two good
 * teams, not one great team carrying a mismatch:
 *   2-0 v 2-0 = 1.00, 2-0 v 1-1 = 0.68, 1-1 v 1-1 = 0.50, 2-0 v 0-2 = 0.35.
 */
export const GOTW_QUALITY_WEIGHT = 40;
const QUALITY_MIN_SHARE = 0.65;

/** Deducted when both teams are mathematically eliminated. */
export const GOTW_BOTH_ELIMINATED_PENALTY = 25;
/** Deducted when one team is mathematically eliminated. */
export const GOTW_ONE_ELIMINATED_PENALTY = 8;
/** Deducted per franchise that was last week's Game of the Week. */
export const GOTW_REPEAT_PENALTY = 10;
/** A Book spread this tight (points, either way) reads as a coin flip. */
export const GOTW_COIN_FLIP_SPREAD = 3;
/** An all-time series needs this many games before "within a game" means anything. */
export const GOTW_SERIES_MIN_GAMES = 4;
/** "Top of the table" means both teams sit in the league's top N. */
export const GOTW_TOP_OF_TABLE = 3;

export interface GotwPick {
  matchupId: number;
  /** Every reason this game carries, heaviest first. Never empty. */
  reasons: GotwReason[];
  score: number;
}

// ---------------------------------------------------------------------------
// Game of the Week: helpers
// ---------------------------------------------------------------------------

/** Last completed season's title-game participants, order-insensitive. */
export interface TitleGamePair {
  championFranchiseId: string;
  runnerUpFranchiseId: string;
}

/**
 * Flags the candidate whose two franchises are exactly {champion, runnerUp}
 * from last season's title game (order-insensitive). A null titlePair is a
 * no-op.
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

interface RecordLike {
  wins: number;
  losses: number;
  ties: number;
}

function teamGames(t: RecordLike): number {
  return t.wins + t.losses + t.ties;
}

function winPct(t: RecordLike): number {
  const games = teamGames(t);
  return games === 0 ? 0 : (t.wins + t.ties * 0.5) / games;
}

function isUnbeaten(t: RecordLike): boolean {
  return teamGames(t) > 0 && t.losses === 0 && t.ties === 0;
}

export function isDivisionGame(c: GotwCandidate): boolean {
  return c.teamA.division != null && c.teamA.division === c.teamB.division;
}

/** 0..1 blend of two strengths, weighted toward the weaker one. */
function blendQuality(x: number, y: number): number {
  const lo = Math.min(x, y);
  const hi = Math.max(x, y);
  return QUALITY_MIN_SHARE * lo + (1 - QUALITY_MIN_SHARE) * hi;
}

/** A division team's record plus who it plays this week (null = unknown/bye). */
export interface DivisionRaceTeam extends RecordLike {
  franchiseId: string;
  division: number | null;
  opponentId?: string | null;
}

/**
 * True when a division game decides who leads the division: whichever side
 * wins leaves the week leading or sharing the lead, GUARANTEED, whatever the
 * division's other games do. Records only (win%, ties as half a win); no
 * tiebreakers, so "shares the lead" is a statement about records.
 *
 * The rest of the division is resolved in the worst case for the winner:
 * a division-mate playing outside the division (or with no known opponent)
 * wins; two division-mates playing each other are tried both ways, and the
 * winner must stay on top in every outcome. The hub prints "Division lead on
 * the line" and "whoever wins walks out on top of it" off this flag, so it
 * must never be true when the other games could take the lead away.
 *
 * False for a non-division game, or when either team is missing from
 * `divisionTeams`. Callers gate it on "any game played" themselves: at 0-0
 * every division game trivially qualifies and the claim would be empty.
 */
export function canFlipDivisionLead(
  aId: string,
  bId: string,
  divisionTeams: DivisionRaceTeam[]
): boolean {
  const a = divisionTeams.find((t) => t.franchiseId === aId);
  const b = divisionTeams.find((t) => t.franchiseId === bId);
  if (!a || !b || a.division == null || a.division !== b.division) return false;

  const others = divisionTeams.filter(
    (t) => t.division === a.division && t.franchiseId !== aId && t.franchiseId !== bId
  );
  return canLeadAfterWin(a, b, others) && canLeadAfterWin(b, a, others);
}

function canLeadAfterWin(
  winner: RecordLike,
  loser: RecordLike,
  others: DivisionRaceTeam[]
): boolean {
  const winnerPct = winPct({ ...winner, wins: winner.wins + 1 });
  const loserPct = winPct({ ...loser, losses: loser.losses + 1 });
  if (loserPct > winnerPct) return false;

  // Games between two of the "others": one side must win. Everyone else in
  // the division is assumed to win (the winner's worst case).
  const ids = new Set(others.map((o) => o.franchiseId));
  const internal: [DivisionRaceTeam, DivisionRaceTeam][] = [];
  const seen = new Set<string>();
  for (const o of others) {
    if (seen.has(o.franchiseId)) continue;
    if (o.opponentId && ids.has(o.opponentId)) {
      const opp = others.find((x) => x.franchiseId === o.opponentId)!;
      internal.push([o, opp]);
      seen.add(o.franchiseId);
      seen.add(opp.franchiseId);
    }
  }
  const external = others.filter((o) => !seen.has(o.franchiseId));
  const externalBest = Math.max(
    -1,
    ...external.map((o) => winPct({ ...o, wins: o.wins + 1 }))
  );

  // Enumerate the (tiny) set of intra-division outcomes; the winner is
  // guaranteed the lead only if EVERY outcome leaves nobody strictly ahead.
  const outcomes = 1 << internal.length;
  for (let mask = 0; mask < outcomes; mask++) {
    let best = externalBest;
    internal.forEach(([x, y], i) => {
      const xWins = (mask >> i) & 1;
      const w = xWins ? x : y;
      const l = xWins ? y : x;
      best = Math.max(
        best,
        winPct({ ...w, wins: w.wins + 1 }),
        winPct({ ...l, losses: l.losses + 1 })
      );
    });
    if (best > winnerPct) return false;
  }
  return true;
}

function anyPlayed(candidates: GotwCandidate[]): boolean {
  return candidates.some((c) => teamGames(c.teamA) + teamGames(c.teamB) > 0);
}

/**
 * Every reason a candidate carries, heaviest first. Pure; exported so the
 * kicker, blurb and tests all read the same list.
 */
export function gotwReasons(
  c: GotwCandidate,
  ctx: { week: number; anyGamesPlayed: boolean }
): GotwReason[] {
  const played = ctx.anyGamesPlayed;
  const out = new Set<GotwReason>();

  if (c.isTitleRematch && ctx.week === 1) out.add("title-rematch");
  if (c.namedRivalry) out.add("named-rivalry");
  if (played && isDivisionGame(c) && c.canFlipDivisionLead) out.add("division-lead-flip");
  if (played && (c.teamA.raceTag === "win-and-in" || c.teamB.raceTag === "win-and-in")) {
    out.add("playoff-clinch");
  }
  if (played && isUnbeaten(c.teamA) && isUnbeaten(c.teamB)) out.add("unbeatens");
  if (
    played &&
    c.teamA.overallRank != null &&
    c.teamB.overallRank != null &&
    c.teamA.overallRank <= GOTW_TOP_OF_TABLE &&
    c.teamB.overallRank <= GOTW_TOP_OF_TABLE
  ) {
    out.add("top-of-table");
  }
  const h2h = c.h2h;
  if (h2h && teamGames(h2h) >= GOTW_SERIES_MIN_GAMES && Math.abs(h2h.wins - h2h.losses) <= 1) {
    out.add("series-on-the-line");
  }
  if (c.bookSpread != null && Math.abs(c.bookSpread) <= GOTW_COIN_FLIP_SPREAD) {
    out.add("coin-flip-line");
  }
  if ((c.playoffMeetingYears ?? []).length > 0) out.add("playoff-history");
  if (c.isMutualRival) out.add("mutual-rival");
  if (!played) out.add("season-opener");
  if (out.size === 0) out.add("pride");

  return REASON_ORDER.filter((r) => out.has(r));
}

/**
 * Numeric score for a candidate. Exported for the tests and for diagnostics
 * (the replay script prints it). `maxProjectedTeam` normalizes projections
 * before any game is played.
 */
export function scoreGotwCandidate(
  c: GotwCandidate,
  reasons: GotwReason[],
  ctx: { anyGamesPlayed: boolean; maxProjectedTeam: number }
): number {
  let quality: number;
  if (ctx.anyGamesPlayed) {
    quality = blendQuality(winPct(c.teamA), winPct(c.teamB));
  } else {
    const max = ctx.maxProjectedTeam;
    quality =
      max > 0 ? blendQuality((c.teamA.projected ?? 0) / max, (c.teamB.projected ?? 0) / max) : 0;
  }

  let score = GOTW_QUALITY_WEIGHT * quality;
  for (const r of reasons) {
    if (r !== "title-rematch") score += GOTW_REASON_WEIGHTS[r];
  }

  const elim = [c.teamA, c.teamB].filter((t) => t.raceTag === "eliminated").length;
  if (elim === 2) score -= GOTW_BOTH_ELIMINATED_PENALTY;
  else if (elim === 1) score -= GOTW_ONE_ELIMINATED_PENALTY;

  score -= GOTW_REPEAT_PENALTY * (c.featuredLastWeek ?? 0);
  return score;
}

/**
 * Picks the Game of the Week, or null for an empty slate.
 *
 * Week-1 override: this league opens every season with a rematch of the prior
 * title game. At week 1, exactly one flagged candidate wins outright; zero or
 * two flagged candidates fall through to the scoring below.
 *
 * Otherwise every candidate is scored: a record-quality base (projections
 * before any game is played) that leans on the weaker team, plus the weight of
 * each reason it carries, minus penalties for eliminated teams and for a
 * franchise that was featured last week. Ties break toward the better weaker
 * team (higher minimum points-for, or projection before week 1's games), then
 * the lower matchupId, so the pick is deterministic.
 */
export function selectGameOfTheWeek(
  candidates: GotwCandidate[],
  ctx: GotwSelectContext
): GotwPick | null {
  if (candidates.length === 0) return null;
  const played = ctx.anyGamesPlayed ?? anyPlayed(candidates);
  const reasonCtx = { week: ctx.week, anyGamesPlayed: played };

  if (ctx.week === 1) {
    const flagged = candidates.filter((c) => c.isTitleRematch);
    if (flagged.length === 1) {
      const c = flagged[0];
      const reasons = gotwReasons(c, reasonCtx);
      return { matchupId: c.matchupId, reasons, score: GOTW_REASON_WEIGHTS["title-rematch"] };
    }
  }

  const maxProjectedTeam = Math.max(
    0,
    ...candidates.flatMap((c) => [c.teamA.projected ?? 0, c.teamB.projected ?? 0])
  );
  const scored = candidates.map((c) => {
    // A second flagged rematch (the degenerate case) must not claim the
    // rematch reason it did not win on.
    const reasons = gotwReasons({ ...c, isTitleRematch: false }, reasonCtx);
    return {
      c,
      reasons,
      score: scoreGotwCandidate(c, reasons, { anyGamesPlayed: played, maxProjectedTeam }),
      tiebreak: played
        ? Math.min(c.teamA.pointsFor, c.teamB.pointsFor)
        : Math.min(c.teamA.projected ?? 0, c.teamB.projected ?? 0),
    };
  });

  scored.sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score;
    if (y.tiebreak !== x.tiebreak) return y.tiebreak - x.tiebreak;
    return x.c.matchupId - y.c.matchupId;
  });

  const best = scored[0];
  return { matchupId: best.c.matchupId, reasons: best.reasons, score: best.score };
}

// ---------------------------------------------------------------------------
// Game of the Week: kicker, stakes, blurb (all derived from reasons)
// ---------------------------------------------------------------------------

/**
 * A pair "rematches" only when it met this season already or last season.
 * Two division-mates who have not met since 2023 are playing a division game,
 * not a rematch.
 */
export function isRecentRematch(
  lastMeeting: Pick<GotwLastMeeting, "seasonYear"> | null | undefined,
  seasonYear: number
): boolean {
  return lastMeeting != null && lastMeeting.seasonYear >= seasonYear - 1;
}

/** The kicker's first clause: what kind of game this is. */
export function gotwKickerLead(opts: {
  isTitleRematch: boolean;
  bowlName: string | null;
  divisionName: string | null;
  isRecentRematch: boolean;
}): string {
  if (opts.isTitleRematch) {
    return opts.bowlName ? `${opts.bowlName} Rematch` : "Title Game Rematch";
  }
  if (opts.divisionName) {
    return opts.isRecentRematch ? `${opts.divisionName} Rematch` : `${opts.divisionName} Game`;
  }
  return "Cross-Division";
}

/**
 * The kicker's second clause, from the heaviest reason that has kicker copy.
 * True by construction: each clause is only reachable through the reason
 * that proves it ("Division lead on the line" needs division-lead-flip, which
 * needs a game whose winner leads or shares the division).
 */
export function stakesFromReasons(
  reasons: GotwReason[],
  facts: {
    namedRivalry?: GotwNamedRivalry | null;
    h2h?: GotwH2H | null;
    playoffMeetingYears?: number[];
  } = {}
): string {
  for (const r of reasons) {
    switch (r) {
      case "title-rematch":
        // The kicker lead already says it ("HMLML Bowl VI Rematch").
        continue;
      case "named-rivalry":
        if (facts.namedRivalry) return facts.namedRivalry.name;
        continue;
      case "division-lead-flip":
        return "Division lead on the line";
      case "playoff-clinch":
        return "Playoff spot at stake";
      case "unbeatens":
        return "Battle of unbeatens";
      case "top-of-table":
        return "Top-three clash";
      case "series-on-the-line": {
        const h = facts.h2h;
        if (!h) continue;
        return h.wins === h.losses
          ? `Series tied ${formatRecord(h.wins, h.losses, h.ties)}`
          : "One game apart all time";
      }
      case "coin-flip-line":
        return "Coin-flip line";
      case "playoff-history": {
        const year = facts.playoffMeetingYears?.[0];
        if (year == null) continue;
        return `Met in the ${year} playoffs`;
      }
      case "mutual-rival":
        return "Rivalry week";
      case "season-opener":
        return "Season openers";
      case "pride":
        return "Pride at stake";
    }
  }
  return "Pride at stake";
}

/** Reasons whose kicker copy is a real standings consequence, strong enough
 * to sit beside a rivalry's name. The softer ones (series, line, playoff
 * history, mutual rival) are left to the blurb, where there is room to say
 * them properly. */
const RIVALRY_KICKER_STAKES: ReadonlySet<GotwReason> = new Set<GotwReason>([
  "division-lead-flip",
  "playoff-clinch",
  "unbeatens",
  "top-of-table",
]);

/**
 * The whole kicker for a named-rivalry pick: the rivalry's own name leads,
 * then the one thing that is true about THIS meeting. That is the heaviest
 * standings consequence when there is one ("Battle of unbeatens"), otherwise
 * the two records as they stand ("2-0 meets 0-2"), which is a fact on any
 * slate once a game has been played, otherwise the plain game type
 * ("Cross-Division"). Never a claim the reasons do not carry.
 */
export function namedRivalryKicker(
  rivalryName: string,
  reasons: GotwReason[],
  facts: {
    anyGamesPlayed: boolean;
    recordA: string;
    recordB: string;
    /** gotwKickerLead's output, for the pre-season fallback. */
    gameType: string;
  }
): string {
  const stake = reasons.find((r) => RIVALRY_KICKER_STAKES.has(r));
  if (stake) return `${rivalryName} · ${stakesFromReasons([stake])}`;
  if (facts.anyGamesPlayed) {
    return `${rivalryName} · ${facts.recordA} meets ${facts.recordB}`;
  }
  return `${rivalryName} · ${facts.gameType}`;
}

/** One side of a completed final (getWeekRecap's RecapTeam satisfies it). */
export interface WeekFinalSideLike {
  franchiseId: string;
  name: string;
  points: number;
}

/** A completed prior-week final; margin 0 is a tie. */
export interface WeekFinalLike {
  winner: WeekFinalSideLike;
  loser: WeekFinalSideLike;
  margin: number;
}

/** A team's prior-week result, from its own side. */
export interface GotwTeamForm {
  points: number;
  opponentName: string;
  /** Absolute final margin, one decimal. 0 is a tie. */
  margin: number;
  won: boolean;
}

/** The team's prior-week result from a week's finals, or null if it had none. */
export function teamFormFrom(
  finals: readonly WeekFinalLike[],
  franchiseId: string
): GotwTeamForm | null {
  for (const f of finals) {
    if (f.winner.franchiseId === franchiseId) {
      return { points: f.winner.points, opponentName: f.loser.name, margin: f.margin, won: f.margin > 0 };
    }
    if (f.loser.franchiseId === franchiseId) {
      return { points: f.loser.points, opponentName: f.winner.name, margin: f.margin, won: false };
    }
  }
  return null;
}

/** Form thresholds; the hero ladder (lib/hub/hero-headline.ts) uses the same
 * mercy line, so "ran off the field" means the same thing in both places. */
export const FORM_MERCY_MARGIN = 40;
export const FORM_BIG_SCORE = 160;
export const FORM_ESCAPE_MARGIN = 3;
export const FORM_DUD_SCORE = 90;

interface BlurbTeam {
  name: string;
  record: string;
  raceTag?: PlayoffRaceTag | null;
  /** Last week's result, when the prior week is complete. */
  lastWeek?: GotwTeamForm | null;
  /** No wins and no ties yet (with games played). */
  winless?: boolean;
}

/**
 * One team's last week as a sentence, plus how sharp it is (a mercy-rule
 * result beats a routine one), so the blurb can open with the sharper side.
 * Every number is the team's own final.
 */
export function formSentence(team: BlurbTeam): { text: string; sharpness: number } | null {
  const f = team.lastWeek;
  if (!f) return null;
  const pts = f.points.toFixed(1);
  const m = f.margin.toFixed(1);
  if (f.margin === 0) {
    return { text: `${team.name} tied ${f.opponentName} at ${pts} last week.`, sharpness: 1 };
  }
  if (f.won) {
    if (f.margin >= FORM_MERCY_MARGIN) {
      return { text: `${team.name} just ran ${f.opponentName} off the field by ${m}.`, sharpness: 4 };
    }
    if (f.points >= FORM_BIG_SCORE) {
      return { text: `${team.name} just hung ${pts} on ${f.opponentName}.`, sharpness: 3 };
    }
    if (f.margin <= FORM_ESCAPE_MARGIN) {
      return { text: `${team.name} just escaped ${f.opponentName} by ${m}.`, sharpness: 2.5 };
    }
    return { text: `${team.name} beat ${f.opponentName} by ${m} last week.`, sharpness: 1 };
  }
  let head: string;
  let sharpness: number;
  if (f.margin >= FORM_MERCY_MARGIN) {
    head = `${team.name} lost by ${m}`;
    sharpness = 4;
  } else if (f.points <= FORM_DUD_SCORE) {
    head = `${team.name} managed ${pts} in a loss to ${f.opponentName}`;
    sharpness = 3;
  } else if (f.margin <= FORM_ESCAPE_MARGIN) {
    head = `${team.name} lost to ${f.opponentName} by ${m}`;
    sharpness = 2.5;
  } else {
    head = `${team.name} lost to ${f.opponentName} by ${m}`;
    sharpness = 1;
  }
  if (team.winless) {
    return { text: `${head} and is still looking for a first win.`, sharpness: sharpness + 1 };
  }
  return { text: `${head}.`, sharpness };
}

const CHAPTER_WORDS = [
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
  "eighteen", "nineteen", "twenty",
] as const;

export interface GotwBlurbInput {
  reasons: GotwReason[];
  teamA: BlurbTeam;
  teamB: BlurbTeam;
  divisionName: string | null;
  h2h: GotwH2H | null;
  lastMeeting: GotwLastMeeting | null;
  playoffMeetingYears: number[];
  namedRivalry: GotwNamedRivalry | null;
  bowlName: string | null;
}

/** The series sentence: always true, reads the h2h from team A's side. */
function seriesSentence(input: GotwBlurbInput): string {
  const h = input.h2h;
  if (!h || teamGames(h) === 0) {
    return input.lastMeeting ? "" : "They have never played each other.";
  }
  if (h.wins === h.losses) {
    return `The all-time series is dead even at ${formatRecord(h.wins, h.losses, h.ties)}.`;
  }
  const aLeads = h.wins > h.losses;
  const leader = aLeads ? input.teamA.name : input.teamB.name;
  const lead = Math.max(h.wins, h.losses);
  const trail = Math.min(h.wins, h.losses);
  return `${leader} leads the all-time series ${formatRecord(lead, trail, h.ties)}.`;
}

/**
 * The Game of the Week blurb, built from the pick's reasons so it never claims
 * stakes the data does not prove. Used verbatim by the content generator's
 * template fallback AND by the hub at render time when no stored blurb
 * matches the pick, so both paths say the same true thing.
 *
 * Deliberately avoids every stock idiom on lib/content-gen/phrases.ts's list
 * ("on the line", "at stake", "receipts to settle", "headline the slate"):
 * the kicker above it owns "on the line"/"at stake", and the hero dek guard
 * compares against both.
 */
export function gameOfWeekBlurb(input: GotwBlurbInput): string {
  // Last week's form leads, sharper side first (ties keep team A first).
  // With it in front, the reason sentence drops the names and records it
  // would otherwise repeat (the card prints both records above the blurb).
  const forms = [formSentence(input.teamA), formSentence(input.teamB)]
    .filter((f): f is { text: string; sharpness: number } => f != null)
    .sort((x, y) => y.sharpness - x.sharpness)
    .map((f) => f.text);
  const withForm = forms.length > 0;
  const a = `${input.teamA.name} (${input.teamA.record})`;
  const b = `${input.teamB.name} (${input.teamB.record})`;
  // The first reason whose supporting fact is actually present; a reason
  // without its fact (a named-rivalry reason with no rivalry row, say) is
  // skipped rather than printed half-empty.
  const winAndIn = [input.teamA, input.teamB].filter((t) => t.raceTag === "win-and-in");
  const top =
    input.reasons.find(
      (r) =>
        (r !== "named-rivalry" || input.namedRivalry != null) &&
        (r !== "playoff-clinch" || winAndIn.length > 0) &&
        (r !== "playoff-history" || input.playoffMeetingYears.length > 0)
    ) ?? "pride";

  let lead: string;
  // A closing fact after the series sentence (only the rivalry case uses it).
  let coda = "";
  switch (top) {
    case "title-rematch": {
      const game = input.bowlName ?? "last season's title game";
      lead = `${input.teamA.name} and ${input.teamB.name} open the season with a rematch of ${game}.`;
      break;
    }
    case "named-rivalry": {
      // The tagline is NOT repeated here: the card prints it as its own aside
      // under the kicker, which already leads with the rivalry's name. What
      // the blurb adds is this meeting's facts: records now, the series below,
      // and a playoff meeting when there is one on file.
      const r = input.namedRivalry!;
      const year = input.playoffMeetingYears[0];
      if (withForm) {
        // "Chapter" counts this meeting: every game on file, plus this one.
        const met = input.h2h ? teamGames(input.h2h) : 0;
        const chapter = met > 0 ? (CHAPTER_WORDS[met] ?? String(met + 1)) : null;
        lead = chapter ? `Now ${r.name}, chapter ${chapter}.` : `Now the next chapter of ${r.name}.`;
      } else {
        lead = `${a} against ${b}, the latest chapter of ${r.name}.`;
      }
      if (year != null) coda = `They met in the ${year} playoffs too.`;
      break;
    }
    case "division-lead-flip":
      lead = withForm
        ? `Now they meet inside ${input.divisionName ?? "the division"}, and whoever wins walks out on top of it or tied for it.`
        : `${a} and ${b} meet inside ${input.divisionName ?? "the division"}, and whoever wins walks out on top of it or tied for it.`;
      break;
    case "playoff-clinch": {
      if (winAndIn.length === 2) {
        lead = `${a} and ${b} can both clinch a playoff spot with a win, and only one of them gets the win.`;
      } else {
        const who = winAndIn[0];
        const other = who === input.teamA ? input.teamB : input.teamA;
        lead = `${who.name} (${who.record}) clinches a playoff spot with a win over ${other.name} (${other.record}).`;
      }
      break;
    }
    case "unbeatens":
      lead = withForm
        ? "Both are still unbeaten, and by Monday night one of them will not be."
        : `${a} and ${b} are both unbeaten, and by Monday night one of them will not be.`;
      break;
    case "top-of-table":
      lead = withForm
        ? "Both sit in the top three of the standings, and one of them leaves with a loss."
        : `${a} and ${b} both sit in the top three of the standings, and one of them leaves with a loss.`;
      break;
    case "series-on-the-line":
      lead = withForm
        ? "Now they meet, in a series that sits within a game either way."
        : `${a} against ${b}, in a series that sits within a game either way.`;
      break;
    case "coin-flip-line":
      lead = withForm
        ? "Now they meet, and the Book can barely split them."
        : `${a} against ${b}, and the Book can barely split them.`;
      break;
    case "playoff-history": {
      const year = input.playoffMeetingYears[0];
      lead = withForm
        ? `They met in the ${year} playoffs, and now they meet again.`
        : `${a} against ${b}. They met in the ${year} playoffs.`;
      break;
    }
    case "mutual-rival":
      lead = withForm
        ? "Now they meet, and neither side has played anyone more often."
        : `${a} against ${b}. Neither side has played anyone more often.`;
      break;
    case "season-opener":
      lead = `${input.teamA.name} and ${input.teamB.name} open the season. Nobody has a record yet, so on projections alone this is the one to watch first.`;
      break;
    default:
      lead = withForm
        ? "Now they meet, and somebody's record takes a hit by Monday night."
        : `${a} against ${b}. The best pairing on a thin slate, and somebody's record takes a hit by Monday night.`;
  }

  const series = seriesSentence(input);
  // "series-on-the-line" already leans on the series; say the number there.
  return [...forms, lead, series, coda].filter(Boolean).join(" ");
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
 * A truthful, records-based angle for a slate matchup. Site voice, no
 * em-dashes. The last rung of the ladder in lib/hub/slate-angle.ts, reachable
 * only once games have been played. The tail is true of every game: the
 * result posts to both records by the Monday night finish.
 */
export function genericSlateAngle(recordA: string, recordB: string): string {
  return `${recordA} against ${recordB}. Both records move by Monday night.`;
}

/**
 * Full weekday name (e.g. "Wednesday") of a kickoff instant in the league's
 * home timezone. Falls back to "kickoff" when there is no kickoff date to name
 * a day from.
 */
export function kickoffWeekdayName(target: Date | null): string {
  if (!target) return "kickoff";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: LEAGUE_TIME_ZONE,
  }).format(target);
}
