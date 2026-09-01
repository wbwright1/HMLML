import { getDivisionStandings } from "@/lib/queries/divisions";
import {
  getLastCompletedSeason,
  getSeasonStandings,
  getTitleGamePair,
} from "@/lib/queries/seasons";
import { getMatchupsByWeek } from "@/lib/queries/matchups";
import {
  getHeadToHead,
  getHeadToHeadHistory,
  type HeadToHeadGame,
} from "@/lib/queries/records";
import { getWeekStarterPool } from "@/lib/queries/players-to-watch";
import { getWeeklySuperlatives } from "@/lib/queries/superlatives";
import { getWeekBenchLeader } from "@/lib/queries/lineup-efficiency";
import { getWeekStandouts } from "@/lib/queries/week-standouts";
import { getRecentTransactions } from "@/lib/queries/offseason";
import { matchupPairKey } from "@/lib/content";
import {
  selectGameOfTheWeek,
  markTitleRematch,
  type GotwCandidate,
} from "@/lib/hub/between-weeks";
import type { NflSeasonType } from "@/lib/queries/nfl-state";
import { getLeagueLongevity } from "@/lib/queries/franchise-longevity";
import { getRosterProjections } from "@/lib/queries/roster-projections";
import { getOffseasonMoves, type StatsOffseasonMoves } from "@/lib/queries/offseason-moves";
import { getTrades } from "@/lib/queries/trades";

export type { StatsOffseasonMoves } from "@/lib/queries/offseason-moves";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
// A compact, TRUTHFUL snapshot of the league built entirely from local DB
// queries (no Sleeper calls). Both the deterministic template fallback and the
// LLM path read from this — the LLM is only ever handed numbers that are real.

export interface StatsTeam {
  name: string;
  slug: string;
  record: string; // "W-L" or "W-L-T"
  pointsFor: number;
}

export interface StatsDivision {
  name: string;
  /** Teams sorted best-to-worst (as getDivisionStandings returns them). */
  teams: StatsTeam[];
  leader: StatsTeam | null;
}

/** Which side of a matchup a fact belongs to. */
export type StatsMatchupSide = "home" | "away";

export interface StatsLastMeeting {
  seasonYear: number;
  week: number;
  /** Winning side, or null for a tie. */
  winner: StatsMatchupSide | null;
  homePoints: number;
  awayPoints: number;
  isPlayoff: boolean;
}

export interface StatsTopProjected {
  playerName: string;
  position: string | null;
  side: StatsMatchupSide;
  projectedPoints: number;
}

export interface StatsMatchup {
  pairKey: string;
  home: StatsTeam;
  away: StatsTeam;
  /**
   * All-time head-to-head from the home team's perspective. `streak` is the
   * active run in the same orientation ("3-game win streak" means the HOME
   * team has won the last three).
   */
  h2h: {
    wins: number;
    losses: number;
    ties: number;
    streak: string | null;
  } | null;
  /**
   * The most recent COMPLETED meeting between the pair, or null when they
   * have never played. At week 1 this and the two fields below are the only
   * real receipts that exist, since no current-season game has been played.
   */
  lastMeeting: StatsLastMeeting | null;
  /** Season years in which the pair met in a playoff game, newest first. */
  playoffMeetingYears: number[];
  /** True when this matchup is a rematch of last season's title game. */
  isTitleRematch: boolean;
  /** Highest projected starter in this matchup, either side. */
  topProjected: StatsTopProjected | null;
}

export interface StatsScorer {
  franchiseName: string;
  franchiseSlug: string;
  points: number;
}

export interface StatsResult {
  winner: string;
  loser: string;
  margin: number;
}

export interface StatsWeekInBooks {
  week: number;
  highestScorer: StatsScorer | null;
  lowestScorer: StatsScorer | null;
  biggestBlowout: StatsResult | null;
  closestWin: StatsResult | null;
  benchLeader: {
    franchiseName: string;
    pointsLeft: number;
    won: boolean | null;
  } | null;
  playerOfWeek: {
    name: string;
    team: string | null;
    position: string | null;
    points: number;
    franchiseName: string;
  } | null;
  dudStarter: {
    name: string;
    team: string | null;
    position: string | null;
    points: number;
    franchiseName: string;
  } | null;
}

