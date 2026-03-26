import { db } from "@/lib/db";
import {
  seasons,
  franchises,
  franchiseSeasons,
  matchups,
  transactions,
} from "@/lib/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";

/**
 * Get offseason recap data for a completed season.
 */
export async function getOffseasonRecap(seasonId: number) {
  try {
    // Champion
    const [seasonRow] = await db
      .select({
        seasonYear: seasons.seasonYear,
        championFranchiseId: seasons.championFranchiseId,
      })
      .from(seasons)
      .where(eq(seasons.id, seasonId))
      .limit(1);

    if (!seasonRow) return null;

    let championName: string | null = null;
    let championSlug: string | null = null;

    if (seasonRow.championFranchiseId) {
      const [champ] = await db
        .select({ name: franchises.name, slug: franchises.slug })
        .from(franchises)
        .where(eq(franchises.id, seasonRow.championFranchiseId))
        .limit(1);
      if (champ) {
        championName = champ.name;
        championSlug = champ.slug;
      }
    }

    // Most PF
    const [mostPF] = await db
      .select({
        franchiseName: franchises.name,
        franchiseSlug: franchises.slug,
        pointsScored: franchiseSeasons.pointsScored,
      })
      .from(franchiseSeasons)
      .innerJoin(franchises, eq(franchises.id, franchiseSeasons.franchiseId))
      .where(eq(franchiseSeasons.seasonId, seasonId))
      .orderBy(desc(franchiseSeasons.pointsScored))
      .limit(1);

    // Biggest upset: largest margin where the team with fewer wins won
    // Simplified: just find the largest blowout
    const [biggestBlowout] = await db
      .select({
        winner: sql<string>`winner_f.name`,
        loser: sql<string>`loser_f.name`,
        margin: sql<number>`ABS(w.points - l.points)`,
      })
      .from(sql`
        (SELECT m1.franchise_id as winner_id, m1.points, m2.franchise_id as loser_id, m2.points as loser_points
         FROM matchups m1
         JOIN matchups m2 ON m1.season_id = m2.season_id AND m1.week = m2.week AND m1.matchup_id = m2.matchup_id AND m1.id != m2.id
         WHERE m1.season_id = ${seasonId} AND m1.is_winner = true AND m1.is_playoff = false
         ORDER BY ABS(m1.points - m2.points) DESC
         LIMIT 1) sub
        JOIN franchises winner_f ON winner_f.id = sub.winner_id
        JOIN franchises loser_f ON loser_f.id = sub.loser_id
      `)
      .catch(() => [undefined]) as [{ winner: string; loser: string; margin: number } | undefined];

    // Longest win streak: compute from matchup data
    const allMatchups = await db
      .select({
        franchiseId: matchups.franchiseId,
        week: matchups.week,
        isWinner: matchups.isWinner,
      })
      .from(matchups)
      .where(
        and(
          eq(matchups.seasonId, seasonId),
          eq(matchups.isPlayoff, false),
        )
      )
      .orderBy(matchups.franchiseId, matchups.week);

    let longestStreak = { franchiseId: "", streak: 0 };
    let currentStreak = { franchiseId: "", streak: 0 };

    for (const m of allMatchups) {
      if (m.franchiseId === currentStreak.franchiseId && m.isWinner) {
        currentStreak.streak++;
      } else if (m.isWinner) {
        currentStreak = { franchiseId: m.franchiseId, streak: 1 };
      } else {
        currentStreak = { franchiseId: m.franchiseId, streak: 0 };
      }
      if (currentStreak.streak > longestStreak.streak) {
        longestStreak = { ...currentStreak };
      }
    }

    let streakFranchiseName: string | null = null;
    if (longestStreak.franchiseId && longestStreak.streak > 1) {
      const [f] = await db
        .select({ name: franchises.name })
        .from(franchises)
        .where(eq(franchises.id, longestStreak.franchiseId))
        .limit(1);
      streakFranchiseName = f?.name ?? null;
    }

    return {
      seasonYear: seasonRow.seasonYear,
      champion: championName
        ? { name: championName, slug: championSlug }
        : null,
      mostPF: mostPF
        ? {
            franchiseName: mostPF.franchiseName,
            franchiseSlug: mostPF.franchiseSlug,
            points: mostPF.pointsScored ?? 0,
          }
        : null,
      biggestBlowout: biggestBlowout
        ? {
            winner: biggestBlowout.winner,
            loser: biggestBlowout.loser,
            margin: biggestBlowout.margin,
          }
        : null,
      longestStreak:
        longestStreak.streak > 1 && streakFranchiseName
          ? {
              franchiseName: streakFranchiseName,
              streak: longestStreak.streak,
            }
          : null,
    };
  } catch (error) {
    console.error("[offseason] getOffseasonRecap error:", error);
    return null;
  }
}

/**
 * Get recent transactions for a season.
 */
export async function getRecentTransactions(
  seasonId: number,
  limit = 10
) {
  try {
    const rows = await db
      .select({
        type: transactions.type,
        week: transactions.week,
        adds: transactions.adds,
        drops: transactions.drops,
        createdAtSleeper: transactions.createdAtSleeper,
      })
      .from(transactions)
      .where(eq(transactions.seasonId, seasonId))
      .orderBy(desc(transactions.createdAtSleeper))
      .limit(limit);

    return rows.map((txn) => {
      const date = txn.createdAtSleeper
        ? new Date(txn.createdAtSleeper).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })
        : "Unknown";

      let description = `${txn.type} transaction`;
      const adds = txn.adds as Record<string, string> | null;
      const drops = txn.drops as Record<string, string> | null;

      if (adds && Object.keys(adds).length > 0) {
        const playerCount = Object.keys(adds).length;
        description = `Added ${playerCount} player${playerCount > 1 ? "s" : ""}`;
      }
      if (drops && Object.keys(drops).length > 0) {
        const playerCount = Object.keys(drops).length;
        description += `, dropped ${playerCount} player${playerCount > 1 ? "s" : ""}`;
      }

      return {
        date,
        type: txn.type as "trade" | "waiver" | "free_agent" | "commissioner",
        description,
      };
    });
  } catch (error) {
    console.error("[offseason] getRecentTransactions error:", error);
    return [];
  }
}
