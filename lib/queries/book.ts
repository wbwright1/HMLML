import { db } from "@/lib/db";
import {
  bookLines,
  bookPicks,
  franchiseSeasons,
  franchises,
  matchups,
  nflGames,
  playerWeekPoints,
  players,
  rosterPlayers,
  seasons,
} from "@/lib/db/schema";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { getLatestAvatarUrls } from "@/lib/queries/franchise-avatars";
import {
  bestPossibleLineup,
  loadSeasonRosterPositions,
  type RosterPlayerPoints,
} from "@/lib/queries/lineup-efficiency";
import { getNflState } from "@/lib/queries/nfl-state";
import { formatRecord } from "@/lib/format-record";
import { coverSide } from "@/lib/book/pricing";
import type {
  BookGame,
  BookGameStatus,
  BookSide,
  MemberBookPick,
} from "@/lib/book/shared";

// The board shapes live in lib/book/shared.ts (the client island imports them,
// and anything it touches must not pull lib/db into the browser bundle). They
// are re-exported here so the server side keeps one import for "the book".
export type {
  BookSide,
  BookGameStatus,
  BookGame,
  MemberBookPick,
} from "@/lib/book/shared";
export { MIN_PICKS_FOR_CONSENSUS } from "@/lib/book/shared";

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in book.test.ts)
// ---------------------------------------------------------------------------

/** A season's projected points spread across a 17-game regular season. */
export const REGULAR_SEASON_GAMES = 17;