export interface StatsTransaction {
  date: string;
  type: string;
  description: string;
}

export interface StatsFranchiseHistory {
  slug: string;
  allTimeWinPct: number;
  /**
   * 1 = highest all-time win rate in the league; ties share a rank. A
   * model-facing convenience so the prompt can attach an explicit rank to an
   * all-time-win-rate claim. The claim verifier (lib/content-gen/claims.ts)
   * recomputes rank from the franchiseHistory array itself and never trusts
   * this field, so a stale value here can never wave a false claim through.
   */
  allTimeWinPctRank: number;
  championships: number;
  playoffAppearances: number;
  seasonsPlayed: number;
  /** Standings finish for the last three completed seasons, most recent first. */
  lastThreeFinishes: (number | null)[];
  /** Bottom-third finish in ALL of the last N (N >= 2) completed seasons. */
  sustainedDoormat: boolean;
  /** Made the playoffs in ALL of the last N (N >= 2) completed seasons. */
  sustainedContender: boolean;
}

export interface StatsRosterProjection {
  slug: string;
  name: string;
  projectedStartingPoints: number;
  /** 1 = highest projected starting-lineup total in the league. */
  leagueRank: number;
  topProjectedPlayer: { name: string; position: string | null; points: number } | null;
}

/** One side of a recent trade, reduced to what a deterministic verdict needs. */
export interface StatsTradeSide {
  franchiseName: string | null;
  /** Players received by this side (name + position where known). */
  players: { name: string; position: string | null }[];
  /** Count of draft picks received by this side (the draft-capital signal). */
  picks: number;
}

/**
 * A recent completed trade, keyed by its transaction id (the refKey a
 * trade_verdict row carries). Only the assets exchanged are kept, so the
 * verdict copy is derived from real, citable volume/capital, never invented.
 */
export interface StatsTrade {
  id: number;
  seasonYear: number;
  sides: StatsTradeSide[];
}

export interface StatsContext {
  seasonYear: number;
  week: number;
  seasonType: NflSeasonType;
  hasDivisions: boolean;
  divisions: StatsDivision[];
  /** Franchises sorted best-to-worst across the whole league this season. */
  leagueStandings: StatsTeam[];
  lastSeason: {
    year: number;
    champion: StatsTeam | null;
    doormat: StatsTeam | null;
    pointMachine: StatsTeam | null;
  } | null;
  currentMatchups: StatsMatchup[];
  /**
   * The pairKey of the matchup the between-weeks hub will feature as Game of the
   * Week (via selectGameOfTheWeek), so the generated game_of_week_blurb is
   * written about the same matchup the hub renders. Null when there is no slate.
   */
  gameOfWeekPairKey: string | null;
  weekInBooks: StatsWeekInBooks | null;
  recentTransactions: StatsTransaction[];
  /** Multi-season history per franchise. Empty when the DB has too little history, or on query failure. */
  franchiseHistory: StatsFranchiseHistory[];
  /**
   * Upcoming-season roster-strength projections, ranked (league-scored, from
   * the proj_points_ppr column whose name is a legacy misnomer). Empty when the
   * proj_points_ppr column has not been populated yet (migration not applied,
   * or the projection sync step hasn't run) — callers must degrade gracefully.
   */
  rosterProjections: StatsRosterProjection[];
  /** The season the roster projections are for (matches players.proj_season). Null when rosterProjections is empty. */
  projectionSeason: number | null;
  /**
   * Real offseason activity (draft picks, offseason trades) per franchise, so
   * offseason receipts can cite an actual pick/trade instead of leaning on
   * projection-only framing. Populated for "pre"/"off" season types only;
   * empty for "regular"/"post" (and on any query failure).
   */
  offseasonMoves: StatsOffseasonMoves[];
  /**
   * The most recent completed trades league-wide (capped, newest first), for
   * per-trade Site Desk verdicts. Populated for "pre"/"off" season types only;
   * empty for "regular"/"post" (and on any query failure).
   */
  recentTrades: StatsTrade[];
}

