import { db } from "@/lib/db";
import { seasons } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getWeekStats } from "@/lib/sleeper";
import { logSyncStart, logSyncComplete } from "@/lib/queries/sync-log";
import {
  upsertPlayerWeekStats,
  getRelevantPlayerIds,
} from "@/lib/sync/hourly";

export interface PlayerWeekStatsBackfillSummary {
  seasonYear: number;
  seasonId: number | null;
  weeksProcessed: number;
  rowCount: number;
  status: "success" | "failure";
  error?: string;
}

/**
 * Backfills player_week_stats for an entire past season by replaying every
 * week's NFL box-score stats through the same write path as the hourly sync.
 * The relevant player universe (scored / rostered / drafted in the season) is
 * computed once, then each week's full-league stat map is filtered to it and
 * upserted. Historical weeks with no stats are skipped.
 *
 * Logs a single sync_log entry (syncType 'backfill', dataType
 * 'player_week_stats') with the total number of rows written.
 */
export async function runPlayerWeekStatsBackfill(
  seasonYear: number
): Promise<PlayerWeekStatsBackfillSummary> {
  const logId = await logSyncStart("backfill", "player_week_stats");

  try {
    const [season] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.seasonYear, seasonYear));

    if (!season) {
      throw new Error(
        `Season ${seasonYear} not found in database. Run daily sync first.`
      );
    }

    // The relevant player universe is stable across weeks; compute once.
    const { playerIds, positionByPlayerId } = await getRelevantPlayerIds(
      season.id
    );

    // NFL regular season grew to 18 weeks in 2021; iterate the full span (as
    // the player-points backfill does) and skip weeks with no stats.
    const maxWeek = seasonYear >= 2021 ? 18 : 17;

    let totalRows = 0;
    let weeksProcessed = 0;

    for (let week = 1; week <= maxWeek; week++) {
      const statsResult = await getWeekStats(seasonYear, week);
      if ("error" in statsResult) {
        // Skip weeks that error (e.g. beyond the season); keep going.
        continue;
      }
      if (Object.keys(statsResult.data).length === 0) continue;

      const rowCount = await upsertPlayerWeekStats({
        seasonId: season.id,
        week,
        stats: statsResult.data,
        relevantPlayerIds: playerIds,
        positionByPlayerId,
      });

      totalRows += rowCount;
      weeksProcessed++;
    }

    await logSyncComplete(logId, "success", totalRows);
    return {
      seasonYear,
      seasonId: season.id,
      weeksProcessed,
      rowCount: totalRows,
      status: "success",
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    await logSyncComplete(logId, "failure", 0, errorMessage);
    return {
      seasonYear,
      seasonId: null,
      weeksProcessed: 0,
      rowCount: 0,
      status: "failure",
      error: errorMessage,
    };
  }
}
