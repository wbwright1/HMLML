import { db } from "@/lib/db";
import {
  franchises,
  franchiseSeasons,
  matchups,
  seasons,
} from "@/lib/db/schema";
import { eq, and, desc, sql, sum, count } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeaderboardEntry {
  id: string;
  slug: string;
  name: string;
  abbreviation?: string;
  brandingColor?: string;
  wins: number;
  losses: number;
  ties: number;
  pointsScored: number;
  pointsAgainst: number;
  championships: number;
  winPct: number;
  seasonsPlayed: number;
}

export interface CareerStats {
  id: string;
  slug: string;
  name: string;
  abbreviation?: string;
  brandingColor?: string;
  wins: number;
  losses: number;
  ties: number;
  pointsScored: number;
  pointsAgainst: number;
  championships: number;
  winPct: number;
  seasonsPlayed: number;
  bestFinish: number | null;
  playoffAppearances: number;
  seasonHistory: {
    seasonYear: number;
    wins: number;
    losses: number;
    ties: number;
    pointsScored: number;
    pointsAgainst: number;
    standingsFinish: number | null;
    playoffResult: string | null;
  }[];
}

export interface HeadToHeadRecord {
  wins: number;
  losses: number;
  ties: number;
  streak: string | null;
}

export interface HeadToHeadGame {
  seasonYear: number;
  week: number;
  pointsA: number;
  pointsB: number;
  winnerFranchiseId: string | null;
  isPlayoff: boolean;
}

export interface RivalrySummary {
  franchiseA: {
    id: string;
    slug: string;
    name: string;
    abbreviation?: string;
    brandingColor?: string;
  };
  franchiseB: {
    id: string;
    slug: string;
    name: string;
    abbreviation?: string;
    brandingColor?: string;
  };
  record: HeadToHeadRecord;
  totalGames: number;
}

export interface PowerRankingEntry {
  rank: number;
  id: string;
  slug: string;
  name: string;
  abbreviation?: string;
  brandingColor?: string;
  wins: number;
  losses: number;
  ties: number;
  pointsScored: number;
  pointsAgainst: number;
  championships: number;
}

export interface TrophyEntry {
  seasonYear: number;
  championFranchiseId: string | null;
  championName: string | null;
  championSlug: string | null;
  championAbbreviation: string | null;
  championBrandingColor: string | null;
  runnerUpName: string | null;
  runnerUpSlug: string | null;
}

// ---------------------------------------------------------------------------
// 4.2 — Leaderboard
// ---------------------------------------------------------------------------

