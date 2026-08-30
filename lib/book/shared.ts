// Shapes and copy shared between The Book's server action, its API route, and
// the client island. Kept out of the action module so the client can import
// types without pulling a "use server" file into the bundle.

export type BookSideKey = "home" | "away";

/** Re-exported so the client island types covers from one place. */
import type { CoverResult } from "@/lib/book/pricing";
import { formatMoney, formatMoneyline, formatSpread, pay, payoutTotal } from "@/lib/book/pricing";
export type { CoverResult };

/** Re-exported so the props island types picks and results from one place. */
import type { PropKind, PropResult, PropSide } from "@/lib/book/props";
export type { PropKind, PropResult, PropSide };

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
  /**
   * The GAME-level cover against the current line: which side is covering now
   * (live) or covered (final), null before kickoff. Not a member's result: a
   * pick is graded against the spread snapshotted on its own row, which may
   * differ from the line the game ended up carrying.
   */
  coveringSide: CoverResult | null;
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

// ---------------------------------------------------------------------------
// Props tab shapes
// ---------------------------------------------------------------------------
// Live here for the same reason the board shapes do: the props island imports
// them and must not drag lib/db into the client bundle.

export interface BookPropView {
  id: number;
  kind: PropKind;
  /** "Prop 01 · League Total", etc. */
  label: string;
  question: string;
  /** "O/U 1,178.5" or "YES / NO". */
  lineDisplay: string;
  overLabel: string;
  underLabel: string;
  overOdds: string;
  underOdds: string;
  overPayout: string;
  underPayout: string;
  snark: string | null;
  /** null until the Tuesday grading pass fills it in. */
  result: PropResult | null;
}

export interface MemberPropPick {
  propId: number;
  side: PropSide;
  oddsAtPick: number;
  lockedAt: string | null;
}

/**
 * Consensus is a claim about the league, so it stays hidden until enough
 * members have weighed in to make it one. Two people picking opposite sides is
 * not "50% of the league", and one person is definitely not 100% of it.
 */
export const MIN_PICKS_FOR_CONSENSUS = 3;

// ---------------------------------------------------------------------------
// Hub line footer: the compact strip the hub's own matchup cards borrow from
// The Book, so a member never has to leave the hub to see the number. Pure so
// the format is unit-tested without a database; shared by the live-window
// GameCard, the between-weeks SlateCard, and any future upcoming-card variant.
// ---------------------------------------------------------------------------

type HubFooterSide = Pick<BookSide, "abbreviation" | "name" | "moneyline">;
export interface HubFooterGame {
  spread: number;
  status: BookGameStatus;
  home: HubFooterSide;
  away: HubFooterSide;
  homePicks: number;
  awayPicks: number;
}

/** "CT -3.5 · ML -165/+140" -- favorite's abbreviation and spread, then both moneylines home/away. */
export function bookLineText(game: Pick<HubFooterGame, "spread" | "home" | "away">): string {
  const favorite = game.spread < 0 ? game.home : game.away;
  const favoriteAbbr = favorite.abbreviation ?? favorite.name;
  const favoriteSpread = formatSpread(-Math.abs(game.spread));
  return `${favoriteAbbr} ${favoriteSpread} · ML ${formatMoneyline(game.home.moneyline)}/${formatMoneyline(game.away.moneyline)}`;
}

/** "64% on CT", or null under MIN_PICKS_FOR_CONSENSUS (not yet a true claim about the league). */
export function bookConsensusText(
  game: Pick<HubFooterGame, "home" | "away" | "homePicks" | "awayPicks">,
): string | null {
  const total = game.homePicks + game.awayPicks;
  if (total < MIN_PICKS_FOR_CONSENSUS) return null;
  const homePct = Math.round((game.homePicks / total) * 100);
  const favorsHome = homePct >= 100 - homePct;
  const favorite = favorsHome ? game.home : game.away;
  const pct = favorsHome ? homePct : 100 - homePct;
  return `${pct}% on ${favorite.abbreviation ?? favorite.name}`;
}

