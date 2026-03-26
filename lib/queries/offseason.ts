import { db } from "@/lib/db";
import {
  seasons,
  franchises,
  franchiseSeasons,
  matchups,
  transactions,
  players,
} from "@/lib/db/schema";
import { eq, desc, sql, and, inArray } from "drizzle-orm";

/**
 * Get offseason recap data for a completed season.
 * If the given season has no matchup data, falls back to the most recent completed season.
 */
export async function getOffseasonRecap(seasonId: number) {
  try {
    let effectiveSeasonId = seasonId;

    // Check if this season has any matchup data
    const [matchupCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(matchups)
      .where(eq(matchups.seasonId, seasonId));

    if (!matchupCount || matchupCount.count === 0) {
      // Fall back to most recent completed season with matchup data
      const [completedSeason] = await db
        .select({ id: seasons.id })
        .from(seasons)
        .where(eq(seasons.status, "complete"))
        .orderBy(desc(seasons.seasonYear))
        .limit(1);

      if (completedSeason) {
        effectiveSeasonId = completedSeason.id;
      } else {
        return null;
      }
    }

    // Champion
    const [seasonRow] = await db
      .select({
        seasonYear: seasons.seasonYear,
        championFranchiseId: seasons.championFranchiseId,
      })
      .from(seasons)
      .where(eq(seasons.id, effectiveSeasonId))
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
      .where(eq(franchiseSeasons.seasonId, effectiveSeasonId))
      .orderBy(desc(franchiseSeasons.pointsScored))
      .limit(1);

    // Biggest blowout
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
         WHERE m1.season_id = ${effectiveSeasonId} AND m1.is_winner = true AND m1.is_playoff = false
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
          eq(matchups.seasonId, effectiveSeasonId),
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
 * Get recent transactions for a season, with player names resolved.
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

    // Collect all player IDs from all transactions for batch lookup
    const allPlayerIds = new Set<string>();
    for (const txn of rows) {
      const adds = txn.adds as Record<string, string> | null;
      const drops = txn.drops as Record<string, string> | null;
      if (adds) Object.keys(adds).forEach((id) => allPlayerIds.add(id));
      if (drops) Object.keys(drops).forEach((id) => allPlayerIds.add(id));
    }

    // Batch-fetch player names
    const playerNameMap = new Map<string, string>();
    if (allPlayerIds.size > 0) {
      const playerRows = await db
        .select({ id: players.id, fullName: players.fullName })
        .from(players)
        .where(inArray(players.id, Array.from(allPlayerIds)));

      for (const p of playerRows) {
        if (p.fullName) {
          playerNameMap.set(p.id, p.fullName);
        }
      }
    }

    return rows.map((txn) => {
      const date = txn.createdAtSleeper
        ? new Date(txn.createdAtSleeper).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })
        : "Unknown";

      const adds = txn.adds as Record<string, string> | null;
      const drops = txn.drops as Record<string, string> | null;

      const parts: string[] = [];

      if (adds && Object.keys(adds).length > 0) {
        const names = Object.keys(adds).map(
          (id) => playerNameMap.get(id) ?? "a player"
        );
        parts.push(`Added ${formatPlayerNames(names)}`);
      }

      if (drops && Object.keys(drops).length > 0) {
        const names = Object.keys(drops).map(
          (id) => playerNameMap.get(id) ?? "a player"
        );
        parts.push(`dropped ${formatPlayerNames(names)}`);
      }

      const description = parts.length > 0
        ? parts.join(", ")
        : `${txn.type} transaction`;

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

/** Format a list of player names, truncating at 2 with "+N more" */
function formatPlayerNames(names: string[]): string {
  if (names.length <= 2) {
    return names.join(", ");
  }
  return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
}
