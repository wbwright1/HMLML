import { db } from "@/lib/db";
import { franchises, franchiseSeasons, matchups, seasons } from "@/lib/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";

/**
 * Derives homepage superlative stats from existing data.
 * No new API calls — everything comes from franchise_seasons, matchups, and standings.
 */
export async function getHomepageSuperlatives(seasonId: number) {
  try {
    // 1. Highest score this week (or last completed week)
    const highestScore = await db
      .select({
        franchiseName: franchises.name,
        franchiseSlug: franchises.slug,
        points: matchups.points,
        week: matchups.week,
      })
      .from(matchups)
      .innerJoin(franchises, eq(matchups.franchiseId, franchises.id))
      .where(
        and(
          eq(matchups.seasonId, seasonId),
          eq(matchups.status, "complete")
        )
      )
      .orderBy(desc(matchups.points))
      .limit(1);

    // 2. Longest active win streak — compute from matchups
    // Get all completed matchups for the season ordered by week desc
    const allMatchups = await db
      .select({
        franchiseId: matchups.franchiseId,
        franchiseName: franchises.name,
        week: matchups.week,
        isWinner: matchups.isWinner,
      })
      .from(matchups)
      .innerJoin(franchises, eq(matchups.franchiseId, franchises.id))
      .where(
        and(
          eq(matchups.seasonId, seasonId),
          eq(matchups.status, "complete"),
          eq(matchups.isPlayoff, false)
        )
      )
      .orderBy(desc(matchups.week));

    // Group by franchise and find longest active streak
    const streakMap = new Map<string, { name: string; streak: number }>();
    const franchiseWeeks = new Map<string, { name: string; results: { week: number; won: boolean }[] }>();

    for (const m of allMatchups) {
      const entry = franchiseWeeks.get(m.franchiseId) ?? { name: m.franchiseName, results: [] };
      entry.results.push({ week: m.week, won: m.isWinner === true });
      franchiseWeeks.set(m.franchiseId, entry);
    }

    for (const [fId, data] of franchiseWeeks) {
      // Results are sorted by week desc — count consecutive wins from most recent
      let streak = 0;
      for (const r of data.results) {
        if (r.won) streak++;
        else break;
      }
      if (streak > 0) {
        streakMap.set(fId, { name: data.name, streak });
      }
    }

    let longestStreak: { franchiseName: string; streak: number } | null = null;
    for (const [, data] of streakMap) {
      if (!longestStreak || data.streak > longestStreak.streak) {
        longestStreak = { franchiseName: data.name, streak: data.streak };
      }
    }

    // 3. Closest matchup this week (smallest margin among completed matchups in latest week)
    const latestWeekResult = await db
      .select({ maxWeek: sql<number>`MAX(${matchups.week})` })
      .from(matchups)
      .where(
        and(
          eq(matchups.seasonId, seasonId),
          eq(matchups.status, "complete")
        )
      );
    const latestWeek = latestWeekResult[0]?.maxWeek ?? 0;

    let closestMatchup: { teamA: string; teamB: string; margin: number; scoreA: number; scoreB: number } | null = null;

    if (latestWeek > 0) {
      // Get all matchups for the latest completed week, paired by matchupId
      const weekMatchups = await db
        .select({
          matchupId: matchups.matchupId,
          franchiseName: franchises.name,
          points: matchups.points,
        })
        .from(matchups)
        .innerJoin(franchises, eq(matchups.franchiseId, franchises.id))
        .where(
          and(
            eq(matchups.seasonId, seasonId),
            eq(matchups.week, latestWeek),
            eq(matchups.status, "complete")
          )
        );

      // Group by matchupId and find closest
      const grouped = new Map<number, { name: string; points: number }[]>();
      for (const m of weekMatchups) {
        const group = grouped.get(m.matchupId) ?? [];
        group.push({ name: m.franchiseName, points: m.points ?? 0 });
        grouped.set(m.matchupId, group);
      }

      for (const [, pair] of grouped) {
        if (pair.length === 2) {
          const margin = Math.abs(pair[0].points - pair[1].points);
          if (!closestMatchup || margin < closestMatchup.margin) {
            closestMatchup = {
              teamA: pair[0].name,
              teamB: pair[1].name,
              margin,
              scoreA: pair[0].points,
              scoreB: pair[1].points,
            };
          }
        }
      }
    }

    // 4. Most all-time wins (career superlative)
    const mostWins = await db
      .select({
        franchiseName: franchises.name,
        totalWins: sql<number>`COALESCE(SUM(${franchiseSeasons.wins}), 0)`,
      })
      .from(franchiseSeasons)
      .innerJoin(franchises, eq(franchiseSeasons.franchiseId, franchises.id))
      .groupBy(franchises.id, franchises.name)
      .orderBy(desc(sql`SUM(${franchiseSeasons.wins})`))
      .limit(1);

    return {
      highestScore: highestScore[0] ?? null,
      longestStreak,
      closestMatchup,
      mostAllTimeWins: mostWins[0] ?? null,
      latestCompletedWeek: latestWeek,
    };
  } catch {
    return {
      highestScore: null,
      longestStreak: null,
      closestMatchup: null,
      mostAllTimeWins: null,
      latestCompletedWeek: 0,
    };
  }
}