/** "The Book →" once a game has kicked off, "Pick →" while it is still open. */
export function bookCtaLabel(status: BookGameStatus): string {
  return status === "open" ? "Pick →" : "The Book →";
}

/**
 * "A $10 friendly on WW +140 returns $24.00 total ($14.00 profit)." -- the
 * underdog payout line under an upcoming hub card. Only meaningful before
 * kickoff (an in-progress or final game's odds are history, not an offer),
 * so callers gate this to `status === "open"`.
 */
export function bookDogPayoutLine(
  game: Pick<HubFooterGame, "home" | "away">,
  stake: number = DEFAULT_STAKE,
): string {
  const dog = game.home.moneyline > 0 ? game.home : game.away;
  const profit = pay(dog.moneyline, stake);
  const total = payoutTotal(dog.moneyline, stake);
  return `A $${stake} friendly on ${dog.abbreviation ?? dog.name} ${formatMoneyline(
    dog.moneyline,
  )} returns ${formatMoney(total)} total (${formatMoney(profit)} profit).`;
}

/**
 * Assembles a hub card's full line footer from a priced game. The dog-payout
 * line only renders while the game is genuinely open: once it has kicked off
 * the posted odds are history, not an offer.
 */
export function buildHubLineFooter(game: HubFooterGame): BookLineFooter {
  return {
    lineText: bookLineText(game),
    consensusText: bookConsensusText(game),
    ctaLabel: bookCtaLabel(game.status),
    dogPayoutLine: game.status === "open" ? bookDogPayoutLine(game) : null,
  };
}

/** Mirrors components/book/line-footer.tsx's shape without importing a
 * client-adjacent component module into server query code. */
export interface BookLineFooter {
  lineText: string;
  consensusText: string | null;
  ctaLabel: string;
  dogPayoutLine: string | null;
}

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
  spreadNote: "Spread bets pay -110: a $10 friendly returns $19.09 ($9.09 profit).",
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
  /**
   * League Total's snark is a joke about the bet itself, not a claim about the
   * league (unlike Ceiling Watch's snark, which cites a real season-high
   * score and so is generated per week). Static and fine to be: it never
   * needs to be true.
   */
  leagueTotalSnark: "Vegas would call this a lottery. We call it Sunday.",
} as const;

// ---------------------------------------------------------------------------
// Tracking shapes
// ---------------------------------------------------------------------------
// Same reason as the board shapes above: the tracking island imports these,
// and lib/queries/book-tracking.ts (which builds them) touches lib/db.

export interface AtsLeaderboardRow {
  memberId: number;
  displayName: string;
  franchiseSlug: string;
  franchiseName: string;
  franchiseAbbreviation: string | null;
  franchiseColor: string | null;
  rank: number;
  isLeader: boolean;
  isLast: boolean;
  record: string;
  streakLabel: string | null;
  streakType: "W" | "L" | null;
  units: number;
}

export type PickOutcome = "win" | "loss" | "push";

export interface WhoPickedWhomHeader {
  matchupId: number;
  label: string;
  homeAbbreviation: string;
  awayAbbreviation: string;
}

export interface WhoPickedWhomCell {
  /** Whether this game's own pick may be shown at all right now. */
  revealed: boolean;
  abbreviation: string | null;
  outcome: PickOutcome | null;
}

export interface WhoPickedWhomRow {
  memberId: number;
  displayName: string;
  franchiseSlug: string;
  cells: WhoPickedWhomCell[];
}

export interface WhoPickedWhomData {
  header: WhoPickedWhomHeader[];
  rows: WhoPickedWhomRow[];
}

export interface StreakTile {
  kind: "heater" | "ice-cold" | "best-week";
  kicker: string;
  stat: string;
  attribution: string;
}

// ---------------------------------------------------------------------------
// Pure guards (unit-tested in shared.test.ts)
// ---------------------------------------------------------------------------

