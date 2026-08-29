// Shapes and copy shared between The Book's server action, its API route, and
// the client island. Kept out of the action module so the client can import
// types without pulling a "use server" file into the bundle.

export type BookSideKey = "home" | "away";

// ---------------------------------------------------------------------------
// Board shapes
// ---------------------------------------------------------------------------
// These live here rather than next to the queries that build them because the
// board island imports them, and anything the island touches must not drag
// lib/db (and therefore the pg driver) into the client bundle.

export interface BookSide {
  rosterId: string;
  franchiseId: string;
  name: string;
  slug: string;
  abbreviation: string | null;
  brandingColor: string | null;
  avatarUrl: string | null;
  record: string;
  /** The number as THIS side reads it (the away side mirrors the stored spread). */
  spread: number;
  moneyline: number;
  points: number;
  projected: number | null;
}

export type BookGameStatus = "open" | "live" | "final";

export interface BookGame {
  matchupId: number;
  seasonId: number;
  week: number;
  status: BookGameStatus;
  /** Home-perspective spread, exactly as stored. */
  spread: number;
  home: BookSide;
  away: BookSide;
  /** Weekday label of the first kickoff this game rides on, e.g. "SUN". */
  kickoffLabel: string | null;
  /** Which side is covering now (live) or covered (final). Null before kickoff. */
  coveringSide: BookSideKey | null;
  homePicks: number;
  awayPicks: number;
}

export interface MemberBookPick {
  matchupId: number;
  side: BookSideKey;
  spreadAtPick: number;
  mlAtPick: number;
  lockedAt: string | null;
}

export interface BookChip {
  label: string;
  value: string;
  context: string;
}

/**
 * Consensus is a claim about the league, so it stays hidden until enough
 * members have weighed in to make it one. Two people picking opposite sides is
 * not "50% of the league", and one person is definitely not 100% of it.
 */
export const MIN_PICKS_FOR_CONSENSUS = 3;

export interface BookActionResult {
  ok: boolean;
  /** Calm, specific, never panicked. Null on success. */
  error: string | null;
}

/** The translator's opening stake. Friendly dollars, not real ones. */
export const DEFAULT_STAKE = 10;
export const MIN_STAKE = 1;
export const MAX_STAKE = 500;

/**
 * Every line the sportsbook speaks in, in one place (CLAUDE.md: snarky labels
 * live in a content constant, not scattered through components).
 */
export const BOOK_COPY = {
  kicker: "HMLML Sportsbook",
  title: "The Book.",
  subline:
    "Lines computed from projections. Wagers strictly friendly. The house is a gorilla.",
  translatorTitle: "Wager Translator",
  translatorSnark: "friendly wagers only, the commish is not a casino",
  spreadNote: "Spread bets pay -110: a $10 friendly wins $9.09.",
  syncNote: "Lines re-priced hourly from projections",
  emptyBoard: "No lines up yet. The board opens once the week's projections land.",
  signedOut: "Claim your team to get a slip.",
  lockedIn: "Picks are in. No takebacks.",
  lockCta: "Lock in picks",
  lockNoteLocked: "Graded live as games play out.",
  lockNoteReady: "Open picks auto-lock at each kickoff.",
  lockNoteIncomplete: "Pick every open game to lock the slip early.",
  trackingSoon: "The season ledger opens once there are results worth ranking.",
  propsSoon: "Props post the week they can be graded honestly. Not yet.",
  houseRules:
    "Props grade Tuesday morning after stat corrections. Disputes go to the commish, who is biased. Lines move when projections re-sync every hour.",
} as const;

/** Errors the server action returns. Same voice as the rest of the site. */
export const BOOK_ERRORS = {
  signedOut: "Claim your team before you start betting.",
  noLine: "There is no line on that game.",
  locked: "That one already kicked off. The line is history now.",
  slipLocked: "Your slip is locked. No takebacks.",
  incomplete: "Pick every open game before you lock the slip.",
  badInput: "That pick did not make sense.",
  noSeason: "No season is open for business.",
} as const;
