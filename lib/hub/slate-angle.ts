import { genericSlateAngle } from "@/lib/hub/between-weeks";

// ---------------------------------------------------------------------------
// The derived slate angle: one truthful trash-talk line per matchup card.
// ---------------------------------------------------------------------------
// Every slate card used to fall back to genericSlateAngle, whose only inputs
// are two season records. At week 1 both records are 0-0, so all five cards
// rendered the identical "0-0 against 0-0" line. This module replaces that
// default with a prioritized ladder of hooks, each one a claim about real
// head-to-head rows: nothing here is invented, and a pair with no history is
// told it has no history rather than being handed a fabricated rivalry.
//
// Pure functions only (no DB, no dates, no randomness), so both consumers,
// the hub RSC and the content-gen template fallback, share one copy source
// and the whole ladder gets real unit tests. Precedence above this module is
// unchanged: an LLM-authored `matchup_angle` row from hub_content still wins.

/** Which side of the matchup a fact belongs to. "A" is always the first team. */
export type SlateSide = "A" | "B";

export interface SlateAngleTeam {
  /**
   * The franchise's full name, which is what every rung prints. There is no
   * abbreviation field on purpose: the copy never falls back to a letter code,
   * and the length budget below is enforced by dropping a sentence rather than
   * by shortening an identity.
   */
  name: string;
}

/** All-time series, from team A's perspective (the same orientation getHeadToHead uses). */
export interface SlateAngleH2H {
  wins: number;
  losses: number;
  ties: number;
  /** e.g. "3-game win streak" / "3-game losing streak", A's perspective. */
  streak: string | null;
}

export interface SlateAngleLastMeeting {
  seasonYear: number;
  week: number;
  /** Winner side, or null for a tie. */
  winner: SlateSide | null;
  pointsA: number;
  pointsB: number;
  isPlayoff: boolean;
}

export interface SlateAngleStar {
  playerName: string;
  position: string | null;
  side: SlateSide;
  projectedPoints: number;
}

export interface SlateAngleInput {
  teamA: SlateAngleTeam;
  teamB: SlateAngleTeam;
  h2h: SlateAngleH2H | null;
  /** Most recent COMPLETED meeting, or null when they have never played. */
  lastMeeting: SlateAngleLastMeeting | null;
  /** Season years in which the pair met in a playoff game, newest first. */
  playoffMeetingYears: number[];
  /** Highest projected starter in this matchup, either side. */
  topProjected: SlateAngleStar | null;
  /** True when this card is a rematch of last season's title game. */
  isTitleRematch: boolean;
  /** e.g. "HMLML Bowl VI"; null for legacy-era seasons with no bowl name. */
  bowlName: string | null;
  /** Season record of team A ("2-1"); only used once games have been played. */
  recordA: string;
  recordB: string;
  /** League-wide gate: false before a single game of the season has been played. */
  anyGamesPlayed: boolean;
  /** Weekday the slate opens, e.g. "Wednesday". */
  kickoffWeekday: string;
}

/**
 * One completed-or-scheduled meeting row, structurally the shape
 * getHeadToHeadHistory returns. Declared locally so this module stays pure and
 * free of any query import.
 */
export interface MeetingHistoryGame {
  seasonYear: number;
  week: number;
  pointsA: number;
  pointsB: number;
  winnerFranchiseId: string | null;
  isPlayoff: boolean;
}

export interface MeetingHistorySummary {
  lastMeeting: SlateAngleLastMeeting | null;
  playoffMeetingYears: number[];
}

/**
 * Reduces a pair's meeting history (newest first, as getHeadToHeadHistory
 * returns it, from `teamAFranchiseId`'s perspective) to the two fields the
 * ladder reads.
 *
 * Only COMPLETED meetings count. A scheduled or in-progress row (this very
 * week's game, before kickoff) carries no winner and 0 points; calling that
 * "last time out" would report a game nobody has played.
 */