export interface PickGuardFacts {
  /** The board the click came from is the week the server is trading. */
  weekMatchesBoard: boolean;
  /** A priced line exists for this game. */
  lineExists: boolean;
  /** Either roster already has a starter on the field. */
  gameStarted: boolean;
  /** The member has ANY locked pick this week, so the slip is closed. */
  slipHasLockedPick: boolean;
  /** This particular pick row is already locked. */
  existingPickLocked: boolean;
}

/**
 * Why a pick must be refused, or null when it may go through.
 *
 * Pure so the guard ladder is testable without a database, and shaped around
 * the bug it was written for: lock was enforced per ROW, so a member could lock
 * their slip, wait for the sync to price a game that had no row yet, and still
 * add a pick to it, because there was no `lockedAt` on a row that did not
 * exist. Locking is a slip-level commitment; `slipHasLockedPick` is what
 * enforces that.
 */
export function pickRejectionReason(facts: PickGuardFacts): string | null {
  if (!facts.weekMatchesBoard) return BOOK_ERRORS.locked;
  if (!facts.lineExists) return BOOK_ERRORS.noLine;
  if (facts.gameStarted) return BOOK_ERRORS.locked;
  if (facts.slipHasLockedPick || facts.existingPickLocked) {
    return BOOK_ERRORS.slipLocked;
  }
  return null;
}

/**
 * The picks from an /api/book/picks payload, or null when they must be ignored.
 *
 * Sleeper reuses matchup ids every week (pairing 1 exists in week 1 and again
 * in week 2) and picks are keyed by matchup id, so a payload for a different
 * week would line up perfectly against the board and paint the wrong picks onto
 * it. /book is ISR-cached, so that window is real: after a Tuesday rollover a
 * visitor can hold last week's cached HTML while the API answers for the new
 * week.
 */
export function picksForBoardWeek(
  payload: { picks: MemberBookPick[]; week: number | null } | null | undefined,
  boardWeek: number,
): MemberBookPick[] | null {
  if (!payload) return null;
  if (payload.week !== boardWeek) return null;
  return payload.picks;
}

// ---------------------------------------------------------------------------
// Futures shapes
// ---------------------------------------------------------------------------
// Here for the same reason the board shapes are: the futures island imports
// them, and anything it touches must not drag lib/db into the browser bundle.
// (lib/book/futures.ts is safe for the island to import directly; it is pure
// math with no database and no Sleeper.)

import type {
  FuturesMarket,
  FuturesSubjectType,
  FutureResult,
} from "@/lib/book/futures";
export type { FuturesMarket, FuturesSubjectType, FutureResult };

export interface FuturesContextPart {
  /** The numeral, mono. Empty when the part is prose only. */
  stat: string;
  label: string;
}

/** One priced row on a futures board: a franchise, a player, or The Field. */
export interface FuturesEntry {
  subjectType: FuturesSubjectType;
  subjectId: string;
  /** American odds, as posted. */
  odds: number;
  /** The fair (pre-overround) probability behind the price. */
  prob: number;
  name: string;
  /** Franchise slug for team markets; null for players and The Field. */
  slug: string | null;
  abbreviation: string | null;
  brandingColor: string | null;
  /** Franchise crest or player headshot. Decorative; null is a monogram. */
  imageUrl: string | null;
  position: string | null;
  nflTeam: string | null;
  /**
   * The attribution under the name, as stat/label pairs rather than a
   * pre-formatted sentence: every numeral on this site renders in the mono
   * face, so the card needs each number apart from its words to put it there.
   * A pair with an empty stat is pure prose (The Field's line).
   */
  context: FuturesContextPart[];
  /** How many members are holding this one. The league-consensus line. */
  pickCount: number;
  /** Filled in only after the season is graded. */
  gradedResult: FutureResult | null;
}

export interface FuturesBoard {
  market: FuturesMarket;
  entries: FuturesEntry[];
  /** The fantasy week this market's picks lock in. */
  lockWeek: number;
  /** True once that week has really kicked off (game status, never a clock). */
  locked: boolean;
}

export interface MemberFuturePick {
  market: FuturesMarket;
  subjectId: string;
  oddsAtPick: number;
}

