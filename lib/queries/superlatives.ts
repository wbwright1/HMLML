import { db } from "@/lib/db";
import { matchups, franchises } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatchupResult {
  winner: string;
  winnerSlug: string;
  loser: string;
  loserSlug: string;
  winnerScore: number;
  loserScore: number;
  margin: number;
}

export interface ScorerResult {
  franchiseName: string;
  franchiseSlug: string;
  points: number;
}

export interface WeeklySuperlatives {
  closestWin: MatchupResult | null;
  biggestBlowout: MatchupResult | null;
  highestScorer: ScorerResult | null;
  lowestScorer: ScorerResult | null;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Returns weekly superlative stats for a given season and week.
 * All data comes from the matchups table joined with franchises.
 */
export async function getWeeklySuperlatives(
  seasonId: number,
  week: number
): Promise<WeeklySuperlatives> {
  try {
    // Fetch all completed matchup rows for this week
    const rows = await db
      .select({
        matchupId: matchups.matchupId,
        franchiseId: matchups.franchiseId,
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
          eq(matchups.week, week),
          eq(matchups.status, "complete")
        )
      );

    if (rows.length === 0) {
      return {
        closestWin: null,
        biggestBlowout: null,
        highestScorer: null,
        lowestScorer: null,
      };
    }

    // Group rows by matchupId to pair opponents
    const grouped = new Map<
      number,
      { franchiseName: string; franchiseSlug: string; points: number; isWinner: boolean | null }[]
    >();

    for (const row of rows) {
      const group = grouped.get(row.matchupId) ?? [];
      group.push({
        franchiseName: row.franchiseName,
        franchiseSlug: row.franchiseSlug,
        points: row.points ?? 0,
        isWinner: row.isWinner,
      });
      grouped.set(row.matchupId, group);
    }

    // Build paired results
    const paired: MatchupResult[] = [];
    for (const [, pair] of grouped) {
      if (pair.length !== 2) continue;

      const winner = pair.find((p) => p.isWinner === true) ?? pair[0];
      const loser = pair.find((p) => p.isWinner !== true) ?? pair[1];

      paired.push({
        winner: winner.franchiseName,
        winnerSlug: winner.franchiseSlug,
        loser: loser.franchiseName,
        loserSlug: loser.franchiseSlug,
        winnerScore: winner.points,
        loserScore: loser.points,
        margin: Math.abs(winner.points - loser.points),
      });
    }

    // Sort by margin to find closest and biggest blowout
    const byMargin = [...paired].sort((a, b) => a.margin - b.margin);
    const closestWin = byMargin.length > 0 ? byMargin[0] : null;
    const biggestBlowout =
      byMargin.length > 0 ? byMargin[byMargin.length - 1] : null;

    // Individual franchise scores for highest/lowest
    const allScores = rows
      .map((r) => ({
        franchiseName: r.franchiseName,
        franchiseSlug: r.franchiseSlug,
        points: r.points ?? 0,
      }))
      .sort((a, b) => b.points - a.points);

    const highestScorer = allScores.length > 0 ? allScores[0] : null;
    const lowestScorer =
      allScores.length > 0 ? allScores[allScores.length - 1] : null;

    return {
      closestWin,
      biggestBlowout,
      highestScorer,
      lowestScorer,
    };
  } catch (e) {
    console.error("[superlatives] getWeeklySuperlatives error:", e);
    return {
      closestWin: null,
      biggestBlowout: null,
      highestScorer: null,
      lowestScorer: null,
    };
  }
}
