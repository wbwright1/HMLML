import { db } from "@/lib/db";
import {
  seasons,
  franchises,
  franchiseSeasons,
} from "@/lib/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";

/**
 * Returns enriched season timeline data for the history page.
 * Includes champion, runner-up, and most PF per season.
 */
export async function getSeasonTimelineData() {
  try {
    // Get all seasons with champion info
    const allSeasons = await db
      .select({
        id: seasons.id,
        seasonYear: seasons.seasonYear,
        status: seasons.status,
        totalRosters: seasons.totalRosters,
        championFranchiseId: seasons.championFranchiseId,
        previousLeagueId: seasons.previousLeagueId,
        championName: sql<string | null>`champ.name`,
        championSlug: sql<string | null>`champ.slug`,
      })
      .from(seasons)
      .leftJoin(
        sql`${franchises} champ`,
        sql`champ.id = ${seasons.championFranchiseId}`
      )
      .orderBy(desc(seasons.seasonYear));

    // For each season, get runner-up and most PF
    const results = await Promise.all(
      allSeasons.map(async (season) => {
        let runnerUpName: string | null = null;
        let mostPF: { franchiseName: string; points: number } | null = null;
        let isLegacy = false;

        try {
          // Runner-up: franchise with playoff_result = 'runner_up'
          const [runnerUp] = await db
            .select({ name: franchises.name })
            .from(franchiseSeasons)
            .innerJoin(
              franchises,
              eq(franchises.id, franchiseSeasons.franchiseId)
            )
            .where(
              and(
                eq(franchiseSeasons.seasonId, season.id),
                eq(franchiseSeasons.playoffResult, "runner_up")
              )
            )
            .limit(1);
          runnerUpName = runnerUp?.name ?? null;

          // Most PF
          const [topScorer] = await db
            .select({
              name: franchises.name,
              points: franchiseSeasons.pointsScored,
            })
            .from(franchiseSeasons)
            .innerJoin(
              franchises,
              eq(franchises.id, franchiseSeasons.franchiseId)
            )
            .where(eq(franchiseSeasons.seasonId, season.id))
            .orderBy(desc(franchiseSeasons.pointsScored))
            .limit(1);

          if (topScorer && topScorer.points && topScorer.points > 0) {
            mostPF = {
              franchiseName: topScorer.name,
              points: topScorer.points,
            };
          }

          // Check if any franchise_season for this season is legacy
          const [legacyCheck] = await db
            .select({ isLegacyEra: franchiseSeasons.isLegacyEra })
            .from(franchiseSeasons)
            .where(
              and(
                eq(franchiseSeasons.seasonId, season.id),
                eq(franchiseSeasons.isLegacyEra, true)
              )
            )
            .limit(1);
          isLegacy = !!legacyCheck;
        } catch {
          // Individual season enrichment may fail
        }

        return {
          seasonYear: season.seasonYear,
          teamCount: season.totalRosters ?? 12,
          championName: season.championName,
          championSlug: season.championSlug,
          runnerUpName,
          mostPF,
          isLegacy,
          status: season.status,
        };
      })
    );

    return results;
  } catch (error) {
    console.error("[history] getSeasonTimelineData error:", error);
    return [];
  }
}