/**
 * The picks from an /api/book/future-picks payload, or null when they must be
 * ignored.
 *
 * The season-scoped twin of picksForBoardWeek, and it exists for the same
 * reason: /book is ISR-cached, so a visitor can hold last season's HTML while
 * the API answers for the new one. Futures are keyed by market, and every
 * season has a "champion" market, so a payload from the wrong season would line
 * up perfectly against the board and paint last year's picks onto it.
 */
export function futurePicksForSeason(
  payload: { picks: MemberFuturePick[]; seasonId: number | null } | null | undefined,
  boardSeasonId: number | null,
): MemberFuturePick[] | null {
  if (!payload) return null;
  if (boardSeasonId == null) return null;
  if (payload.seasonId !== boardSeasonId) return null;
  return payload.picks;
}

/**
 * What the futures pick action answers with.
 *
 * Carries the odds it actually booked, because the island's board came out of
 * the ISR cache and may be quoting a price the daily repricing has since moved.
 * Null when the pick was cleared, or when the write was refused.
 */
export interface FuturePickActionResult {
  ok: boolean;
  error: string | null;
  oddsAtPick: number | null;
}

export interface FuturePickGuardFacts {
  /** A priced row exists for this market and subject. */
  subjectExists: boolean;
  /** The market's lock week has kicked off. */
  marketLocked: boolean;
}

/**
 * Why a futures pick must be refused, or null when it may go through.
 *
 * Deliberately thinner than pickRejectionReason: futures carry no slip and no
 * per-row lock, because a whole market locks at once. Kept pure and separate so
 * the two ladders can never be confused for each other.
 */
export function futurePickRejectionReason(
  facts: FuturePickGuardFacts,
): string | null {
  if (!facts.subjectExists) return BOOK_ERRORS.noFuture;
  if (facts.marketLocked) return BOOK_ERRORS.futureLocked;
  return null;
}

/**
 * Every line the futures book speaks in. Per market, in one constant, for the
 * same reason BOOK_COPY exists: snarky labels are content, not component
 * internals.
 *
 * `rules` is the dashed house-rules footnote printed under each board, and it
 * states the actual grading criterion, because a market nobody can check is not
 * a market. The MVP and ROTY rules take the last regular-season week so the
 * printed range is a true claim rather than a hardcoded guess.
 */
export interface FuturesMarketCopy {
  label: string;
  title: string;
  /** The editorial aside under the title, when the market has earned one. */
  snark: string | null;
}

/**
 * Keyed by the registry (`satisfies Record<FuturesMarket, ...>`), so a market
 * added to FUTURES_MARKETS without copy is a compile error rather than a board
 * that renders a blank heading.
 */
const FUTURES_MARKET_COPY = {
  champion: {
    label: "League Champion",
    title: "Who lifts the trophy",
    snark: null,
  },
  toilet_bowl: {
    label: "Toilet Bowl",
    title: "Who bottoms out",
    snark:
      "The consolation bracket runs backwards: you advance by losing. So does this market.",
  },
  mvp: {
    label: "League MVP",
    title: "Most points started",
    snark: null,
  },
  roty: {
    label: "Rookie of the Year",
    title: "Best of the first-years",
    snark: null,
  },
} as const satisfies Record<FuturesMarket, FuturesMarketCopy>;

export const FUTURES_COPY = {
  kicker: "Season-long markets",
  title: "Futures.",
  subline:
    "Priced daily off real standings and real points. Picks lock and never move after.",
  signedOut: "Claim your team to put a future on the board.",
  emptyBoard: "No futures up yet. These post once the season has data worth pricing.",
  syncNote: "Futures re-priced daily",
  lockedNote: "Locked. The board is history now.",
  markets: FUTURES_MARKET_COPY,
  fieldName: "The Field",
  fieldContext: "Everyone not listed above",
} as const;