export async function getLeaderboard(
  seasonYear?: number
): Promise<LeaderboardEntry[]> {
  try {
    if (seasonYear) {
      // Season-specific leaderboard
      const rows = await db
        .select({
          id: franchises.id,
          slug: franchises.slug,
          name: franchises.name,
          abbreviation: franchises.abbreviation,
          brandingColor: franchises.brandingColor,
          wins: franchiseSeasons.wins,
          losses: franchiseSeasons.losses,
          ties: franchiseSeasons.ties,
          pointsScored: franchiseSeasons.pointsScored,
          pointsAgainst: franchiseSeasons.pointsAgainst,
          playoffResult: franchiseSeasons.playoffResult,
        })
        .from(franchiseSeasons)
        .innerJoin(franchises, eq(franchiseSeasons.franchiseId, franchises.id))
        .innerJoin(seasons, eq(franchiseSeasons.seasonId, seasons.id))
        .where(eq(seasons.seasonYear, seasonYear))
        .orderBy(desc(franchiseSeasons.wins));

      return rows.map((r) => {
        const w = r.wins ?? 0;
        const l = r.losses ?? 0;
        const t = r.ties ?? 0;
        const total = w + l + t;
        return {
          id: r.id,
          slug: r.slug,
          name: r.name,
          abbreviation: r.abbreviation ?? undefined,
          brandingColor: r.brandingColor ?? undefined,
          wins: w,
          losses: l,
          ties: t,
          pointsScored: Number(r.pointsScored ?? 0),
          pointsAgainst: Number(r.pointsAgainst ?? 0),
          championships: r.playoffResult === "champion" ? 1 : 0,
          winPct: total > 0 ? w / total : 0,
          seasonsPlayed: 1,
        };
      });
    }

    // All-time leaderboard
    const rows = await db
      .select({
        id: franchises.id,
        slug: franchises.slug,
        name: franchises.name,
        abbreviation: franchises.abbreviation,
        brandingColor: franchises.brandingColor,
        totalWins: sum(franchiseSeasons.wins),
        totalLosses: sum(franchiseSeasons.losses),
        totalTies: sum(franchiseSeasons.ties),
        totalPointsScored: sum(franchiseSeasons.pointsScored),
        totalPointsAgainst: sum(franchiseSeasons.pointsAgainst),
        championships: count(
          sql`CASE WHEN ${franchiseSeasons.playoffResult} = 'champion' THEN 1 END`
        ),
        seasonsPlayed: count(franchiseSeasons.id),
      })
      .from(franchises)
      .leftJoin(
        franchiseSeasons,
        eq(franchises.id, franchiseSeasons.franchiseId)
      )
      .groupBy(franchises.id)
      .orderBy(sql`COALESCE(SUM(${franchiseSeasons.wins}), 0) DESC`);

    return rows.map((r) => {
      const w = Number(r.totalWins ?? 0);
      const l = Number(r.totalLosses ?? 0);
      const t = Number(r.totalTies ?? 0);
      const total = w + l + t;
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        abbreviation: r.abbreviation ?? undefined,
        brandingColor: r.brandingColor ?? undefined,
        wins: w,
        losses: l,
        ties: t,
        pointsScored: Number(r.totalPointsScored ?? 0),
        pointsAgainst: Number(r.totalPointsAgainst ?? 0),
        championships: r.championships,
        winPct: total > 0 ? w / total : 0,
        seasonsPlayed: r.seasonsPlayed,
      };
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 4.2a — All Season Leaderboards (batch, single query)
// ---------------------------------------------------------------------------

/**
 * Fetches leaderboard data for ALL seasons in a single query,
 * grouped by season year. Replaces N separate getLeaderboard(year) calls.
 */
export async function getAllSeasonLeaderboards(): Promise<
  Record<string, LeaderboardEntry[]>
> {
  try {
    const rows = await db
      .select({
        seasonYear: seasons.seasonYear,
        id: franchises.id,
        slug: franchises.slug,
        name: franchises.name,
        abbreviation: franchises.abbreviation,
        brandingColor: franchises.brandingColor,
        wins: franchiseSeasons.wins,
        losses: franchiseSeasons.losses,
        ties: franchiseSeasons.ties,
        pointsScored: franchiseSeasons.pointsScored,
        pointsAgainst: franchiseSeasons.pointsAgainst,
        playoffResult: franchiseSeasons.playoffResult,
      })
      .from(franchiseSeasons)
      .innerJoin(franchises, eq(franchiseSeasons.franchiseId, franchises.id))
      .innerJoin(seasons, eq(franchiseSeasons.seasonId, seasons.id))
      .orderBy(seasons.seasonYear, desc(franchiseSeasons.wins));

    const result: Record<string, LeaderboardEntry[]> = {};

    for (const r of rows) {
      const yearKey = String(r.seasonYear);
      if (!result[yearKey]) result[yearKey] = [];

      const w = r.wins ?? 0;
      const l = r.losses ?? 0;
      const t = r.ties ?? 0;
      const total = w + l + t;

      result[yearKey].push({
        id: r.id,
        slug: r.slug,
        name: r.name,
        abbreviation: r.abbreviation ?? undefined,
        brandingColor: r.brandingColor ?? undefined,
        wins: w,
        losses: l,
        ties: t,
        pointsScored: Number(r.pointsScored ?? 0),
        pointsAgainst: Number(r.pointsAgainst ?? 0),
        championships: r.playoffResult === "champion" ? 1 : 0,
        winPct: total > 0 ? w / total : 0,
        seasonsPlayed: 1,
      });
    }

    return result;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// 4.2 — Career Stats
// ---------------------------------------------------------------------------

export async function getCareerStats(
  franchiseId: string
): Promise<CareerStats | null> {
  try {
    const [franchise] = await db
      .select()
      .from(franchises)
      .where(eq(franchises.id, franchiseId))
      .limit(1);

    if (!franchise) return null;

    const seasonRows = await db
      .select({
        seasonYear: seasons.seasonYear,
        wins: franchiseSeasons.wins,
        losses: franchiseSeasons.losses,
        ties: franchiseSeasons.ties,
        pointsScored: franchiseSeasons.pointsScored,
        pointsAgainst: franchiseSeasons.pointsAgainst,
        standingsFinish: franchiseSeasons.standingsFinish,
        playoffResult: franchiseSeasons.playoffResult,
      })
      .from(franchiseSeasons)
      .innerJoin(seasons, eq(franchiseSeasons.seasonId, seasons.id))
      .where(eq(franchiseSeasons.franchiseId, franchiseId))
      .orderBy(desc(seasons.seasonYear));

    let totalWins = 0;
    let totalLosses = 0;
    let totalTies = 0;
    let totalPointsScored = 0;
    let totalPointsAgainst = 0;
    let championships = 0;
    let playoffAppearances = 0;
    let bestFinish: number | null = null;

    const seasonHistory = seasonRows.map((s) => {
      const w = s.wins ?? 0;
      const l = s.losses ?? 0;
      const t = s.ties ?? 0;
      const ps = Number(s.pointsScored ?? 0);
      const pa = Number(s.pointsAgainst ?? 0);

      totalWins += w;
      totalLosses += l;
      totalTies += t;
      totalPointsScored += ps;
      totalPointsAgainst += pa;

      if (s.playoffResult === "champion") championships++;
      if (s.playoffResult) playoffAppearances++;
      if (
        s.standingsFinish !== null &&
        (bestFinish === null || s.standingsFinish < bestFinish)
      ) {
        bestFinish = s.standingsFinish;
      }

      return {
        seasonYear: s.seasonYear,
        wins: w,
        losses: l,
        ties: t,
        pointsScored: ps,
        pointsAgainst: pa,
        standingsFinish: s.standingsFinish,
        playoffResult: s.playoffResult,
      };
    });

    const totalGames = totalWins + totalLosses + totalTies;

    return {
      id: franchise.id,
      slug: franchise.slug,
      name: franchise.name,
      abbreviation: franchise.abbreviation ?? undefined,
      brandingColor: franchise.brandingColor ?? undefined,
      wins: totalWins,
      losses: totalLosses,
      ties: totalTies,
      pointsScored: totalPointsScored,
      pointsAgainst: totalPointsAgainst,
      championships,
      winPct: totalGames > 0 ? totalWins / totalGames : 0,
      seasonsPlayed: seasonRows.length,
      bestFinish,
      playoffAppearances,
      seasonHistory,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 4.4 — Head-to-Head
// ---------------------------------------------------------------------------

export async function getHeadToHead(
  franchiseIdA: string,
  franchiseIdB: string
): Promise<HeadToHeadRecord> {
  try {
    // Find matchups where both franchises share the same matchup_id in the same season/week
    const games = await db
      .select({
        seasonId: sql<number>`a.season_id`,
        week: sql<number>`a.week`,
        pointsA: sql<number>`a.points`,
        pointsB: sql<number>`b.points`,
        isWinnerA: sql<boolean>`a.is_winner`,
        isWinnerB: sql<boolean>`b.is_winner`,
        isPlayoff: sql<boolean>`a.is_playoff`,
      })
      .from(
        sql`${matchups} a INNER JOIN ${matchups} b ON a.season_id = b.season_id AND a.week = b.week AND a.matchup_id = b.matchup_id AND a.franchise_id != b.franchise_id`
      )
      .where(
        sql`a.franchise_id = ${franchiseIdA} AND b.franchise_id = ${franchiseIdB}`
      );

    let wins = 0;
    let losses = 0;
    let ties = 0;

    // Track streak
    let currentStreakTeam: string | null = null;
    let currentStreakCount = 0;

    // Sort by season/week for streak calculation
    const sorted = [...games].sort((a, b) => {
      if (a.seasonId !== b.seasonId) return a.seasonId - b.seasonId;
      return a.week - b.week;
    });

    for (const game of sorted) {
      if (game.isWinnerA) {
        wins++;
        if (currentStreakTeam === "A") {
          currentStreakCount++;
        } else {
          currentStreakTeam = "A";
          currentStreakCount = 1;
        }
      } else if (game.isWinnerB) {
        losses++;
        if (currentStreakTeam === "B") {
          currentStreakCount++;
        } else {
          currentStreakTeam = "B";
          currentStreakCount = 1;
        }
      } else {
        ties++;
        currentStreakTeam = null;
        currentStreakCount = 0;
      }
    }

    let streak: string | null = null;
    if (currentStreakCount > 1 && currentStreakTeam) {
      streak = `${currentStreakCount}-game win streak`;
    }

    return { wins, losses, ties, streak };
  } catch {
    return { wins: 0, losses: 0, ties: 0, streak: null };
  }
}

export async function getHeadToHeadHistory(
  franchiseIdA: string,
  franchiseIdB: string
): Promise<HeadToHeadGame[]> {
  try {
    const games = await db
      .select({
        seasonId: sql<number>`a.season_id`,
        seasonYear: seasons.seasonYear,
        week: sql<number>`a.week`,
        pointsA: sql<number>`a.points`,
        pointsB: sql<number>`b.points`,
        isWinnerA: sql<boolean>`a.is_winner`,
        isWinnerB: sql<boolean>`b.is_winner`,
        isPlayoff: sql<boolean>`a.is_playoff`,
      })
      .from(
        sql`${matchups} a INNER JOIN ${matchups} b ON a.season_id = b.season_id AND a.week = b.week AND a.matchup_id = b.matchup_id AND a.franchise_id != b.franchise_id`
      )
      .innerJoin(seasons, eq(seasons.id, sql`a.season_id`))
      .where(
        sql`a.franchise_id = ${franchiseIdA} AND b.franchise_id = ${franchiseIdB}`
      )
      .orderBy(desc(seasons.seasonYear), desc(sql`a.week`));

    return games.map((g) => ({
      seasonYear: g.seasonYear,
      week: g.week,
      pointsA: Number(g.pointsA ?? 0),
      pointsB: Number(g.pointsB ?? 0),
      winnerFranchiseId: g.isWinnerA
        ? franchiseIdA
        : g.isWinnerB
          ? franchiseIdB
          : null,
      isPlayoff: Boolean(g.isPlayoff),
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 4.5 — Rivalries
// ---------------------------------------------------------------------------

export async function getRivalries(): Promise<RivalrySummary[]> {
  try {
    // Get all franchises
    const allFranchises = await db
      .select({
        id: franchises.id,
        slug: franchises.slug,
        name: franchises.name,
        abbreviation: franchises.abbreviation,
        brandingColor: franchises.brandingColor,
      })
      .from(franchises)
      .orderBy(franchises.name);

    if (allFranchises.length < 2) return [];

    // Get all matchup pairings in one query
    const pairings = await db
      .select({
        franchiseIdA: sql<string>`a.franchise_id`,
        franchiseIdB: sql<string>`b.franchise_id`,
        isWinnerA: sql<boolean>`a.is_winner`,
        isWinnerB: sql<boolean>`b.is_winner`,
        seasonId: sql<number>`a.season_id`,
        week: sql<number>`a.week`,
      })
      .from(
        sql`${matchups} a INNER JOIN ${matchups} b ON a.season_id = b.season_id AND a.week = b.week AND a.matchup_id = b.matchup_id AND a.franchise_id < b.franchise_id`
      );

    // Aggregate pairwise records
    const pairMap = new Map<
      string,
      {
        wins: number;
        losses: number;
        ties: number;
        games: { winnerId: string | null; seasonId: number; week: number }[];
      }
    >();

    for (const p of pairings) {
      const key = `${p.franchiseIdA}|${p.franchiseIdB}`;
      if (!pairMap.has(key)) {
        pairMap.set(key, { wins: 0, losses: 0, ties: 0, games: [] });
      }
      const entry = pairMap.get(key)!;

      if (p.isWinnerA) {
        entry.wins++;
        entry.games.push({
          winnerId: p.franchiseIdA,
          seasonId: p.seasonId,
          week: p.week,
        });
      } else if (p.isWinnerB) {
        entry.losses++;
        entry.games.push({
          winnerId: p.franchiseIdB,
          seasonId: p.seasonId,
          week: p.week,
        });
      } else {
        entry.ties++;
        entry.games.push({
          winnerId: null,
          seasonId: p.seasonId,
          week: p.week,
        });
      }
    }

    // Build franchise lookup
    const franchiseLookup = new Map(allFranchises.map((f) => [f.id, f]));

    // Convert to rivalry summaries
    const rivalries: RivalrySummary[] = [];

    for (const [key, data] of pairMap.entries()) {
      const [idA, idB] = key.split("|");
      const fA = franchiseLookup.get(idA);
      const fB = franchiseLookup.get(idB);
      if (!fA || !fB) continue;

      const totalGames = data.wins + data.losses + data.ties;
      if (totalGames === 0) continue;

      // Calculate streak
      const sorted = [...data.games].sort((a, b) => {
        if (a.seasonId !== b.seasonId) return a.seasonId - b.seasonId;
        return a.week - b.week;
      });

      let currentStreakTeam: string | null = null;
      let currentStreakCount = 0;

      for (const game of sorted) {
        if (game.winnerId) {
          if (currentStreakTeam === game.winnerId) {
            currentStreakCount++;
          } else {
            currentStreakTeam = game.winnerId;
            currentStreakCount = 1;
          }
        } else {
          currentStreakTeam = null;
          currentStreakCount = 0;
        }
      }

      let streak: string | null = null;
      if (currentStreakCount > 1 && currentStreakTeam) {
        streak = `${currentStreakCount}-game win streak`;
      }

      rivalries.push({
        franchiseA: {
          id: fA.id,
          slug: fA.slug,
          name: fA.name,
          abbreviation: fA.abbreviation ?? undefined,
          brandingColor: fA.brandingColor ?? undefined,
        },
        franchiseB: {
          id: fB.id,
          slug: fB.slug,
          name: fB.name,
          abbreviation: fB.abbreviation ?? undefined,
          brandingColor: fB.brandingColor ?? undefined,
        },
        record: {
          wins: data.wins,
          losses: data.losses,
          ties: data.ties,
          streak,
        },
        totalGames,
      });
    }

    // Sort by most games played, then closest record
    rivalries.sort((a, b) => {
      // Most games first
      if (b.totalGames !== a.totalGames) return b.totalGames - a.totalGames;
      // Then closest records
      const diffA = Math.abs(a.record.wins - a.record.losses);
      const diffB = Math.abs(b.record.wins - b.record.losses);
      return diffA - diffB;
    });

    return rivalries;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 4.6 — Power Rankings
// ---------------------------------------------------------------------------

export async function getPowerRankings(): Promise<PowerRankingEntry[]> {
  try {
    // Find the current/latest season
    const [latestSeason] = await db
      .select()
      .from(seasons)
      .orderBy(desc(seasons.seasonYear))
      .limit(1);

    if (!latestSeason) return [];

    const rows = await db
      .select({
        id: franchises.id,
        slug: franchises.slug,
        name: franchises.name,
        abbreviation: franchises.abbreviation,
        brandingColor: franchises.brandingColor,
        wins: franchiseSeasons.wins,
        losses: franchiseSeasons.losses,
        ties: franchiseSeasons.ties,
        pointsScored: franchiseSeasons.pointsScored,
        pointsAgainst: franchiseSeasons.pointsAgainst,
      })
      .from(franchiseSeasons)
      .innerJoin(franchises, eq(franchiseSeasons.franchiseId, franchises.id))
      .where(eq(franchiseSeasons.seasonId, latestSeason.id))
      .orderBy(
        desc(franchiseSeasons.wins),
        desc(franchiseSeasons.pointsScored)
      );

    // Get championship counts for each franchise
    const champCounts = await db
      .select({
        franchiseId: franchiseSeasons.franchiseId,
        championships: count(
          sql`CASE WHEN ${franchiseSeasons.playoffResult} = 'champion' THEN 1 END`
        ),
      })
      .from(franchiseSeasons)
      .groupBy(franchiseSeasons.franchiseId);

    const champMap = new Map(
      champCounts.map((c) => [c.franchiseId, c.championships])
    );

    return rows.map((r, index) => ({
      rank: index + 1,
      id: r.id,
      slug: r.slug,
      name: r.name,
      abbreviation: r.abbreviation ?? undefined,
      brandingColor: r.brandingColor ?? undefined,
      wins: r.wins ?? 0,
      losses: r.losses ?? 0,
      ties: r.ties ?? 0,
      pointsScored: Number(r.pointsScored ?? 0),
      pointsAgainst: Number(r.pointsAgainst ?? 0),
      championships: champMap.get(r.id) ?? 0,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 4.7 — Trophy Case
// ---------------------------------------------------------------------------

export async function getTrophyCase(): Promise<TrophyEntry[]> {
  try {
    // Single query: join seasons -> champion franchise + runner-up franchise_season
    const rows = await db
      .select({
        seasonYear: seasons.seasonYear,
        championFranchiseId: seasons.championFranchiseId,
        championName: sql<string | null>`champ.name`,
        championSlug: sql<string | null>`champ.slug`,
        championAbbreviation: sql<string | null>`champ.abbreviation`,
        championBrandingColor: sql<string | null>`champ.branding_color`,
        runnerUpName: sql<string | null>`runner.name`,
        runnerUpSlug: sql<string | null>`runner.slug`,
      })
      .from(seasons)
      .leftJoin(
        sql`${franchises} champ`,
        sql`champ.id = ${seasons.championFranchiseId}`
      )
      .leftJoin(
        sql`${franchiseSeasons} runner_fs`,
        sql`runner_fs.season_id = ${seasons.id} AND runner_fs.playoff_result = 'runner_up'`
      )
      .leftJoin(
        sql`${franchises} runner`,
        sql`runner.id = runner_fs.franchise_id`
      )
      .orderBy(desc(seasons.seasonYear));

    return rows.map((row) => ({
      seasonYear: row.seasonYear,
      championFranchiseId: row.championFranchiseId,
      championName: row.championName,
      championSlug: row.championSlug,
      championAbbreviation: row.championAbbreviation,
      championBrandingColor: row.championBrandingColor,
      runnerUpName: row.runnerUpName,
      runnerUpSlug: row.runnerUpSlug,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers — Get all franchise options (for selectors)
// ---------------------------------------------------------------------------

export async function getAllFranchiseOptions(): Promise<
  {
    id: string;
    slug: string;
    name: string;
    abbreviation?: string;
    brandingColor?: string;
  }[]
> {
  try {
    const rows = await db
      .select({
        id: franchises.id,
        slug: franchises.slug,
        name: franchises.name,
        abbreviation: franchises.abbreviation,
        brandingColor: franchises.brandingColor,
      })
      .from(franchises)
      .orderBy(franchises.name);

    return rows.map((r) => ({
      ...r,
      abbreviation: r.abbreviation ?? undefined,
      brandingColor: r.brandingColor ?? undefined,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helper — Get available season years
// ---------------------------------------------------------------------------

export async function getSeasonYears(): Promise<number[]> {
  try {
    const rows = await db
      .select({ seasonYear: seasons.seasonYear })
      .from(seasons)
      .orderBy(desc(seasons.seasonYear));

    return rows.map((r) => r.seasonYear);
  } catch {
    return [];
  }
}