export function summarizeMeetingHistory(
  games: MeetingHistoryGame[],
  teamAFranchiseId: string
): MeetingHistorySummary {
  const played = games.filter(
    (g) => g.winnerFranchiseId != null || g.pointsA > 0 || g.pointsB > 0
  );
  const latest = played[0] ?? null;
  return {
    lastMeeting: latest
      ? {
          seasonYear: latest.seasonYear,
          week: latest.week,
          winner:
            latest.winnerFranchiseId == null
              ? null
              : latest.winnerFranchiseId === teamAFranchiseId
                ? "A"
                : "B",
          pointsA: latest.pointsA,
          pointsB: latest.pointsB,
          isPlayoff: latest.isPlayoff,
        }
      : null,
    playoffMeetingYears: played.filter((g) => g.isPlayoff).map((g) => g.seasonYear),
  };
}

/**
 * Target length for a rendered angle. SlateCard gives the line two lines of
 * text-body-sm inside a half-width grid cell, so anything much past this wraps
 * to a third line and unbalances the grid. Rungs that would blow the budget
 * drop their second sentence rather than truncating mid-word.
 */
export const SLATE_ANGLE_MAX_CHARS = 140;

/** Rungs of the ladder, best hook first. Exported for tests and diagnostics. */
export type SlateAngleRung =
  | "titleRematch"
  | "streak"
  | "lopsided"
  | "playoffHistory"
  | "lastMeeting"
  | "evenSeries"
  | "firstMeeting"
  | "projectedStar"
  | "seasonRecords";

export interface SlateAngleResult {
  rung: SlateAngleRung;
  text: string;
}

/** A season record that says nothing: "0-0", or "0-0-0" with ties spelled out. */
const ZERO_RECORD = /^0-0(-0)?$/;

/** One decimal, trailing ".0" kept so two scores line up as written numbers. */
function pts(n: number): string {
  return n.toFixed(1);
}

/** Joins a lead and an optional tail, dropping the tail when it overflows. */
function fit(lead: string, tail?: string): string {
  if (!tail) return lead;
  const joined = `${lead} ${tail}`;
  return joined.length <= SLATE_ANGLE_MAX_CHARS ? joined : lead;
}

/**
 * Parses getHeadToHead's streak label ("3-game win streak" / "3-game losing
 * streak"), which is written from team A's perspective. Returns the side
 * currently on the streak and its length, or null when there is no streak.
 */
export function parseStreak(
  streak: string | null | undefined
): { side: SlateSide; count: number } | null {
  if (!streak) return null;
  const match = /^(\d+)-game (win|losing) streak$/.exec(streak);
  if (!match) return null;
  const count = Number(match[1]);
  if (!Number.isFinite(count) || count < 2) return null;
  return { side: match[2] === "win" ? "A" : "B", count };
}

function nameOf(input: SlateAngleInput, side: SlateSide): string {
  return side === "A" ? input.teamA.name : input.teamB.name;
}

function otherSide(side: SlateSide): SlateSide {
  return side === "A" ? "B" : "A";
}

function seriesTotal(h2h: SlateAngleH2H | null): number {
  if (!h2h) return 0;
  return h2h.wins + h2h.losses + h2h.ties;
}

/** The projected-star clause, reusable as a second sentence for distinctness. */
function starClause(input: SlateAngleInput): string | null {
  const star = input.topProjected;
  if (!star || star.projectedPoints <= 0) return null;
  const position = star.position ? ` (${star.position})` : "";
  return `${star.playerName}${position} carries ${nameOf(input, star.side)}'s projection at ${pts(star.projectedPoints)}.`;
}

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------
// Each builder returns null when the matchup cannot honestly support the hook.
// Order matters: the first non-null wins.
//
// RUNGS is exhaustive on its own: rungs 6 and 7 between them cover every pair
// (any prior meeting lands on 6, no prior meeting lands on 7), so one of these
// always fires and buildSlateAngle never falls past this list. COLLISION_RUNGS
// below is therefore NOT a continuation of the ladder; it is extra material
// buildSlateAngles can reach for when an earlier card already used a card's
// best hooks.

type RungEntry = {
  rung: SlateAngleRung;
  build: (input: SlateAngleInput) => string | null;
};