/** Pairs matchup rows into (home, away) with home pinned to the lower roster id. */
export function pairRosterIds(rosterIds: string[]): [string, string] | null {
  if (rosterIds.length !== 2) return null;
  const [a, b] = [...rosterIds].sort((x, y) => Number(x) - Number(y));
  return [a, b];
}

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * Weekday label for a stored nfl_games.game_date ("YYYY-MM-DD").
 *
 * Sleeper's schedule feed carries no kickoff clock time, so the board says
 * "Locks SUN" rather than inventing "SUN 4:25 PM". Parsed as a plain calendar
 * date (not through Date's timezone handling) so the weekday never slips.
 */
export function kickoffWeekday(gameDate: string | null | undefined): string | null {
  if (!gameDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(gameDate.trim());
  if (!m) return null;
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return WEEKDAYS[day] ?? null;
}

// ---------------------------------------------------------------------------
// Which week the board is showing
// ---------------------------------------------------------------------------

export interface BookWeek {
  seasonId: number;
  seasonYear: number;
  week: number;
}

/**
 * The fantasy week The Book trades, given the NFL state.
 *
 * In the regular season and playoffs that is simply the current week. Anywhere
 * else on the calendar it is week 1, because Sleeper's preseason week counter
 * counts PRESEASON weeks: in late August it reports week 3, and taking that at
 * face value prices (and displays) fantasy week 3 while the league is waiting
 * on week 1. Caught in verification, where the sync priced week 3 and the page
 * showed week 1.
 *
 * Pure, and used by the page, the server action, AND the sync, so all three
 * always agree on which week is on the board.
 */
export function bookWeekFor(
  seasonType: string | null | undefined,
  stateWeek: number,
): number {
  const inSeason = seasonType === "regular" || seasonType === "post";
  return inSeason ? Math.max(1, stateWeek) : 1;
}

/**
 * Resolves the season and week The Book is trading.
 *
 * Shared by the page and the server action so a pick can never be booked
 * against a different week than the one the board rendered.
 */
export async function resolveBookWeek(): Promise<BookWeek | null> {
  const [latest] = await db
    .select({ id: seasons.id, seasonYear: seasons.seasonYear })
    .from(seasons)
    .orderBy(desc(seasons.seasonYear))
    .limit(1);

  if (!latest) return null;

  const state = await getNflState();
  // A state pointing at a different season is not this season's week.
  const forThisSeason = state != null && state.season === String(latest.seasonYear);

  return {
    seasonId: latest.id,
    seasonYear: latest.seasonYear,
    week: forThisSeason ? bookWeekFor(state.seasonType, state.week) : 1,
  };
}

// ---------------------------------------------------------------------------
// Projections: what the pricing engine is fed
// ---------------------------------------------------------------------------

export interface WeekProjectionRow {
  rosterId: string;
  playerId: string;
  position: string | null;
  /** The player's NFL team, used to tell whether his own game has kicked off. */
  nflTeam: string | null;
  projectedPoints: number | null;
  /** Whether the manager currently has this player in the lineup. */
  started: boolean;
}

export interface RosterSlotRow {
  rosterId: string;
  playerId: string;
  position: string | null;
  /** roster_players.slot: 'starter' | 'bench' | 'ir' | 'taxi'. */
  slot: string | null;
  projPointsPpr: number | null;
  projSeason: number | null;
}

export interface OptimalProjectionInput {
  rosterPositions: string[] | null | undefined;
  /** Every player_week_points row for the week, starters AND bench. */
  weekly: WeekProjectionRow[];
  /** Every roster_players row for the season, joined to its player. */
  rosterSlots: RosterSlotRow[];
  seasonYear: number;
  /** NFL teams whose game this week is no longer 'pre_game'. */
  kickedOffTeams: ReadonlySet<string>;
}

/** Slots a player cannot be started from without a roster move. */
const RESERVE_SLOTS = new Set(["ir", "taxi"]);

/**
 * Each roster's BEST POSSIBLE projected weekly total, from whichever source
 * is available.
 *
 * The number that prices a game must not move when a manager moves a player,
 * so it is deliberately computed from what the roster COULD start, not from
 * the lineup as it stands. Benching a star until minutes before kickoff used
 * to drag that roster's projection down, which repriced their game on the
 * next hourly sync and handed the manager (or a friend) a line they had just
 * manufactured. The optimal lineup does not care whether the lineup is set,
 * which also retires the old "fullest lineup in the league" heuristic: there
 * is nothing left to detect, because an untouched default lineup and a
 * carefully set one produce the same price.
 *
 * Two exclusions keep "could start" honest:
 *  - IR and taxi players cannot legally be started, so they never enter the
 *    pool from either source.
 *  - A benched player whose own NFL game has already kicked off can no longer
 *    be inserted into the lineup, so he leaves the weekly pool. An already
 *    started player stays, because his points are on the field either way.
 *    (A line locks once ANY starter has kicked off, so in practice this only
 *    bites a benched Thursday-night player being priced on Friday.)
 *
 * The weekly source wins whenever it produces a positive total. The
 * season-long source (roster projections spread across the regular season) is
 * not merely a safety net: player_week_points is empty before a week has been
 * synced and entirely empty before a season's first sync, so it is what
 * prices the opening board before anybody has played a snap.
 *
 * A roster with no usable number from either source is simply absent from the
 * map; callers treat absence as unpriceable.
 *
 * Pure, so both the exclusion rules and the source choice are directly
 * testable.
 */
export function optimalProjectedTotals({
  rosterPositions,
  weekly,
  rosterSlots,
  seasonYear,
  kickedOffTeams,
}: OptimalProjectionInput): Map<string, number> {
  const reserved = new Set<string>();
  for (const row of rosterSlots) {
    if (row.slot && RESERVE_SLOTS.has(row.slot)) {
      reserved.add(`${row.rosterId}:${row.playerId}`);
    }
  }

  const weeklyPools = new Map<string, RosterPlayerPoints[]>();
  for (const row of weekly) {
    if (reserved.has(`${row.rosterId}:${row.playerId}`)) continue;
    if (!row.started && row.nflTeam && kickedOffTeams.has(row.nflTeam)) continue;
    const pool = weeklyPools.get(row.rosterId) ?? [];
    pool.push({
      playerId: row.playerId,
      position: row.position,
      points: row.projectedPoints ?? 0,
    });
    weeklyPools.set(row.rosterId, pool);
  }

  const seasonPools = new Map<string, RosterPlayerPoints[]>();
  for (const row of rosterSlots) {
    if (row.slot && RESERVE_SLOTS.has(row.slot)) continue;
    const pool = seasonPools.get(row.rosterId) ?? [];
    // A projection stored for a prior season is a stale leftover, not this
    // year's number, so it contributes nothing.
    const current = row.projSeason === seasonYear;
    pool.push({
      playerId: row.playerId,
      position: row.position,
      points: current ? (row.projPointsPpr ?? 0) : 0,
    });
    seasonPools.set(row.rosterId, pool);
  }

  const totals = new Map<string, number>();
  const rosterIds = new Set([...weeklyPools.keys(), ...seasonPools.keys()]);

  for (const rosterId of rosterIds) {
    const weeklyPool = weeklyPools.get(rosterId);
    const weeklyTotal = weeklyPool
      ? bestPossibleLineup(rosterPositions, weeklyPool)
      : 0;
    if (weeklyTotal > 0) {
      totals.set(rosterId, weeklyTotal);
      continue;
    }

    const seasonPool = seasonPools.get(rosterId);
    const seasonTotal = seasonPool
      ? bestPossibleLineup(rosterPositions, seasonPool) / REGULAR_SEASON_GAMES
      : 0;
    if (seasonTotal > 0) totals.set(rosterId, seasonTotal);
  }

  return totals;
}

/**
 * Best-possible projected starting-lineup total per roster for one week.
 *
 * Fetches the rows and hands them to optimalProjectedTotals, which owns every
 * rule (see its doc comment for why the number is manipulation resistant).
 * Set-based throughout: four queries for the whole league, never one per
 * roster.
 */
export async function getWeekProjectedTotals(
  seasonId: number,
  seasonYear: number,
  week: number,
): Promise<Map<string, number>> {
  const [rosterPositions, weeklyRows, rosterSlotRows, gameRows] = await Promise.all([
    loadSeasonRosterPositions(seasonId),
    // Starters AND bench: the pool the optimal lineup is chosen from.
    db
      .select({
        rosterId: playerWeekPoints.rosterId,
        playerId: playerWeekPoints.playerId,
        position: players.position,
        nflTeam: players.nflTeam,
        projectedPoints: playerWeekPoints.projectedPoints,
        started: playerWeekPoints.started,
      })
      .from(playerWeekPoints)
      // Left join: a historical player missing from the players snapshot has
      // no position and simply fills no slot.
      .leftJoin(players, eq(playerWeekPoints.playerId, players.id))
      .where(
        and(
          eq(playerWeekPoints.seasonId, seasonId),
          eq(playerWeekPoints.week, week),
        ),
      ),
    // Doubles as the IR/taxi exclusion list and the season-long pool.
    db
      .select({
        rosterId: rosterPlayers.rosterId,
        playerId: rosterPlayers.playerId,
        position: players.position,
        slot: rosterPlayers.slot,
        projPointsPpr: players.projPointsPpr,
        projSeason: players.projSeason,
      })
      .from(rosterPlayers)
      .innerJoin(players, eq(rosterPlayers.playerId, players.id))
      .where(eq(rosterPlayers.seasonId, seasonId)),
    db
      .select({ homeTeam: nflGames.homeTeam, awayTeam: nflGames.awayTeam })
      .from(nflGames)
      .where(
        and(
          eq(nflGames.seasonYear, seasonYear),
          eq(nflGames.week, week),
          ne(nflGames.status, "pre_game"),
        ),
      ),
  ]);

  const kickedOffTeams = new Set<string>();
  for (const g of gameRows) {
    kickedOffTeams.add(g.homeTeam);
    kickedOffTeams.add(g.awayTeam);
  }

  return optimalProjectedTotals({
    rosterPositions,
    weekly: weeklyRows,
    rosterSlots: rosterSlotRows,
    seasonYear,
    kickedOffTeams,
  });
}

// ---------------------------------------------------------------------------
// Kickoff state: when a line locks, from real game status
// ---------------------------------------------------------------------------

export interface RosterKickoffState {
  /** Earliest scheduled game date among this roster's starters. */
  earliestGameDate: string | null;
  /** True once ANY of this roster's starters is playing or has played. */
  started: boolean;
}

/**
 * Per-roster kickoff state for a week, read from nfl_games via each starter's
 * NFL team.
 *
 * A fantasy matchup is booked once either side has a starter on the field, so
 * this is what locks a line. It is game-status data, never a points heuristic:
 * a starter who finishes with 0.0 has still played.
 */
export async function getRosterKickoffStates(
  seasonId: number,
  seasonYear: number,
  week: number,
): Promise<Map<string, RosterKickoffState>> {
  const rows = await db
    .select({
      rosterId: rosterPlayers.rosterId,
      earliest: sql<string | null>`min(${nflGames.gameDate})`,
      started: sql<boolean>`bool_or(${nflGames.status} <> 'pre_game')`,
    })
    .from(rosterPlayers)
    .innerJoin(players, eq(rosterPlayers.playerId, players.id))
    .innerJoin(
      nflGames,
      and(
        eq(nflGames.seasonYear, seasonYear),
        eq(nflGames.week, week),
        or(
          eq(nflGames.homeTeam, players.nflTeam),
          eq(nflGames.awayTeam, players.nflTeam),
        ),
      ),
    )
    .where(
      and(eq(rosterPlayers.seasonId, seasonId), eq(rosterPlayers.slot, "starter")),
    )
    .groupBy(rosterPlayers.rosterId);

  const map = new Map<string, RosterKickoffState>();
  for (const row of rows) {
    map.set(row.rosterId, {
      earliestGameDate: row.earliest ?? null,
      started: Boolean(row.started),
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

interface MatchupSideRow {
  matchupId: number;
  rosterId: string;
  franchiseId: string;
  points: number | null;
  status: string | null;
  name: string;
  slug: string;
  abbreviation: string | null;
  brandingColor: string | null;
  avatarUrl: string | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
}

/**
 * The Board for one week: every priced game with both sides, current scores,
 * lock state, and league pick counts.
 *
 * Reads book_lines only. Prices are written by the hourly sync
 * (lib/sync/book-lines.ts), never computed here, so the page stays a pure
 * cache read with zero Sleeper calls at render.
 */
export async function getBookBoard(
  seasonId: number,
  seasonYear: number,
  week: number,
): Promise<BookGame[]> {
  const lines = await db
    .select()
    .from(bookLines)
    .where(and(eq(bookLines.seasonId, seasonId), eq(bookLines.week, week)));

  if (lines.length === 0) return [];

  const matchupIds = lines.map((l) => l.matchupId);

  const sideRows: MatchupSideRow[] = await db
    .select({
      matchupId: matchups.matchupId,
      rosterId: matchups.rosterId,
      franchiseId: matchups.franchiseId,
      points: matchups.points,
      status: matchups.status,
      name: franchises.name,
      slug: franchises.slug,
      abbreviation: franchises.abbreviation,
      brandingColor: franchises.brandingColor,
      avatarUrl: franchiseSeasons.avatarUrl,
      wins: franchiseSeasons.wins,
      losses: franchiseSeasons.losses,
      ties: franchiseSeasons.ties,
    })
    .from(matchups)
    .innerJoin(franchises, eq(matchups.franchiseId, franchises.id))
    .leftJoin(
      franchiseSeasons,
      and(
        eq(franchiseSeasons.franchiseId, matchups.franchiseId),
        eq(franchiseSeasons.seasonId, matchups.seasonId),
      ),
    )
    .where(
      and(
        eq(matchups.seasonId, seasonId),
        eq(matchups.week, week),
        inArray(matchups.matchupId, matchupIds),
      ),
    );

  // Crests are decorative: a missing avatar is a monogram, never an error.
  let fallbackAvatars = new Map<string, string>();
  try {
    fallbackAvatars = await getLatestAvatarUrls(sideRows.map((r) => r.franchiseId));
  } catch {
    fallbackAvatars = new Map();
  }

  const byRoster = new Map<string, MatchupSideRow>();
  for (const row of sideRows) byRoster.set(row.rosterId, row);

  const kickoffs = await getRosterKickoffStates(seasonId, seasonYear, week);
  const pickCounts = await getWeekPickCounts(seasonId, week);

  const games: BookGame[] = [];

  for (const line of lines) {
    const homeRow = byRoster.get(line.homeRosterId);
    const awayRow = byRoster.get(line.awayRosterId);
    // A line whose matchup rows have gone missing is a data problem, not
    // something to render half of.
    if (!homeRow || !awayRow) continue;

    const homeKick = kickoffs.get(line.homeRosterId);
    const awayKick = kickoffs.get(line.awayRosterId);
    const started = Boolean(homeKick?.started || awayKick?.started);
    const isFinal = homeRow.status === "complete" && awayRow.status === "complete";

    const status: BookGameStatus = isFinal ? "final" : started ? "live" : "open";

    const earliest = [homeKick?.earliestGameDate, awayKick?.earliestGameDate]
      .filter((d): d is string => Boolean(d))
      .sort()[0];

    const homePoints = homeRow.points ?? 0;
    const awayPoints = awayRow.points ?? 0;

    const toSide = (
      row: MatchupSideRow,
      spread: number,
      moneyline: number,
      points: number,
      projected: number | null,
    ): BookSide => ({
      rosterId: row.rosterId,
      franchiseId: row.franchiseId,
      name: row.name,
      slug: row.slug,
      abbreviation: row.abbreviation,
      brandingColor: row.brandingColor,
      avatarUrl: row.avatarUrl ?? fallbackAvatars.get(row.franchiseId) ?? null,
      record: formatRecord(row.wins, row.losses, row.ties),
      spread,
      moneyline,
      points,
      projected,
    });

    const counts = pickCounts.get(line.matchupId) ?? { home: 0, away: 0 };

    games.push({
      matchupId: line.matchupId,
      seasonId: line.seasonId,
      week: line.week,
      status,
      spread: line.spread,
      home: toSide(homeRow, line.spread, line.mlHome, homePoints, line.homeProjected),
      away: toSide(awayRow, -line.spread, line.mlAway, awayPoints, line.awayProjected),
      kickoffLabel: kickoffWeekday(earliest),
      // The game-level cover, against the line as it stands. A member's OWN
      // pick is graded separately against the spread snapshotted onto their
      // row, which is the only number they agreed to.
      coveringSide:
        status === "open"
          ? null
          : coverSide(homePoints, awayPoints, line.spread),
      homePicks: counts.home,
      awayPicks: counts.away,
    });
  }

  games.sort((a, b) => a.matchupId - b.matchupId);
  return games;
}

/** Pick counts per matchup for a week, for the league-consensus bar. */
export async function getWeekPickCounts(
  seasonId: number,
  week: number,
): Promise<Map<number, { home: number; away: number }>> {
  const rows = await db
    .select({
      matchupId: bookPicks.matchupId,
      side: bookPicks.side,
      count: sql<number>`count(*)`,
    })
    .from(bookPicks)
    .where(and(eq(bookPicks.seasonId, seasonId), eq(bookPicks.week, week)))
    .groupBy(bookPicks.matchupId, bookPicks.side);

  const map = new Map<number, { home: number; away: number }>();
  for (const row of rows) {
    const entry = map.get(row.matchupId) ?? { home: 0, away: 0 };
    if (row.side === "home") entry.home = Number(row.count);
    else entry.away = Number(row.count);
    map.set(row.matchupId, entry);
  }
  return map;
}

/** One member's picks for a week, keyed by matchup. */
export async function getMemberPicksForWeek(
  memberId: number,
  seasonId: number,
  week: number,
): Promise<MemberBookPick[]> {
  const rows = await db
    .select({
      matchupId: bookPicks.matchupId,
      side: bookPicks.side,
      spreadAtPick: bookPicks.spreadAtPick,
      mlAtPick: bookPicks.mlAtPick,
      lockedAt: bookPicks.lockedAt,
    })
    .from(bookPicks)
    .where(
      and(
        eq(bookPicks.memberId, memberId),
        eq(bookPicks.seasonId, seasonId),
        eq(bookPicks.week, week),
      ),
    );

  return rows.map((r) => ({
    matchupId: r.matchupId,
    side: r.side === "away" ? "away" : "home",
    spreadAtPick: r.spreadAtPick,
    mlAtPick: r.mlAtPick,
    lockedAt: r.lockedAt ? r.lockedAt.toISOString() : null,
  }));
}

/** The stored line for one game, as the server action needs it to book a pick. */
export async function getBookLine(
  seasonId: number,
  week: number,
  matchupId: number,
) {
  const [row] = await db
    .select()
    .from(bookLines)
    .where(
      and(
        eq(bookLines.seasonId, seasonId),
        eq(bookLines.week, week),
        eq(bookLines.matchupId, matchupId),
      ),
    )
    .limit(1);
  return row ?? null;
}