/**
 * One run of copy: prose, or a numeral that must render in the mono face.
 *
 * Board copy carries week numbers, and this site sets every numeral in
 * JetBrains Mono, so these strings are handed to the UI pre-split rather than
 * as a sentence the component would have to parse to obey the three-font rule.
 */
export interface CopySegment {
  text: string;
  mono: boolean;
}

/** Flattens segments back into a plain sentence, for aria labels and tests. */
export function copySegmentsText(segments: CopySegment[]): string {
  return segments.map((s) => s.text).join("");
}

/**
 * "Locks at the week 8 kickoff", for whatever week this market actually locks.
 *
 * Deliberately phrased off the WEEK rather than off the market: the team
 * markets lock at `playoff_week_start`, which is null until Sleeper settles the
 * season, and a note reading "locks at the first playoff kickoff" would then be
 * describing a fallback week that has nothing to do with the playoffs.
 */
export function futuresLockNote(lockWeek: number): CopySegment[] {
  return [
    { text: "Locks at the week ", mono: false },
    { text: String(lockWeek), mono: true },
    { text: " kickoff.", mono: false },
  ];
}

/**
 * The dashed house-rules footnote under one board, as copy segments.
 *
 * States the actual grading criterion, because a market nobody can check is not
 * a market. The MVP and ROTY rules take the season's real last regular week, so
 * the printed range is a true claim rather than a hardcoded guess.
 */
export function futuresRulesFor(
  market: FuturesMarket,
  finalRegularWeek: number,
): CopySegment[] {
  const disputes = {
    text: " Disputes go to the commish, who is biased.",
    mono: false,
  };
  switch (market) {
    case "champion":
      return [
        { text: "Graded from the winners bracket final.", mono: false },
        disputes,
      ];
    case "toilet_bowl":
      return [
        {
          text: "Graded from the consolation final, where the loser wins.",
          mono: false,
        },
        disputes,
      ];
    case "mvp":
      return [
        { text: "MVP = most points scored while started, weeks ", mono: false },
        { text: "1", mono: true },
        { text: " to ", mono: false },
        { text: String(finalRegularWeek), mono: true },
        { text: ".", mono: false },
        disputes,
      ];
    case "roty":
      return [
        {
          text: "Same rule as MVP, rookies only (first NFL season).",
          mono: false,
        },
        disputes,
      ];
  }
}

/** Errors the server action returns. Same voice as the rest of the site. */
export const BOOK_ERRORS = {
  signedOut: "Claim your team before you start betting.",
  noLine: "There is no line on that game.",
  locked: "That one already kicked off. The line is history now.",
  slipLocked: "Your slip is locked. No takebacks.",
  incomplete: "Pick every open game before you lock the slip.",
  badInput: "That pick did not make sense.",
  noSeason: "No season is open for business.",
  noProp: "There is no such prop.",
  noFuture: "That one is not on the futures board.",
  futureLocked: "That market is closed. You had all season.",
} as const;

// ---------------------------------------------------------------------------
// Props guard (unit-tested in shared.test.ts)
// ---------------------------------------------------------------------------

export interface PropPickGuardFacts {
  /** The board the click came from is the week the server is trading. */
  weekMatchesBoard: boolean;
  /** The prop belongs to this season and week. */
  propExists: boolean;
  /** Any NFL game this fantasy week has kicked off. */
  weekLocked: boolean;
  /** This particular pick row is already locked. */
  existingPickLocked: boolean;
}

/**
 * Why a prop pick must be refused, or null when it may go through.
 *
 * Simpler than pickRejectionReason: props have no per-member "lock the whole
 * slip" concept (the issue names no lock-in-picks CTA for Props), so a pick
 * only fails for a stale board, a prop that does not exist, or the week
 * having moved past its first kickoff.
 */
export function propPickRejectionReason(
  facts: PropPickGuardFacts,
): string | null {
  if (!facts.weekMatchesBoard) return BOOK_ERRORS.locked;
  if (!facts.propExists) return BOOK_ERRORS.noProp;
  if (facts.weekLocked || facts.existingPickLocked) return BOOK_ERRORS.locked;
  return null;
}
