import { db } from "@/lib/db";
import { seasons } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getLeagueMatchups,
  getWeekProjections,
  getNflSchedule,
} from "@/lib/sleeper";
import type { SleeperProjections } from "@/lib/sleeper-schemas";
import { logSyncStart, logSyncComplete } from "@/lib/queries/sync-log";
import { upsertPlayerWeekPoints, upsertNflGames } from "@/lib/sync/hourly";
import { getRosterToFranchiseMap } from "@/lib/queries/franchise-mapping";

// Shape of the per-season settings blob stored in seasons.settings_json.
interface SeasonSettingsJson {
  scoring_settings?: Record<string, number>;
  roster_positions?: string[];
}

export interface BackfillSummary {
  seasonYear: number;
  seasonId: number | null;
  weeksProcessed: number;
  rowCount: number;
  status: "success" | "failure";
  error?: string;
}

/**
 * Backfills player_week_points for an entire past season by replaying every
 * week's matchups through the same write path as the hourly sync. Historical
 * projections are pulled per week when available; when a season/week has no
 * projections the projected_points column is left null.
 *
 * Logs a single sync_log entry (syncType 'backfill', dataType
 * 'player_week_points') with the total number of rows written.
 */
export async function runPlayerPointsBackfill(
  seasonYear: number
): Promise<BackfillSummary> {
  const logId = await logSyncStart("backfill", "player_week_points");

  try {
    const [season] = await db
      .select({
        id: seasons.id,
        leagueId: seasons.leagueId,
        settingsJson: seasons.settingsJson,
      })
      .from(seasons)
      .where(eq(seasons.seasonYear, seasonYear));

    if (!season) {
      throw new Error(
        `Season ${seasonYear} not found in database. Run daily sync first.`
      );
    }

    const settings = (season.settingsJson ?? null) as SeasonSettingsJson | null;
    const scoringSettings = settings?.scoring_settings ?? null;
    const rosterPositions = settings?.roster_positions ?? null;

    // roster_id -> franchise_id mapping for this season (stable across weeks)
    const rosterToFranchise = await getRosterToFranchiseMap(season.id);

    // Upsert the season's NFL schedule once so historical weeks classify their
    // starters (yet-to-play vs finished) the same way live weeks do. Fantasy
    // weeks are all NFL regular-season weeks, so the regular schedule suffices;
    // a schedule failure is non-fatal (weeks then hide players-left, correctly).
    const scheduleResult = await getNflSchedule("regular", String(seasonYear));
    if (!("error" in scheduleResult)) {
      await upsertNflGames(seasonYear, scheduleResult.data);
    }

    // NFL regular season grew to 18 weeks in 2021; Sleeper fantasy playoff
    // weeks fall within this range too, so iterate the full span.
    const maxWeek = seasonYear >= 2021 ? 18 : 17;

    let totalRows = 0;
    let weeksProcessed = 0;

    for (let week = 1; week <= maxWeek; week++) {
      // Matchups and projections for a week are independent; fetch in parallel.
      const [matchupsResult, projResult] = await Promise.all([
        getLeagueMatchups(season.leagueId, week),
        getWeekProjections(seasonYear, week),
      ]);
      if ("error" in matchupsResult) {
        // Skip weeks that error (e.g. beyond the season); keep going.
        continue;
      }
      const weekMatchups = matchupsResult.data;
      if (weekMatchups.length === 0) continue;

      // Attempt historical projections for this season/week; non-fatal.
      let projections: SleeperProjections | null = null;
      if (!("error" in projResult)) {
        projections = projResult.data;
      }

      const rowCount = await upsertPlayerWeekPoints({
        seasonId: season.id,
        week,
        matchups: weekMatchups,
        rosterToFranchise,
        scoringSettings,
        rosterPositions,
        projections,
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