export interface StatsContextInput {
  seasonId: number;
  seasonYear: number;
  week: number;
  seasonType: NflSeasonType;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Bound the per-trade verdict work: only the N most recent trades are graded. */
const RECENT_TRADES_CAP = 10;

function fmtRecord(wins: number, losses: number, ties: number): string {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function toStatsTeam(t: {
  name: string;
  slug: string;
  wins: number;
  losses: number;
  ties: number;
  pointsScored: number;
}): StatsTeam {
  return {
    name: t.name,
    slug: t.slug,
    record: fmtRecord(t.wins, t.losses, t.ties),
    pointsFor: Math.round((t.pointsScored ?? 0) * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Builds a StatsContext for a season/week from local DB queries only.
 *
 * A sparse but successful context (e.g. a season with no matchups yet) simply
 * yields fewer content items downstream, which is a real outcome, not an error.
 *
 * Failure propagation is currently mixed, so be precise about it:
 *   - PROPAGATES on a DB failure: getMatchupsByWeek and getSeasonStandings.
 *     Both rethrow via rethrowUnlessTolerable, so this function can throw.
 *   - STILL SWALLOWS to an empty/null result: getDivisionStandings,
 *     getLastCompletedSeason, getRecentTransactions. A DB failure inside any
 *     of those still yields a quietly thinner context rather than an error.
 *
 * Where it does throw, the throw is caught by runGeneration, which logs a
 * sync_log failure row and lets the hourly cron retry, rather than generating
 * hub content from a hollow context. Converting the three remaining swallows is
 * follow-up work, not done here.
 */
export async function buildStatsContext(
  input: StatsContextInput,
): Promise<StatsContext> {
  const { seasonId, seasonYear, week, seasonType } = input;
  const priorWeek = week > 1 ? week - 1 : week;

  const [divisionGroups, currentMatchupRows, lastCompleted, recentTransactions, titlePair] =
    await Promise.all([
      getDivisionStandings(seasonId),
      getMatchupsByWeek(seasonId, week),
      getLastCompletedSeason(),
      getRecentTransactions(seasonId, 6),
      // Only relevant at week 1 (the "HMLML Bowl" rematch override below);
      // skip the query entirely for every other week.
      week === 1 ? getTitleGamePair() : Promise.resolve(null),
    ]);

  const divisions: StatsDivision[] = divisionGroups.map((g) => {
    const teams = g.teams.map(toStatsTeam);
    return {
      name: g.divisionName,
      teams,
      leader: teams[0] ?? null,
    };
  });
  const hasDivisions = divisionGroups.some((g) => g.division != null);

  const leagueStandings = [...divisions.flatMap((d) => d.teams)];

  // Current-week matchups + all-time head-to-head for each pairing, plus the
  // receipts the week-1 angles hang on: the completed meeting history and the
  // week's projected starters. Both extras are best-effort (an empty result
  // just drops a rung off the angle ladder), which is why they are settled
  // separately from the counts rather than allowed to fail the whole context.
  const [h2hResults, historySettled, poolSettled] = await Promise.all([
    Promise.all(
      currentMatchupRows.map((m) =>
        getHeadToHead(m.homeTeam.franchiseId, m.awayTeam.franchiseId),
      ),
    ),
    Promise.allSettled([
      Promise.all(
        currentMatchupRows.map((m) =>
          getHeadToHeadHistory(m.homeTeam.franchiseId, m.awayTeam.franchiseId),
        ),
      ),
    ]).then(([r]) => (r.status === "fulfilled" ? r.value : [])),
    Promise.allSettled([getWeekStarterPool(seasonId, week)]).then(([r]) =>
      r.status === "fulfilled" ? r.value : [],
    ),
  ]);
  const historyResults: HeadToHeadGame[][] = historySettled;

  // Highest projected starter per Sleeper matchupId, from the same pool the
  // hub's Players to Watch rail scores over.
  const topProjectedByMatchup = new Map<
    number,
    { playerName: string; position: string | null; franchiseId: string; projectedPoints: number }
  >();
  for (const row of poolSettled) {
    if (row.matchupId == null || row.name == null) continue;
    const projected = row.projectedPoints ?? 0;
    if (projected <= 0) continue;
    const current = topProjectedByMatchup.get(row.matchupId);
    if (current && current.projectedPoints >= projected) continue;
    topProjectedByMatchup.set(row.matchupId, {
      playerName: row.name,
      position: row.position,
      franchiseId: row.franchiseId,
      projectedPoints: Math.round(projected * 10) / 10,
    });
  }
  // Records + division identity come from the division standings map so the
  // matchup preview shows season records (not the single-game points from the
  // matchup row) and the Game of the Week selection can weigh divisions.
  const standingBy = new Map(
    divisionGroups.flatMap((g) =>
      g.teams.map((t) => [t.franchiseId, t] as const),
    ),
  );
  // Game of the Week: the same selection the between-weeks hub makes, so the
  // generated blurb targets the matchup the hub features. Uses division +
  // records from the standings map (the fields selectGameOfTheWeek weighs),
  // plus franchiseId so markTitleRematch can identify the week-1 rematch.
  const gotwCandidates: GotwCandidate[] = currentMatchupRows.map((m) => {
    const a = standingBy.get(m.homeTeam.franchiseId);
    const b = standingBy.get(m.awayTeam.franchiseId);
    return {
      matchupId: m.matchupId,
      teamA: {
        wins: a?.wins ?? 0,
        losses: a?.losses ?? 0,
        ties: a?.ties ?? 0,
        pointsFor: Number(a?.pointsScored ?? 0),
        division: a?.division ?? null,
        franchiseId: m.homeTeam.franchiseId,
      },
      teamB: {
        wins: b?.wins ?? 0,
        losses: b?.losses ?? 0,
        ties: b?.ties ?? 0,
        pointsFor: Number(b?.pointsScored ?? 0),
        division: b?.division ?? null,
        franchiseId: m.awayTeam.franchiseId,
      },
    };
  });
  const markedGotwCandidates = markTitleRematch(gotwCandidates, titlePair);
  const gotwId = selectGameOfTheWeek(markedGotwCandidates, undefined, week);
  const gotwRow = currentMatchupRows.find((m) => m.matchupId === gotwId);
  const gameOfWeekPairKey = gotwRow
    ? matchupPairKey(gotwRow.homeTeam.franchiseSlug, gotwRow.awayTeam.franchiseSlug)
    : null;

  const currentMatchups: StatsMatchup[] = currentMatchupRows.map((m, i) => {
    const record = (t: {
      wins?: number;
      losses?: number;
      ties?: number;
    }): string => fmtRecord(t.wins ?? 0, t.losses ?? 0, t.ties ?? 0);
    const home = standingBy.get(m.homeTeam.franchiseId);
    const away = standingBy.get(m.awayTeam.franchiseId);
    return {
      pairKey: matchupPairKey(m.homeTeam.franchiseSlug, m.awayTeam.franchiseSlug),
      home: {
        name: m.homeTeam.franchiseName,
        slug: m.homeTeam.franchiseSlug,
        record: home ? record(home) : "0-0",
        pointsFor: home ? Math.round((home.pointsScored ?? 0) * 10) / 10 : 0,
      },
      away: {
        name: m.awayTeam.franchiseName,
        slug: m.awayTeam.franchiseSlug,
        record: away ? record(away) : "0-0",
        pointsFor: away ? Math.round((away.pointsScored ?? 0) * 10) / 10 : 0,
      },
      h2h: {
        wins: h2hResults[i].wins,
        losses: h2hResults[i].losses,
        ties: h2hResults[i].ties,
        streak: h2hResults[i].streak,
      },
      // Only COMPLETED meetings are history. This week's own scheduled row
      // comes back with no winner and 0 points; reporting that as "last time
      // out" would cite a game nobody has played.
      ...(() => {
        const played = (historyResults[i] ?? []).filter(
          (g) => g.winnerFranchiseId != null || g.pointsA > 0 || g.pointsB > 0,
        );
        const latest = played[0] ?? null; // newest first
        return {
          lastMeeting: latest
            ? {
                seasonYear: latest.seasonYear,
                week: latest.week,
                winner:
                  latest.winnerFranchiseId == null
                    ? null
                    : latest.winnerFranchiseId === m.homeTeam.franchiseId
                      ? ("home" as const)
                      : ("away" as const),
                homePoints: latest.pointsA,
                awayPoints: latest.pointsB,
                isPlayoff: latest.isPlayoff,
              }
            : null,
          playoffMeetingYears: played
            .filter((g) => g.isPlayoff)
            .map((g) => g.seasonYear),
        };
      })(),
      isTitleRematch: Boolean(
        markedGotwCandidates.find((c) => c.matchupId === m.matchupId)
          ?.isTitleRematch,
      ),
      topProjected: (() => {
        const top = topProjectedByMatchup.get(m.matchupId);
        if (!top) return null;
        return {
          playerName: top.playerName,
          position: top.position,
          side:
            top.franchiseId === m.homeTeam.franchiseId
              ? ("home" as const)
              : ("away" as const),
          projectedPoints: top.projectedPoints,
        };
      })(),
    };
  });


  // Last completed season superlatives (champion / doormat / point machine).
  let lastSeason: StatsContext["lastSeason"] = null;
  if (lastCompleted) {
    const standings = await getSeasonStandings(lastCompleted.id);
    if (standings.length > 0) {
      const byWins = [...standings].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0));
      const byLosses = [...standings].sort((a, b) => (b.losses ?? 0) - (a.losses ?? 0));
      const byPf = [...standings].sort(
        (a, b) => Number(b.pointsScored ?? 0) - Number(a.pointsScored ?? 0),
      );
      const mk = (s: (typeof standings)[number]): StatsTeam =>
        toStatsTeam({
          name: s.franchiseName,
          slug: s.franchiseSlug,
          wins: s.wins ?? 0,
          losses: s.losses ?? 0,
          ties: s.ties ?? 0,
          pointsScored: Number(s.pointsScored ?? 0),
        });
      lastSeason = {
        year: lastCompleted.seasonYear,
        champion: byWins[0] ? mk(byWins[0]) : null,
        doormat: byLosses[0] ? mk(byLosses[0]) : null,
        pointMachine: byPf[0] ? mk(byPf[0]) : null,
      };
    }
  }

  // Prior week's "in the books" recap (regular season only).
  let weekInBooks: StatsWeekInBooks | null = null;
  if (seasonType === "regular" && week > 1) {
    const [superlatives, benchLeader, standouts] = await Promise.all([
      getWeeklySuperlatives(seasonId, priorWeek),
      getWeekBenchLeader(seasonId, priorWeek),
      getWeekStandouts(seasonId, priorWeek),
    ]);
    weekInBooks = {
      week: priorWeek,
      highestScorer: superlatives.highestScorer
        ? {
            franchiseName: superlatives.highestScorer.franchiseName,
            franchiseSlug: superlatives.highestScorer.franchiseSlug,
            points: Math.round(superlatives.highestScorer.points * 10) / 10,
          }
        : null,
      lowestScorer: superlatives.lowestScorer
        ? {
            franchiseName: superlatives.lowestScorer.franchiseName,
            franchiseSlug: superlatives.lowestScorer.franchiseSlug,
            points: Math.round(superlatives.lowestScorer.points * 10) / 10,
          }
        : null,
      biggestBlowout: superlatives.biggestBlowout
        ? {
            winner: superlatives.biggestBlowout.winner,
            loser: superlatives.biggestBlowout.loser,
            margin: Math.round(superlatives.biggestBlowout.margin * 10) / 10,
          }
        : null,
      closestWin: superlatives.closestWin
        ? {
            winner: superlatives.closestWin.winner,
            loser: superlatives.closestWin.loser,
            margin: Math.round(superlatives.closestWin.margin * 10) / 10,
          }
        : null,
      benchLeader: benchLeader
        ? {
            franchiseName: benchLeader.franchiseName,
            pointsLeft: Math.round(benchLeader.pointsLeft * 10) / 10,
            won: benchLeader.won,
          }
        : null,
      playerOfWeek: standouts.playerOfWeek
        ? {
            name: standouts.playerOfWeek.name,
            team: standouts.playerOfWeek.team,
            position: standouts.playerOfWeek.position,
            points: Math.round(standouts.playerOfWeek.points * 10) / 10,
            franchiseName: standouts.playerOfWeek.franchiseName,
          }
        : null,
      dudStarter: standouts.dudStarter
        ? {
            name: standouts.dudStarter.name,
            team: standouts.dudStarter.team,
            position: standouts.dudStarter.position,
            points: Math.round(standouts.dudStarter.points * 10) / 10,
            franchiseName: standouts.dudStarter.franchiseName,
          }
        : null,
    };
  }

  // Multi-season franchise history + upcoming-season roster projections. Both
  // degrade to an empty array on any failure (including "column does not
  // exist" if this ships before the 0009 migration is applied), so callers
  // never need to special-case a missing DB column.
  const franchiseIds = divisionGroups.flatMap((g) => g.teams.map((t) => t.franchiseId));
  let franchiseHistory: StatsFranchiseHistory[] = [];
  let rosterProjections: StatsRosterProjection[] = [];
  let projectionSeason: number | null = null;
  try {
    const longevity = await getLeagueLongevity(seasonId, franchiseIds);
    franchiseHistory = longevity.map((l) => ({
      slug: l.slug,
      allTimeWinPct: Math.round(l.allTimeWinPct * 1000) / 1000,
      // Placeholder; assigned below once every win pct is known.
      allTimeWinPctRank: 0,
      championships: l.championships,
      playoffAppearances: l.playoffAppearances,
      seasonsPlayed: l.seasonsPlayed,
      lastThreeFinishes: l.lastNFinishes,
      sustainedDoormat: l.sustainedDoormat,
      sustainedContender: l.sustainedContender,
    }));
    // Competition ranking by descending win pct (ties share a rank: 1,2,2,4).
    const byPct = [...franchiseHistory].sort((a, b) => b.allTimeWinPct - a.allTimeWinPct);
    const rankBySlug = new Map<string, number>();
    byPct.forEach((f, i) => {
      const prior = i > 0 ? byPct[i - 1] : null;
      const rank = prior && prior.allTimeWinPct === f.allTimeWinPct ? rankBySlug.get(prior.slug)! : i + 1;
      rankBySlug.set(f.slug, rank);
    });
    for (const f of franchiseHistory) {
      f.allTimeWinPctRank = rankBySlug.get(f.slug) ?? 0;
    }
  } catch (e) {
    console.error("[stats-context] franchise longevity unavailable:", e);
  }
  try {
    // seasonYear is the projection target: getRosterProjections only counts
    // players whose stored proj_season matches it, so a stale prior-year
    // projection (a player dropped from this year's feed) never leaks into
    // this year's rankings. projectionSeason = seasonYear stays exact.
    const projections = await getRosterProjections(seasonId, seasonYear);
    rosterProjections = projections.map((p) => ({
      slug: p.slug,
      name: p.name,
      projectedStartingPoints: Math.round(p.projectedStartingPoints * 10) / 10,
      leagueRank: p.leagueRank,
      topProjectedPlayer: p.topProjectedPlayer,
    }));
    if (rosterProjections.length > 0) {
      projectionSeason = seasonYear;
    }
  } catch (e) {
    console.error("[stats-context] roster projections unavailable:", e);
  }

  // Real offseason activity (draft order, offseason trades), only relevant to
  // preseason/offseason hub content. Same degrade-to-empty pattern as above.
  let offseasonMoves: StatsOffseasonMoves[] = [];
  let recentTrades: StatsTrade[] = [];
  if (seasonType === "pre" || seasonType === "off") {
    try {
      offseasonMoves = await getOffseasonMoves(seasonId, seasonYear);
    } catch (e) {
      console.error("[stats-context] offseason moves unavailable:", e);
    }
    try {
      // League-wide, newest first, capped: verdicts are graded on the most
      // recent deals only. getTrades already degrades to [] on failure.
      const trades = await getTrades();
      recentTrades = trades.slice(0, RECENT_TRADES_CAP).map((t) => ({
        id: t.id,
        seasonYear: t.seasonYear,
        sides: t.sides.map((s) => ({
          franchiseName: s.franchise?.name ?? null,
          players: s.players.map((p) => ({ name: p.name, position: p.position })),
          picks: s.picks.filter((p) => !p.voided).length,
        })),
      }));
    } catch (e) {
      console.error("[stats-context] recent trades unavailable:", e);
    }
  }

  return {
    seasonYear,
    week,
    seasonType,
    hasDivisions,
    divisions,
    leagueStandings,
    lastSeason,
    currentMatchups,
    gameOfWeekPairKey,
    weekInBooks,
    recentTransactions,
    franchiseHistory,
    rosterProjections,
    projectionSeason,
    offseasonMoves,
    recentTrades,
  };
}