const RUNGS: RungEntry[] = [
  {
    rung: "titleRematch",
    build: (input) => {
      if (!input.isTitleRematch) return null;
      const bowl = input.bowlName ?? "the title game";
      const last = input.lastMeeting;
      if (last && last.isPlayoff && last.winner) {
        const winner = nameOf(input, last.winner);
        const loser = nameOf(input, otherSide(last.winner));
        const hi = last.winner === "A" ? last.pointsA : last.pointsB;
        const lo = last.winner === "A" ? last.pointsB : last.pointsA;
        return fit(
          `${bowl} rematch.`,
          `${winner} took it ${pts(hi)} to ${pts(lo)}, and ${loser} has had all offseason to stew.`
        );
      }
      return fit(
        `${bowl} rematch, week 1.`,
        `${input.teamA.name} and ${input.teamB.name} pick it up right where the title game left off.`
      );
    },
  },
  {
    rung: "streak",
    build: (input) => {
      const streak = parseStreak(input.h2h?.streak);
      if (!streak) return null;
      const winner = nameOf(input, streak.side);
      const loser = nameOf(input, otherSide(streak.side));
      return fit(
        `${winner} has taken the last ${streak.count} meetings from ${loser}.`,
        "Somebody has to stop the bleeding eventually."
      );
    },
  },
  {
    rung: "lopsided",
    build: (input) => {
      const h2h = input.h2h;
      const total = seriesTotal(h2h);
      if (!h2h || total < 3) return null;
      const leadWins = Math.max(h2h.wins, h2h.losses);
      if (leadWins / total < 0.7) return null;
      const leaderSide: SlateSide = h2h.wins >= h2h.losses ? "A" : "B";
      const trailing = Math.min(h2h.wins, h2h.losses);
      return fit(
        `${nameOf(input, leaderSide)} owns this series ${leadWins}-${trailing}.`,
        `${nameOf(input, otherSide(leaderSide))} keeps signing up for it anyway.`
      );
    },
  },
  {
    rung: "playoffHistory",
    build: (input) => {
      const year = input.playoffMeetingYears[0];
      if (year == null) return null;
      return fit(
        `These two met in the ${year} playoffs.`,
        `${input.teamA.name} and ${input.teamB.name} have been circling that one ever since.`
      );
    },
  },
  {
    rung: "lastMeeting",
    build: (input) => {
      const last = input.lastMeeting;
      if (!last) return null;
      if (!last.winner) {
        return `${input.teamA.name} and ${input.teamB.name} played to a ${pts(last.pointsA)} tie back in ${last.seasonYear}.`;
      }
      const winner = nameOf(input, last.winner);
      const loser = nameOf(input, otherSide(last.winner));
      const hi = last.winner === "A" ? last.pointsA : last.pointsB;
      const lo = last.winner === "A" ? last.pointsB : last.pointsA;
      return fit(
        `Last time out: ${winner} ${pts(hi)}, ${loser} ${pts(lo)}.`,
        `${last.seasonYear} week ${last.week}, still on the books.`
      );
    },
  },
  {
    rung: "evenSeries",
    build: (input) => {
      const h2h = input.h2h;
      if (!h2h || seriesTotal(h2h) < 1) return null;
      if (h2h.wins === h2h.losses) {
        return fit(
          `${input.teamA.name} and ${input.teamB.name} are dead even at ${h2h.wins}-${h2h.losses} all time.`,
          "Somebody breaks the tie this week."
        );
      }
      // Name the leader explicitly: "2-3" alone reads as the first team's
      // lead, which would be a false claim half the time.
      const leaderSide: SlateSide = h2h.wins > h2h.losses ? "A" : "B";
      const lead = Math.max(h2h.wins, h2h.losses);
      const trail = Math.min(h2h.wins, h2h.losses);
      return fit(
        `${nameOf(input, leaderSide)} leads it ${lead}-${trail} all time over ${nameOf(input, otherSide(leaderSide))}.`,
        "Close enough that nobody has settled it."
      );
    },
  },
  {
    rung: "firstMeeting",
    build: (input) => {
      if (seriesTotal(input.h2h) > 0 || input.lastMeeting) return null;
      return fit(
        `${input.teamA.name} and ${input.teamB.name} have never played.`,
        `The first receipt gets written ${input.kickoffWeekday}.`
      );
    },
  },
];

