import { db } from "@/lib/db";
import {
  bookFuturePicks,
  bookFutures,
  franchiseSeasons,
  franchises,
  matchups,
  nflGames,
  playerWeekPoints,
  players,
  rosterPlayers,
  seasons,
} from "@/lib/db/schema";
import { and, asc, desc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { getLatestAvatarUrls } from "@/lib/queries/franchise-avatars";
import { PLAYOFF_BERTHS } from "@/lib/queries/divisions";
import { TOTAL_WEEKS } from "@/lib/schedule/build-schedule";
import { REGULAR_SEASON_GAMES, getWeekProjectedTotals } from "@/lib/queries/book";
import {
  FIELD_SUBJECT_ID,
  FUTURES_MARKET_IDS,
  futuresLockWeek,
  regularSeasonWeeksRemaining,
  startShareFor,
  type FuturesGame,
  type FuturesMarket,
  type FuturesTeam,
} from "@/lib/book/futures";
import { FUTURES_COPY } from "@/lib/book/shared";
import type {
  FuturesBoard,
  FuturesContextPart,
  FuturesEntry,
  FutureResult,
  MemberFuturePick,
} from "@/lib/book/shared";

export type {
  FuturesBoard,
  FuturesEntry,
  MemberFuturePick,
} from "@/lib/book/shared";

/** Playoff berths, and therefore the size of the winners bracket. */
export const FUTURES_PLAYOFF_SPOTS = PLAYOFF_BERTHS;

// ---------------------------------------------------------------------------
// Season shape
// ---------------------------------------------------------------------------

export interface FuturesSeason {
  seasonId: number;
  seasonYear: number;
  playoffWeekStart: number;
  /** The last week that counts toward MVP and ROTY. */
  finalRegularWeek: number;
}

/**
 * The season the futures book is trading, with its playoff boundary resolved.
 *
 * playoff_week_start is nullable (a season Sleeper has not settled yet), so it
 * falls back to the league's own schedule length rather than guessing: a wrong
 * boundary would silently change what "weeks 1 to N" means on the MVP card,
 * which is a printed grading rule.
 */
export async function resolveFuturesSeason(): Promise<FuturesSeason | null> {
  const [row] = await db
    .select({
      id: seasons.id,
      seasonYear: seasons.seasonYear,
      playoffWeekStart: seasons.playoffWeekStart,
    })
    .from(seasons)
    .orderBy(desc(seasons.seasonYear))
    .limit(1);

  if (!row) return null;

  const playoffWeekStart = row.playoffWeekStart ?? TOTAL_WEEKS + 1;
  return {
    seasonId: row.id,
    seasonYear: row.seasonYear,
    playoffWeekStart,
    finalRegularWeek: Math.max(1, playoffWeekStart - 1),
  };
}

// ---------------------------------------------------------------------------
// Locks
// ---------------------------------------------------------------------------

/**
 * Which fantasy weeks have really kicked off, as a set.
 *
 * Read from nfl_games status, which is the only honest source: a market must
 * not close because a clock said so, and it must not stay open because nobody
 * has scored yet. Same rule the weekly board locks on.
 */
export async function getKickedOffWeeks(seasonYear: number): Promise<Set<number>> {
  const rows = await db
    .select({ week: nflGames.week })
    .from(nflGames)
    .where(
      and(eq(nflGames.seasonYear, seasonYear), ne(nflGames.status, "pre_game")),
    )
    .groupBy(nflGames.week);

  return new Set(rows.map((r) => r.week));
}

/**
 * The markets already stamped closed for a season.
 *
 * A market is closed the moment any of its rows carries a lockedAt, and the
 * pricing pass reads this first: a closed market is never re-priced, so the
 * board people committed against stays the board that gets graded.
 */
export async function getStampedMarkets(
  seasonId: number,
): Promise<Set<FuturesMarket>> {
  const rows = await db
    .select({ market: bookFutures.market })
    .from(bookFutures)
    .where(
      and(eq(bookFutures.seasonId, seasonId), sql`${bookFutures.lockedAt} is not null`),
    )
    .groupBy(bookFutures.market);

  return new Set(rows.map((r) => r.market as FuturesMarket));
}

/**
 * The subjects members have already bet on, per market.
 *
 * The pricing pass keeps these on the board even when they drop out of the top
 * N: a book does not withdraw a market it has taken action on, and the priced
 * row is also where that pick's grade eventually gets written.
 */
export async function getPickedSubjectsByMarket(
  seasonId: number,
): Promise<Map<FuturesMarket, string[]>> {
  const rows = await db
    .select({
      market: bookFuturePicks.market,
      subjectId: bookFuturePicks.subjectId,
    })
    .from(bookFuturePicks)
    .where(eq(bookFuturePicks.seasonId, seasonId))
    .groupBy(bookFuturePicks.market, bookFuturePicks.subjectId);

  const byMarket = new Map<FuturesMarket, string[]>();
  for (const row of rows) {
    const market = row.market as FuturesMarket;
    const list = byMarket.get(market) ?? [];
    list.push(row.subjectId);
    byMarket.set(market, list);
  }
  return byMarket;
}

// ---------------------------------------------------------------------------
// Pricing inputs (read by the daily sync)
// ---------------------------------------------------------------------------

export interface FuturesPricingInputs {
  teams: FuturesTeam[];
  remainingGames: FuturesGame[];
  /** Regular-season weeks still to be played, for the player markets' pace. */
  weeksRemaining: number;
  candidates: PlayerCandidateRow[];
}

export interface PlayerCandidateRow {
  playerId: string;
  fullName: string | null;
  position: string | null;
  nflTeam: string | null;
  isRookie: boolean;
  /** Points scored while in a starting lineup, this regular season. */
  bankedPoints: number;
  weeksStarted: number;
  /** Rest-of-season start credit: 1.0 for a starter, BENCH_START_SHARE for bench. */
  startShare: number;
  projectedPerWeek: number;
  /** The roster this player is on, so team-impact terms can be computed. */
  rosterId: string;
  /** This roster's projected starting-lineup total, per week. */
  lineupProjectedPerWeek: number;
  /** Best other same-position teammate's projected total, per week. */
  bestAlternativePerWeek: number;
}

/**
 * Everything the pricing pass needs, in one read.
 *
 * Deliberately one function rather than four: the four markets are priced off
 * one shared picture of the season (the same standings, the same projections,
 * the same remaining schedule), and splitting the reads would let two boards be
 * computed from two different moments.
 */
export async function getFuturesPricingInputs(
  season: FuturesSeason,
  week: number,
): Promise<FuturesPricingInputs> {
  // Weeks that have really kicked off, per nfl_games: the authority for
  // "banked", immune to the lineup sync writing started=true rows for every
  // week of the schedule the moment the season is created. Fetched once and
  // reused for both the weeks-remaining arithmetic below and the banked-points
  // scoping inside getPlayerCandidates, rather than recomputed.
  const kickedOffWeeks = await getKickedOffWeeks(season.seasonYear);
  const playedWeeks = [...kickedOffWeeks]
    .filter((w) => w >= 1 && w <= season.finalRegularWeek)
    .sort((a, b) => a - b);

  // Independent reads of one moment in the season. They are issued together
  // rather than in sequence for the obvious reason, and also for a less
  // obvious one: the further apart they run, the more room there is for a
  // sync to land between them and price two boards off two different seasons.
  const [standingRows, projections, remainingGames] = await Promise.all([
    db
      .select({
        franchiseId: franchiseSeasons.franchiseId,
        rosterId: franchiseSeasons.rosterId,
        wins: franchiseSeasons.wins,
        losses: franchiseSeasons.losses,
        ties: franchiseSeasons.ties,
        pointsScored: franchiseSeasons.pointsScored,
        division: franchiseSeasons.division,
      })
      .from(franchiseSeasons)
      .where(eq(franchiseSeasons.seasonId, season.seasonId)),
    getWeekProjectedTotals(season.seasonId, season.seasonYear, week),
    getRemainingSchedule(season),
  ]);

  // Candidates need the franchise starting-lineup projection map above (the
  // team-impact denominator), so this read follows rather than joins the
  // batch: reusing the map is the point, per book-futures's own comment about
  // the champion market pricing off the same number.
  const candidates = await getPlayerCandidates(season, playedWeeks, projections);

  const teams: FuturesTeam[] = standingRows.map((row) => ({
    franchiseId: row.franchiseId,
    rosterId: row.rosterId,
    wins: row.wins ?? 0,
    losses: row.losses ?? 0,
    ties: row.ties ?? 0,
    pointsFor: row.pointsScored ?? 0,
    projectedPerWeek: projections.get(row.rosterId) ?? 0,
    division: row.division,
  }));

  // Counted off nfl_games kickoffs, the same authority the market locks read.
  // Counting completed matchups instead would double count the week in
  // progress: its started points are already banked, while the week itself is
  // not "complete" yet, so every starter would be credited a projected week he
  // had already played.
  const weeksRemaining = regularSeasonWeeksRemaining(
    season.finalRegularWeek,
    playedWeeks.length,
  );

  return { teams, remainingGames, weeksRemaining, candidates };
}

/**
 * The regular-season games still to be played, as PAIRINGS.
 *
 * One entry per real game, which is what keeps the simulation zero-sum: a
 * per-team opponent list visits every game twice and would let both sides win
 * it. A matchup whose pairing is not exactly two rosters (a bye, a half-synced
 * week) is dropped rather than simulated against nobody.
 */
async function getRemainingSchedule(
  season: FuturesSeason,
): Promise<FuturesGame[]> {
  const rows = await db
    .select({
      week: matchups.week,
      matchupId: matchups.matchupId,
      rosterId: matchups.rosterId,
    })
    .from(matchups)
    .where(
      and(
        eq(matchups.seasonId, season.seasonId),
        lte(matchups.week, season.finalRegularWeek),
        ne(matchups.status, "complete"),
      ),
    );

  const byPairing = new Map<string, string[]>();
  for (const row of rows) {
    const key = `${row.week}:${row.matchupId}`;
    const list = byPairing.get(key) ?? [];
    list.push(row.rosterId);
    byPairing.set(key, list);
  }

  const games: FuturesGame[] = [];
  for (const [, rosterIds] of byPairing) {
    if (rosterIds.length !== 2) continue;
    const [a, b] = [...rosterIds].sort((x, y) => Number(x) - Number(y));
    games.push({ rosterA: a, rosterB: b });
  }
  return games;
}

/**
 * Regular-season weeks that are fully in the books.
 *
 * The grading gate: the player awards are "most points started across the
 * regular season", so they cannot be settled until the regular season has
 * actually happened.
 */
export async function getCompletedWeekCount(
  season: FuturesSeason,
): Promise<number> {
  const rows = await db
    .select({ week: matchups.week })
    .from(matchups)
    .where(
      and(
        eq(matchups.seasonId, season.seasonId),
        lte(matchups.week, season.finalRegularWeek),
        eq(matchups.status, "complete"),
      ),
    )
    .groupBy(matchups.week);

  return rows.length;
}

/**
 * The MVP and ROTY candidate pool: everyone who has started a game this
 * season, plus everyone currently rostered as a starter OR a bench player.
 *
 * The union matters at both ends of the calendar. Before week 1 nobody has
 * started anything, so without the roster side the pool would be empty and
 * there would be no market at all; late in the season somebody who has banked
 * 200 points and since been benched is still very much in the race, so
 * without the history side he would fall off the board he is leading.
 *
 * Bench is included, not just starter: a preseason bench stud has real award
 * equity, and in a dynasty league the rookie who breaks out in October is
 * almost always on a bench in August. Taxi and IR are excluded: neither can
 * bank started points without being activated first.
 *
 * `playedWeeks` is the set of fantasy weeks that have really kicked off (per
 * nfl_games, computed once by the caller). Banked points and weeks-started are
 * scoped to exactly those weeks: the lineup sync writes a player_week_points
 * row with started=true for every week of the schedule the moment the season
 * is created, so an unscoped "started=true" sum would count preseason weeks
 * that have not been played as banked, and a preseason player would show 14
 * starts he never took.
 *
 * Rookie is years_exp = 0. A NULL years_exp is treated as NOT a rookie: the
 * column is a snapshot of the current NFL season and a missing value is a gap
 * in the players sync, and quietly promoting unknowns into the rookie market
 * would put fake names on a graded board.
 */
async function getPlayerCandidates(
  season: FuturesSeason,
  playedWeeks: number[],
  lineupProjectedTotals: Map<string, number>,
): Promise<PlayerCandidateRow[]> {
  const startedRows = playedWeeks.length
    ? await db
        .select({
          playerId: playerWeekPoints.playerId,
          bankedPoints: sql<number>`coalesce(sum(${playerWeekPoints.points}), 0)`,
          weeksStarted: sql<number>`count(*)`,
        })
        .from(playerWeekPoints)
        .where(
          and(
            eq(playerWeekPoints.seasonId, season.seasonId),
            eq(playerWeekPoints.started, true),
            inArray(playerWeekPoints.week, playedWeeks),
          ),
        )
        .groupBy(playerWeekPoints.playerId)
    : [];

  // starter AND bench: taxi/IR stay excluded (see the doc comment above).
  const rosterRows = await db
    .select({
      playerId: rosterPlayers.playerId,
      rosterId: rosterPlayers.rosterId,
      slot: rosterPlayers.slot,
    })
    .from(rosterPlayers)
    .where(
      and(
        eq(rosterPlayers.seasonId, season.seasonId),
        inArray(rosterPlayers.slot, ["starter", "bench"]),
      ),
    );

  const rosterByPlayer = new Map(
    rosterRows.map((r) => [r.playerId, { rosterId: r.rosterId, slot: r.slot }]),
  );
  const bankedById = new Map(
    startedRows.map((r) => [
      r.playerId,
      {
        bankedPoints: Number(r.bankedPoints),
        weeksStarted: Number(r.weeksStarted),
      },
    ]),
  );

  const allIds = [...new Set([...bankedById.keys(), ...rosterByPlayer.keys()])];
  if (allIds.length === 0) return [];

  const playerRows = await db
    .select({
      id: players.id,
      fullName: players.fullName,
      position: players.position,
      nflTeam: players.nflTeam,
      yearsExp: players.yearsExp,
      projPointsPpr: players.projPointsPpr,
      projSeason: players.projSeason,
    })
    .from(players)
    .where(inArray(players.id, allIds));

  const projectedPerWeekById = new Map<string, number>();
  const positionById = new Map<string, string | null>();
  for (const p of playerRows) {
    // The league-scored season projection, spread across the season. Same
    // source the weekly board falls back to, so a player's pace here and his
    // team's line there cannot disagree.
    const projectedPerWeek =
      p.projSeason === season.seasonYear && p.projPointsPpr != null
        ? p.projPointsPpr / REGULAR_SEASON_GAMES
        : 0;
    projectedPerWeekById.set(p.id, projectedPerWeek);
    positionById.set(p.id, p.position);
  }

  // Best same-position teammate's pace, computed in TypeScript over rows
  // already fetched rather than as a correlated subquery. Grouped by
  // rosterId + position, over every player carried in the pool (starter and
  // bench, taxi/IR excluded), which is the full comparison set the plan asks
  // for.
  const byRosterPosition = new Map<string, { playerId: string; perWeek: number }[]>();
  for (const [playerId, roster] of rosterByPlayer) {
    const position = positionById.get(playerId);
    if (!position) continue;
    const key = `${roster.rosterId}:${position}`;
    const list = byRosterPosition.get(key) ?? [];
    list.push({ playerId, perWeek: projectedPerWeekById.get(playerId) ?? 0 });
    byRosterPosition.set(key, list);
  }

  function bestAlternativeFor(
    playerId: string,
    rosterId: string,
    position: string | null,
  ): number {
    if (!position) return 0;
    const teammates = byRosterPosition.get(`${rosterId}:${position}`) ?? [];
    let best = 0;
    for (const t of teammates) {
      if (t.playerId === playerId) continue;
      if (t.perWeek > best) best = t.perWeek;
    }
    return best;
  }

  return playerRows.map((p) => {
    const banked = bankedById.get(p.id);
    const roster = rosterByPlayer.get(p.id);
    const projectedPerWeek = projectedPerWeekById.get(p.id) ?? 0;
    const rosterId = roster?.rosterId ?? "";

    return {
      playerId: p.id,
      fullName: p.fullName,
      position: p.position,
      nflTeam: p.nflTeam,
      isRookie: p.yearsExp === 0,
      bankedPoints: banked?.bankedPoints ?? 0,
      weeksStarted: banked?.weeksStarted ?? 0,
      startShare: startShareFor(roster?.slot === "bench" ? "bench" : "starter"),
      projectedPerWeek,
      rosterId,
      lineupProjectedPerWeek: lineupProjectedTotals.get(rosterId) ?? 0,
      bestAlternativePerWeek: bestAlternativeFor(p.id, rosterId, p.position),
    };
  });
}

// ---------------------------------------------------------------------------
// Grading inputs (read by the daily sync once the season is over)
// ---------------------------------------------------------------------------

export interface AwardScorerRow {
  subjectId: string;
  points: number;
  weeksStarted: number;
  isRookie: boolean;
}

/**
 * Started points per player across the regular season, the MVP/ROTY metric
 * exactly as the card states it: points scored while in the starting lineup,
 * weeks 1 through playoff_week_start - 1.
 */
export async function getAwardScorers(
  season: FuturesSeason,
): Promise<AwardScorerRow[]> {
  const rows = await db
    .select({
      playerId: playerWeekPoints.playerId,
      points: sql<number>`coalesce(sum(${playerWeekPoints.points}), 0)`,
      weeksStarted: sql<number>`count(*)`,
      yearsExp: players.yearsExp,
    })
    .from(playerWeekPoints)
    .leftJoin(players, eq(playerWeekPoints.playerId, players.id))
    .where(
      and(
        eq(playerWeekPoints.seasonId, season.seasonId),
        eq(playerWeekPoints.started, true),
        lte(playerWeekPoints.week, season.finalRegularWeek),
      ),
    )
    .groupBy(playerWeekPoints.playerId, players.yearsExp);

  return rows.map((r) => ({
    subjectId: r.playerId,
    points: Number(r.points),
    weeksStarted: Number(r.weeksStarted),
    isRookie: r.yearsExp === 0,
  }));
}

// ---------------------------------------------------------------------------
// The futures board (read by the page)
// ---------------------------------------------------------------------------

/** Board order, from the registry rather than restated here. */
const BOARD_ORDER: FuturesMarket[] = FUTURES_MARKET_IDS;

interface FuturesDetail {
  record?: string;
  playoffProb?: number;
  bankedPoints?: number;
  weeksStarted?: number;
  /** This player's raw share of his franchise's projected lineup, as a fraction. Not yet rendered; see issue #236. */
  lineupShare?: number;
}

/**
 * Every futures board for a season, priced, named and ready to render.
 *
 * Reads book_futures only. Prices are written by the daily sync
 * (lib/sync/book-futures.ts), never computed here, so the page stays a pure
 * cache read with zero Sleeper calls at render.
 */
export async function getFuturesBoards(
  season: FuturesSeason,
): Promise<FuturesBoard[]> {
  const rows = await db
    .select()
    .from(bookFutures)
    .where(eq(bookFutures.seasonId, season.seasonId))
    .orderBy(asc(bookFutures.market), desc(bookFutures.prob));

  if (rows.length === 0) return [];

  const franchiseIds = rows
    .filter((r) => r.subjectType === "franchise")
    .map((r) => r.subjectId);
  const playerIds = rows
    .filter((r) => r.subjectType === "player")
    .map((r) => r.subjectId);

  // Five reads that depend only on the priced rows above, so they go out
  // together. The avatar fetch keeps its own catch inside the batch: crests are
  // decorative, and a missing one is a monogram rather than a failed board.
  const [franchiseRows, playerRows, fallbackAvatars, kickedOff, pickCounts] =
    await Promise.all([
      franchiseIds.length
        ? db
            .select({
              id: franchises.id,
              name: franchises.name,
              slug: franchises.slug,
              abbreviation: franchises.abbreviation,
              brandingColor: franchises.brandingColor,
              avatarUrl: franchiseSeasons.avatarUrl,
            })
            .from(franchises)
            .leftJoin(
              franchiseSeasons,
              and(
                eq(franchiseSeasons.franchiseId, franchises.id),
                eq(franchiseSeasons.seasonId, season.seasonId),
              ),
            )
            .where(inArray(franchises.id, franchiseIds))
        : [],
      playerIds.length
        ? db
            .select({
              id: players.id,
              fullName: players.fullName,
              position: players.position,
              nflTeam: players.nflTeam,
            })
            .from(players)
            .where(inArray(players.id, playerIds))
        : [],
      getLatestAvatarUrls(franchiseIds).catch(() => new Map<string, string>()),
      getKickedOffWeeks(season.seasonYear),
      getFuturePickCounts(season.seasonId),
    ]);

  const franchiseById = new Map(franchiseRows.map((f) => [f.id, f]));
  const playerById = new Map(playerRows.map((p) => [p.id, p]));

  const byMarket = new Map<FuturesMarket, FuturesEntry[]>();

  for (const row of rows) {
    const market = row.market as FuturesMarket;
    if (!BOARD_ORDER.includes(market)) continue;

    const detail = (row.detail ?? {}) as FuturesDetail;
    const entry = toEntry(row, detail, franchiseById, playerById, fallbackAvatars);
    if (entry) {
      entry.pickCount = pickCounts.get(`${market}:${row.subjectId}`) ?? 0;
    }
    // A row whose subject has vanished from the database is a data problem, not
    // something to render half a name for.
    if (!entry) continue;

    const list = byMarket.get(market) ?? [];
    list.push(entry);
    byMarket.set(market, list);
  }

  const boards: FuturesBoard[] = [];
  for (const market of BOARD_ORDER) {
    const entries = byMarket.get(market);
    if (!entries || entries.length === 0) continue;

    const lockWeek = futuresLockWeek(market, season.playoffWeekStart);
    boards.push({
      market,
      entries,
      lockWeek,
      // A stamped lockedAt is the authority (the pricing pass wrote it when the
      // week really kicked off); the live week check is what closes the market
      // between that kickoff and the next sync run.
      locked: entries.some((e) => e.gradedResult != null) || kickedOff.has(lockWeek),
    });
  }

  return boards;
}

function toEntry(
  row: typeof bookFutures.$inferSelect,
  detail: FuturesDetail,
  franchiseById: Map<
    string,
    {
      id: string;
      name: string;
      slug: string;
      abbreviation: string | null;
      brandingColor: string | null;
      avatarUrl: string | null;
    }
  >,
  playerById: Map<
    string,
    { id: string; fullName: string | null; position: string | null; nflTeam: string | null }
  >,
  fallbackAvatars: Map<string, string>,
): FuturesEntry | null {
  const base = {
    subjectId: row.subjectId,
    odds: row.odds,
    prob: row.prob,
    // Filled in by the caller, which holds the counts for the whole board.
    pickCount: 0,
    gradedResult: (row.gradedResult as FutureResult | null) ?? null,
  };

  if (row.subjectType === "field") {
    return {
      ...base,
      subjectType: "field",
      name: FUTURES_COPY.fieldName,
      slug: null,
      abbreviation: null,
      brandingColor: null,
      imageUrl: null,
      position: null,
      nflTeam: null,
      context: [{ stat: "", label: FUTURES_COPY.fieldContext }],
    };
  }

  if (row.subjectType === "franchise") {
    const franchise = franchiseById.get(row.subjectId);
    if (!franchise) return null;
    return {
      ...base,
      subjectType: "franchise",
      name: franchise.name,
      slug: franchise.slug,
      abbreviation: franchise.abbreviation,
      brandingColor: franchise.brandingColor,
      imageUrl: franchise.avatarUrl ?? fallbackAvatars.get(franchise.id) ?? null,
      position: null,
      nflTeam: null,
      context: franchiseContext(detail),
    };
  }

  const player = playerById.get(row.subjectId);
  if (!player) return null;
  return {
    ...base,
    subjectType: "player",
    name: player.fullName ?? "Unknown player",
    slug: null,
    abbreviation: null,
    brandingColor: null,
    imageUrl: null,
    position: player.position,
    nflTeam: player.nflTeam,
    context: playerContext(detail),
  };
}

/** "9-3 record · 78% to make the playoffs". */
function franchiseContext(detail: FuturesDetail): FuturesContextPart[] {
  const parts: FuturesContextPart[] = [];
  if (detail.record) parts.push({ stat: detail.record, label: "record" });
  if (detail.playoffProb != null) {
    parts.push({
      stat: `${Math.round(detail.playoffProb * 100)}%`,
      label: "to make the playoffs",
    });
  }
  if (parts.length === 0) {
    parts.push({ stat: "", label: "no games played yet" });
  }
  return parts;
}

/** "214.6 points started · 8 starts", the exact metric the market grades on. */
function playerContext(detail: FuturesDetail): FuturesContextPart[] {
  const points = detail.bankedPoints ?? 0;
  const weeks = detail.weeksStarted ?? 0;
  const parts: FuturesContextPart[] = [
    { stat: points.toFixed(1), label: "points started" },
  ];
  if (weeks > 0) {
    parts.push({ stat: String(weeks), label: weeks === 1 ? "start" : "starts" });
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Member picks
// ---------------------------------------------------------------------------

/** One member's futures picks for a season, one per market at most. */
export async function getMemberFuturePicks(
  memberId: number,
  seasonId: number,
): Promise<MemberFuturePick[]> {
  const rows = await db
    .select({
      market: bookFuturePicks.market,
      subjectId: bookFuturePicks.subjectId,
      oddsAtPick: bookFuturePicks.oddsAtPick,
    })
    .from(bookFuturePicks)
    .where(
      and(
        eq(bookFuturePicks.memberId, memberId),
        eq(bookFuturePicks.seasonId, seasonId),
      ),
    );

  return rows.map((r) => ({
    market: r.market as FuturesMarket,
    subjectId: r.subjectId,
    oddsAtPick: r.oddsAtPick,
  }));
}

/** One priced futures row, as the server action needs it to book a pick. */
export async function getFutureRow(
  seasonId: number,
  market: FuturesMarket,
  subjectId: string,
) {
  const [row] = await db
    .select()
    .from(bookFutures)
    .where(
      and(
        eq(bookFutures.seasonId, seasonId),
        eq(bookFutures.market, market),
        eq(bookFutures.subjectId, subjectId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Whether a market is closed to new picks.
 *
 * Two ways in, and both are checked, because they close different windows: a
 * stamped lockedAt is the pricing pass's record that the lock week kicked off,
 * and the live week check covers the gap between that kickoff and the next sync
 * run, which is exactly when somebody would try to sneak a pick in.
 */
export async function isFuturesMarketLocked(
  season: FuturesSeason,
  market: FuturesMarket,
): Promise<boolean> {
  const [stamped] = await db
    .select({ id: bookFutures.id })
    .from(bookFutures)
    .where(
      and(
        eq(bookFutures.seasonId, season.seasonId),
        eq(bookFutures.market, market),
        sql`${bookFutures.lockedAt} is not null`,
      ),
    )
    .limit(1);
  if (stamped) return true;

  const kickedOff = await getKickedOffWeeks(season.seasonYear);
  return kickedOff.has(futuresLockWeek(market, season.playoffWeekStart));
}

/** Pick counts per subject for a market, for the league-consensus line. */
export async function getFuturePickCounts(
  seasonId: number,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      market: bookFuturePicks.market,
      subjectId: bookFuturePicks.subjectId,
      count: sql<number>`count(*)`,
    })
    .from(bookFuturePicks)
    .where(eq(bookFuturePicks.seasonId, seasonId))
    .groupBy(bookFuturePicks.market, bookFuturePicks.subjectId);

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(`${row.market}:${row.subjectId}`, Number(row.count));
  }
  return map;
}

// Re-exported so the sync and the action share one name for the reserved id.
export { FIELD_SUBJECT_ID };
