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
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getLatestAvatarUrls } from "@/lib/queries/franchise-avatars";
import { getNflState } from "@/lib/queries/nfl-state";
import type {
  BookChip,
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
  BookChip,
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

/** "7-2", or "7-2-1" when there are ties to report. */
export function formatRecord(
  wins: number | null,
  losses: number | null,
  ties: number | null,
): string {
  const w = wins ?? 0;
  const l = losses ?? 0;
  const t = ties ?? 0;
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
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

/**
 * The three header chips.
 *
 * These are facts about the BOARD, not about you: /book is one cached page
 * served to the whole league, so a personal ATS record could not live in it
 * honestly (that belongs on the Tracking tab, behind a session). And per the
 * superlatives rule, a chip only appears when it is a true claim, so an empty
 * board produces no chips rather than a row of zeroes.
 */
export function buildBoardChips(games: BookGame[], week: number): BookChip[] {
  if (games.length === 0) return [];

  const chips: BookChip[] = [
    {
      label: "On the Board",
      value: String(games.length),
      context: `week ${week}`,
    },
  ];

  const byMargin = [...games].sort(
    (a, b) => Math.abs(b.spread) - Math.abs(a.spread),
  );
  const widest = byMargin[0];
  const tightest = byMargin[byMargin.length - 1];

  if (widest) {
    const favorite = widest.spread < 0 ? widest.home : widest.away;
    chips.push({
      label: "Biggest Line",
      value: Math.abs(widest.spread).toFixed(1),
      context: favorite.abbreviation ?? favorite.name,
    });
  }

  // Only a real second data point: with one game on the board the widest line
  // IS the tightest line, and printing it twice is a fake stat.
  if (tightest && tightest !== widest) {
    chips.push({
      label: "Coin Flip",
      value: Math.abs(tightest.spread).toFixed(1),
      context: `${tightest.home.abbreviation ?? tightest.home.name} vs ${
        tightest.away.abbreviation ?? tightest.away.name
      }`,
    });
  }

  return chips;
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

export interface WeeklyStarterTotal {
  rosterId: string;
  starters: number;
  projected: number;
}

/**
 * Chooses each roster's projected weekly total from the two available sources.
 *
 * The weekly source (Sleeper's per-week projections for the lineup as it stands)
 * is the better number, but only for a roster whose lineup is actually SET. A
 * manager who has not touched their lineup sits on Sleeper's default, which is
 * routinely short a starter or two and projects like a practice squad; pricing
 * that would post a 100-point favorite against somebody who is about to fix
 * their lineup an hour before kickoff. So a roster carrying fewer starters than
 * the fullest lineup in the league falls back to its season-long projection
 * spread across the regular season, which does not care what the lineup looks
 * like today.
 *
 * Both sources estimate the same quantity (this roster's expected weekly
 * starter total), so a game can legitimately price one side from each.
 *
 * Pure, so the source-selection rule is directly testable.
 */
export function chooseProjectedTotals(
  weekly: WeeklyStarterTotal[],
  seasonLongPerWeek: Map<string, number>,
): Map<string, number> {
  const fullLineup = weekly.reduce((max, row) => Math.max(max, row.starters), 0);
  const chosen = new Map<string, number>();

  for (const row of weekly) {
    if (row.projected > 0 && row.starters >= fullLineup && fullLineup > 0) {
      chosen.set(row.rosterId, row.projected);
    }
  }

  for (const [rosterId, perWeek] of seasonLongPerWeek) {
    if (!chosen.has(rosterId) && perWeek > 0) chosen.set(rosterId, perWeek);
  }

  return chosen;
}

/**
 * Projected starting-lineup total per roster for one week, from whichever
 * source is trustworthy for each roster (see chooseProjectedTotals).
 *
 * player_week_points is empty before a week has been synced, and entirely empty
 * before a season's first sync, so the season-long path is not just a safety
 * net: it is what prices the opening board before anybody has played a snap.
 */
export async function getWeekProjectedTotals(
  seasonId: number,
  seasonYear: number,
  week: number,
): Promise<Map<string, number>> {
  const weeklyRows = await db
    .select({
      rosterId: playerWeekPoints.rosterId,
      starters: sql<number>`count(*)`,
      projected: sql<number>`coalesce(sum(${playerWeekPoints.projectedPoints}), 0)`,
    })
    .from(playerWeekPoints)
    .where(
      and(
        eq(playerWeekPoints.seasonId, seasonId),
        eq(playerWeekPoints.week, week),
        eq(playerWeekPoints.started, true),
      ),
    )
    .groupBy(playerWeekPoints.rosterId);

  const seasonLongRows = await db
    .select({
      rosterId: rosterPlayers.rosterId,
      total: sql<number>`coalesce(sum(${players.projPointsPpr}), 0)`,
    })
    .from(rosterPlayers)
    .innerJoin(players, eq(rosterPlayers.playerId, players.id))
    .where(
      and(
        eq(rosterPlayers.seasonId, seasonId),
        eq(rosterPlayers.slot, "starter"),
        eq(players.projSeason, seasonYear),
      ),
    )
    .groupBy(rosterPlayers.rosterId);

  const seasonLongPerWeek = new Map<string, number>();
  for (const row of seasonLongRows) {
    seasonLongPerWeek.set(row.rosterId, Number(row.total) / REGULAR_SEASON_GAMES);
  }

  return chooseProjectedTotals(
    weeklyRows.map((r) => ({
      rosterId: r.rosterId,
      starters: Number(r.starters),
      projected: Number(r.projected),
    })),
    seasonLongPerWeek,
  );
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
      coveringSide:
        status === "open"
          ? null
          : homePoints - awayPoints + line.spread > 0
            ? "home"
            : "away",
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