// Alternates, reached ONLY by buildSlateAngles when every hook a card supports
// in RUNGS is already spoken for by an earlier card on the same slate. They
// are true claims, just weaker ones: a projection is not a receipt, and a
// season record is only a fact at all once a game has been played.
const COLLISION_RUNGS: RungEntry[] = [
  {
    rung: "projectedStar",
    build: (input) => starClause(input),
  },
  {
    rung: "seasonRecords",
    build: (input) => {
      // Two independent gates, because the league-wide flag is not enough on
      // its own: a caller can pass anyGamesPlayed while a specific pair still
      // reads 0-0 (bye weeks, a mid-season expansion, or simply a caller that
      // derives the flag from a different source than the records). The zero
      // check is on the actual strings this line would print, so "0-0 against
      // 0-0" cannot be emitted regardless of what the flag says.
      if (!input.anyGamesPlayed) return null;
      if (ZERO_RECORD.test(input.recordA) || ZERO_RECORD.test(input.recordB)) {
        return null;
      }
      return genericSlateAngle(input.recordA, input.recordB, input.kickoffWeekday);
    },
  },
];

/** Every rung this matchup can honestly support, best hook first. */
function supportedRungs(
  input: SlateAngleInput,
  entries: RungEntry[] = RUNGS
): SlateAngleResult[] {
  const results: SlateAngleResult[] = [];
  for (const { rung, build } of entries) {
    const text = build(input);
    if (text) results.push({ rung, text });
  }
  return results;
}

/**
 * The single best angle this matchup can support, always one of RUNGS: a pair
 * with any prior meeting lands on the series rung at worst, and a pair with
 * none lands on the first-meeting rung, so the ladder always terminates in a
 * truthful line. The season-records rung is NOT on this path at all (see
 * COLLISION_RUNGS), which is what makes "0-0 against 0-0" unreachable here.
 */
export function buildSlateAngle(input: SlateAngleInput): string {
  return buildSlateAngleResult(input).text;
}

/** buildSlateAngle plus which rung produced the copy (for tests and logging). */
export function buildSlateAngleResult(input: SlateAngleInput): SlateAngleResult {
  const supported = supportedRungs(input);
  if (supported.length > 0) return supported[0];
  // Nothing at all is known about the pair: still truthful, still specific to
  // the two franchises named, so two such cards cannot collide.
  return {
    rung: "firstMeeting",
    text: `${input.teamA.name} and ${input.teamB.name}, no history on file. It starts ${input.kickoffWeekday}.`,
  };
}

/**
 * Angles for a whole slate, guaranteed pairwise distinct. Every rung names at
 * least one franchise, so a collision is already near-impossible; the pass
 * below makes it structural rather than lucky. A later card whose best hook is
 * already in play advances to its next supported hook, then to COLLISION_RUNGS
 * (the projected star, or the season records once they mean something).
 * Deterministic: input order decides, no randomness.
 */
export function buildSlateAngles(inputs: SlateAngleInput[]): string[] {
  const used = new Set<string>();
  const usedRungs = new Set<SlateAngleRung>();
  return inputs.map((input) => {
    const supported = supportedRungs(input);
    const candidates = [
      ...(supported.length > 0 ? supported : [buildSlateAngleResult(input)]),
      ...supportedRungs(input, COLLISION_RUNGS),
    ];

    // Prefer a hook no earlier card has used. Five cards all saying "X has
    // taken the last 2 meetings from Y" are technically distinct strings and
    // still read like a template, so the shape varies too, not just the names.
    for (const candidate of candidates) {
      if (!usedRungs.has(candidate.rung) && !used.has(candidate.text)) {
        used.add(candidate.text);
        usedRungs.add(candidate.rung);
        return candidate.text;
      }
    }

    // Every hook this matchup supports is already in play elsewhere; fall back
    // to the best one whose copy does not literally collide.
    for (const candidate of candidates) {
      if (!used.has(candidate.text)) {
        used.add(candidate.text);
        return candidate.text;
      }
    }

    const base = candidates[0].text;
    const clause = starClause(input);
    const widened = clause ? `${base} ${clause}` : base;
    if (!used.has(widened)) {
      used.add(widened);
      return widened;
    }
    // Genuinely identical data on two cards, which cannot happen while both
    // name their own franchises. Return the base rather than inventing a
    // difference that is not in the data.
    return base;
  });
}