/**
 * Gets last week's completed results for the narrative block.
 */
export async function getLastWeekResults(seasonId: number, currentWeek: number) {
  if (currentWeek <= 1) return null;

  const previousWeek = currentWeek - 1;

  try {
    const results = await db
      .select({
        matchupId: matchups.matchupId,
        franchiseName: franchises.name,
        franchiseSlug: franchises.slug,
        points: matchups.points,
        isWinner: matchups.isWinner,
      })
      .from(matchups)
      .innerJoin(franchises, eq(matchups.franchiseId, franchises.id))
      .where(
        and(
          eq(matchups.seasonId, seasonId),
          eq(matchups.week, previousWeek),
          eq(matchups.status, "complete")
        )
      )
      .orderBy(matchups.matchupId);

    // Pair them up
    const paired: { winner: string; loser: string; winnerScore: number; loserScore: number; margin: number }[] = [];
    const grouped = new Map<number, { name: string; points: number; won: boolean }[]>();

    for (const r of results) {
      const group = grouped.get(r.matchupId) ?? [];
      group.push({ name: r.franchiseName, points: r.points ?? 0, won: r.isWinner === true });
      grouped.set(r.matchupId, group);
    }

    for (const [, pair] of grouped) {
      if (pair.length === 2) {
        const winner = pair.find((p) => p.won) ?? pair[0];
        const loser = pair.find((p) => !p.won) ?? pair[1];
        paired.push({
          winner: winner.name,
          loser: loser.name,
          winnerScore: winner.points,
          loserScore: loser.points,
          margin: Math.abs(winner.points - loser.points),
        });
      }
    }

    // Sort by margin desc (biggest blowout first)
    paired.sort((a, b) => b.margin - a.margin);

    return { week: previousWeek, results: paired };
  } catch {
    return null;
  }
}

/**
 * Gets offseason "League at a Glance" data.
 */
export async function getLeagueAtAGlance() {
  try {
    // Reigning champion
    const [latestChampSeason] = await db
      .select({
        seasonYear: seasons.seasonYear,
        championName: franchises.name,
        championSlug: franchises.slug,
      })
      .from(seasons)
      .innerJoin(franchises, eq(seasons.championFranchiseId, franchises.id))
      .orderBy(desc(seasons.seasonYear))
      .limit(1);

    // Total seasons
    const [seasonCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(seasons);

    // Total matchups
    const [matchupCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(matchups)
      .where(eq(matchups.status, "complete"));

    // Most championships franchise
    const [mostChamps] = await db
      .select({
        franchiseName: franchises.name,
        championships: sql<number>`COUNT(*)`,
      })
      .from(seasons)
      .innerJoin(franchises, eq(seasons.championFranchiseId, franchises.id))
      .groupBy(franchises.id, franchises.name)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(1);

    return {
      reigningChampion: latestChampSeason ?? null,
      totalSeasons: seasonCount?.count ?? 0,
      totalMatchups: matchupCount?.count ?? 0,
      mostChampionships: mostChamps ?? null,
    };
  } catch {
    return {
      reigningChampion: null,
      totalSeasons: 0,
      totalMatchups: 0,
      mostChampionships: null,
    };
  }
}
