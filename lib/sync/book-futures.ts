import { db } from "@/lib/db";
import { bookFutures, seasons, type NewBookFuture } from "@/lib/db/schema";
import { and, eq, inArray, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import { runAtomic } from "@/lib/db/atomic";
import {
  FIELD_SUBJECT_ID,
  FUTURES_MARKET_IDS,
  awardsAreGradable,
  buildPlayerMarket,
  buildTeamMarket,
  candidateCountFor,
  candidateScore,
  futureResult,
  futuresLockWeek,
  retainedSubjects,
  simulateTeamMarkets,
  topScorer,
  type FuturesCandidate,
  type FuturesMarket,
  type FuturesRow,
} from "@/lib/book/futures";
import {
  FUTURES_PLAYOFF_SPOTS,
  getAwardScorers,
  getCompletedWeekCount,
  getFuturesPricingInputs,
  getKickedOffWeeks,
  getPickedSubjectsByMarket,
  getStampedMarkets,
  type FuturesSeason,
  type PlayerCandidateRow,
} from "@/lib/queries/book-futures";

/** Every market the futures book runs, in board order, from the registry. */
const ALL_MARKETS: FuturesMarket[] = FUTURES_MARKET_IDS;

export interface FuturesRepriceResult {
  /** book_futures rows written this run. */
  rowCount: number;
  /** Markets re-priced. */
  priced: number;
  /** Markets whose lock week kicked off, stamped closed by this run. */
  lockedNow: number;
  /** Markets already closed, left exactly as they were. */
  alreadyLocked: number;
}

/**
 * Prices (and re-prices) all four season-long markets.
 *
 * Runs from the daily sync. Everything here is derived from data already in
 * Postgres (standings, remaining schedule, projections, started points), so the
 * pass makes no Sleeper calls of its own and the page it feeds stays a pure
 * cache read.
 *
 * A market is touched only while it is open. Once its lock week has really
 * kicked off (NFL game status, never a clock) the rows are stamped lockedAt and
 * never priced again: the number people bet into is history at that point, and
 * repricing it would rewrite the board somebody read before committing.
 */
export async function repriceFutures(
  season: FuturesSeason,
  week: number,
): Promise<FuturesRepriceResult> {
  const [kickedOff, stamped] = await Promise.all([
    getKickedOffWeeks(season.seasonYear),
    getStampedMarkets(season.seasonId),
  ]);

  const open: FuturesMarket[] = [];
  const closing: FuturesMarket[] = [];
  for (const market of ALL_MARKETS) {
    if (stamped.has(market)) continue;
    if (kickedOff.has(futuresLockWeek(market, season.playoffWeekStart))) {
      closing.push(market);
      continue;
    }
    open.push(market);
  }

  // Closing markets are stamped where they stand. Deliberately no final
  // reprice: the last honest price is the one that was posted while somebody
  // could still act on it.
  if (closing.length > 0) {
    await db
      .update(bookFutures)
      .set({ lockedAt: new Date() })
      .where(
        and(
          eq(bookFutures.seasonId, season.seasonId),
          inArray(bookFutures.market, closing),
          isNull(bookFutures.lockedAt),
        ),
      );
  }

  const result: FuturesRepriceResult = {
    rowCount: 0,
    priced: 0,
    lockedNow: closing.length,
    alreadyLocked: stamped.size,
  };

  if (open.length === 0) return result;

  const inputs = await getFuturesPricingInputs(season, week);
  const pickedByMarket = await getPickedSubjectsByMarket(season.seasonId);
  const pricedAt = new Date();

  const rowsByMarket = new Map<FuturesMarket, NewBookFuture[]>();

  const wantsTeamMarket =
    open.includes("champion") || open.includes("toilet_bowl");

  if (wantsTeamMarket && inputs.teams.length > 0) {
    // Both team markets come out of ONE simulation on purpose (see
    // simulateTeamMarkets): they are the two ends of the same distribution.
    const sim = simulateTeamMarkets(inputs.teams, inputs.remainingGames, {
      playoffSpots: FUTURES_PLAYOFF_SPOTS,
    });
    const franchiseByRoster = new Map(
      inputs.teams.map((t) => [t.rosterId, t.franchiseId]),
    );
    const teamById = new Map(inputs.teams.map((t) => [t.franchiseId, t]));
    const playoffByFranchise = new Map<string, number>();
    for (const [rosterId, prob] of sim.playoffs) {
      const franchiseId = franchiseByRoster.get(rosterId);
      if (franchiseId) playoffByFranchise.set(franchiseId, prob);
    }

    for (const market of ["champion", "toilet_bowl"] as const) {
      if (!open.includes(market)) continue;
      const probs = market === "champion" ? sim.champion : sim.toiletBowl;
      const rows = buildTeamMarket(probs, franchiseByRoster).map((row) =>
        toFutureRow(season.seasonId, market, row, pricedAt, {
          record: recordOf(teamById.get(row.subjectId)),
          playoffProb: playoffByFranchise.get(row.subjectId),
        }),
      );
      rowsByMarket.set(market, rows);
    }
  }

  for (const market of ["mvp", "roty"] as const) {
    if (!open.includes(market)) continue;
    const pool = inputs.candidates.filter((c) =>
      market === "roty" ? c.isRookie : true,
    );
    if (pool.length === 0) continue;

    const candidates: FuturesCandidate[] = pool.map((c) => ({
      playerId: c.playerId,
      score: candidateScore({
        bankedPoints: c.bankedPoints,
        projectedPerWeek: c.projectedPerWeek,
        weeksRemaining: inputs.weeksRemaining,
        startShare: c.startShare,
        lineupProjectedPerWeek: c.lineupProjectedPerWeek,
        bestAlternativePerWeek: c.bestAlternativePerWeek,
      }),
    }));
    const byId = new Map<string, PlayerCandidateRow>(
      pool.map((c) => [c.playerId, c]),
    );

    const rows = buildPlayerMarket(
      candidates,
      candidateCountFor(market),
      undefined,
      pickedByMarket.get(market) ?? [],
    ).map((row) => {
      const candidate = byId.get(row.subjectId);
      return toFutureRow(
        season.seasonId,
        market,
        row,
        pricedAt,
        row.subjectType === "field"
          ? null
          : {
              bankedPoints: candidate?.bankedPoints ?? 0,
              weeksStarted: candidate?.weeksStarted ?? 0,
              lineupShare:
                candidate && candidate.lineupProjectedPerWeek > 0
                  ? candidate.projectedPerWeek / candidate.lineupProjectedPerWeek
                  : 0,
            },
      );
    });
    rowsByMarket.set(market, rows);
  }

  for (const [market, rows] of rowsByMarket) {
    if (rows.length === 0) continue;

    // What survives this reprice: everything priced today, plus every subject
    // somebody is holding a ticket on.
    //
    // The second half is the load-bearing one. A pick's result is written onto
    // its book_futures row, and the board is where the member reads it back, so
    // deleting a row somebody bet on leaves them with a ticket that can never
    // be settled, shown, or even cleared (the action refuses a subject with no
    // priced row). keepIds covers the case where the player is still in the
    // candidate pool; this covers the ones it cannot reach, like a player who
    // left the league entirely, or The Field on a market that has shrunk to
    // nothing unlisted. Those rows keep their last posted price, which is the
    // number the ticket was taken at anyway.
    const keepSubjects = retainedSubjects(
      rows.map((r) => r.subjectId),
      pickedByMarket.get(market) ?? [],
    );

    // Delete-then-upsert per market, in one transaction (runAtomic leads with
    // the delete so it can never commit alone). Deleting is what keeps
    // yesterday's candidates off today's board: a player who fell out of the
    // top ten writes no row to overwrite his own.
    await runAtomic((executor) => [
      executor
        .delete(bookFutures)
        .where(
          and(
            eq(bookFutures.seasonId, season.seasonId),
            eq(bookFutures.market, market),
            notInArray(bookFutures.subjectId, keepSubjects),
          ),
        ),
      executor
        .insert(bookFutures)
        .values(rows)
        .onConflictDoUpdate({
          target: [
            bookFutures.seasonId,
            bookFutures.market,
            bookFutures.subjectId,
          ],
          set: {
            subjectType: sql`excluded.subject_type`,
            prob: sql`excluded.prob`,
            odds: sql`excluded.odds`,
            detail: sql`excluded.detail`,
            pricedAt: sql`excluded.priced_at`,
          },
        }),
    ]);
    result.rowCount += rows.length;
    result.priced += 1;
  }

  return result;
}

interface FuturesDetail {
  record?: string;
  playoffProb?: number;
  bankedPoints?: number;
  weeksStarted?: number;
  /** This player's raw share of his franchise's projected lineup, as a fraction. */
  lineupShare?: number;
}

function toFutureRow(
  seasonId: number,
  market: FuturesMarket,
  row: FuturesRow,
  pricedAt: Date,
  detail: FuturesDetail | null,
): NewBookFuture {
  return {
    seasonId,
    market,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    prob: row.prob,
    odds: row.odds,
    detail: detail ?? null,
    pricedAt,
  };
}

/** "9-3", or "9-3-1" when the season has actually produced a tie. */
function recordOf(
  team: { wins: number; losses: number; ties: number } | undefined,
): string | undefined {
  if (!team) return undefined;
  const base = `${team.wins}-${team.losses}`;
  return team.ties > 0 ? `${base}-${team.ties}` : base;
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

export interface FuturesGradeResult {
  /** Rows stamped with a result this run. */
  rowCount: number;
  /** Markets graded. */
  markets: number;
  /** Markets left ungraded because their outcome is not known yet. */
  pending: number;
}

/**
 * Settles the season's futures once the outcomes are real.
 *
 * Mechanical, and it never infers a result from scores: the champion and the
 * Toilet Bowl are read verbatim from the season row that the playoff derivation
 * already wrote (seasons.champion_franchise_id and
 * seasons.toilet_bowl_franchise_id, the latter being the team that ADVANCED out
 * of the inverted consolation bracket, meaning it lost its way to last), and
 * the two player awards come from the started-points table using exactly the
 * metric printed on the card.
 *
 * A market whose outcome is still unknown is left alone rather than graded as a
 * board full of losses. Already-graded rows are never re-graded.
 */
export async function gradeFutures(
  season: FuturesSeason,
): Promise<FuturesGradeResult> {
  const result: FuturesGradeResult = { rowCount: 0, markets: 0, pending: 0 };

  const [seasonRow] = await db
    .select({
      champion: seasons.championFranchiseId,
      toiletBowl: seasons.toiletBowlFranchiseId,
    })
    .from(seasons)
    .where(eq(seasons.id, season.seasonId))
    .limit(1);
  if (!seasonRow) return result;

  const ungraded = await db
    .select({
      id: bookFutures.id,
      market: bookFutures.market,
      subjectId: bookFutures.subjectId,
    })
    .from(bookFutures)
    .where(
      and(
        eq(bookFutures.seasonId, season.seasonId),
        isNull(bookFutures.gradedResult),
      ),
    );
  if (ungraded.length === 0) return result;

  const marketsPresent = new Set(ungraded.map((r) => r.market));
  const needsAwards = marketsPresent.has("mvp") || marketsPresent.has("roty");

  // The player awards are "most points started ACROSS THE REGULAR SEASON", so
  // they cannot be settled until the regular season has actually been played.
  // Without this gate the first sync after week 1 would grade both boards on
  // the week 1 leader and stamp them closed: topScorer answers with whoever is
  // ahead and only returns null on an empty table, so a half-played season
  // grades exactly like a finished one. Graded is permanent, and a graded
  // market is closed, so that mistake ends the market in week 2. Team markets
  // need no equivalent gate: the season row has no champion until there is one.
  const completedWeeks = needsAwards ? await getCompletedWeekCount(season) : 0;
  const gradeAwards =
    needsAwards && awardsAreGradable(completedWeeks, season.finalRegularWeek);
  const scorers = gradeAwards ? await getAwardScorers(season) : [];

  const winners: Partial<Record<FuturesMarket, string | null>> = {
    champion: seasonRow.champion,
    toilet_bowl: seasonRow.toiletBowl,
    mvp: gradeAwards ? topScorer(scorers) : null,
    roty: gradeAwards ? topScorer(scorers.filter((s) => s.isRookie)) : null,
  };

  const gradedAt = new Date();

  for (const market of ALL_MARKETS) {
    const rows = ungraded.filter((r) => r.market === market);
    if (rows.length === 0) continue;

    const winner = winners[market] ?? null;
    if (winner == null) {
      result.pending += 1;
      continue;
    }

    // The Field is graded against what this board LISTED, so the ids come from
    // the rows themselves rather than from anything recomputed today.
    const listedIds = rows
      .map((r) => r.subjectId)
      .filter((id) => id !== FIELD_SUBJECT_ID);

    const won: number[] = [];
    const lost: number[] = [];
    for (const row of rows) {
      const graded = futureResult(row, winner, listedIds);
      (graded === "win" ? won : lost).push(row.id);
    }

    if (won.length > 0) {
      await db
        .update(bookFutures)
        .set({ gradedResult: "win", gradedAt })
        .where(inArray(bookFutures.id, won));
    }
    if (lost.length > 0) {
      await db
        .update(bookFutures)
        .set({ gradedResult: "loss", gradedAt })
        .where(inArray(bookFutures.id, lost));
    }

    result.rowCount += rows.length;
    result.markets += 1;
  }

  // A graded market is closed by definition, even if the pass that should have
  // stamped it never ran (a season imported after the fact, say).
  await db
    .update(bookFutures)
    .set({ lockedAt: gradedAt })
    .where(
      and(
        eq(bookFutures.seasonId, season.seasonId),
        isNotNull(bookFutures.gradedResult),
        isNull(bookFutures.lockedAt),
      ),
    );

  return result;
}
