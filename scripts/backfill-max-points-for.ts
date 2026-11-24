/**
 * One-time backfill: populates franchise_seasons.max_points_for (Sleeper
 * `ppts`, regular season only) for every Sleeper season where it is NULL.
 * The hourly and daily syncs keep the current season fresh after this.
 *
 * Only fills NULL values; safe to re-run (a second run reports 0 updates).
 * Pre-Sleeper legacy seasons have no Sleeper rosters and stay NULL.
 *
 * Run AFTER applying migration 0018 (npm run db:migrate).
 * Usage: POSTGRES_DRIVER=pg npx tsx scripts/backfill-max-points-for.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "@/lib/db";
import { seasons, franchiseSeasons } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getLeagueRosters } from "@/lib/sleeper";
import { maxPointsForOf } from "@/lib/sync/max-points-for";
import { logSyncStart, logSyncComplete } from "@/lib/queries/sync-log";

async function backfill() {
  const logId = await logSyncStart("backfill", "max_points_for");

  try {
    const allSeasons = await db
      .select({ id: seasons.id, seasonYear: seasons.seasonYear, leagueId: seasons.leagueId })
      .from(seasons)
      .orderBy(seasons.seasonYear);

    let updated = 0;
    let stillNull = 0;

    for (const season of allSeasons) {
      const nullRows = await db
        .select({ id: franchiseSeasons.id, rosterId: franchiseSeasons.rosterId })
        .from(franchiseSeasons)
        .where(and(eq(franchiseSeasons.seasonId, season.id), isNull(franchiseSeasons.maxPointsFor)));
      if (nullRows.length === 0) continue;

      const rostersResult = await getLeagueRosters(season.leagueId);
      if ("error" in rostersResult) {
        console.log(`${season.seasonYear}: Sleeper error ${rostersResult.error.message}`);
        stillNull += nullRows.length;
        continue;
      }
      const byRoster = new Map(rostersResult.data.map((r) => [String(r.roster_id), r]));

      for (const row of nullRows) {
        const roster = byRoster.get(row.rosterId);
        const maxPointsFor = roster ? maxPointsForOf(roster.settings) : null;
        if (maxPointsFor == null) {
          stillNull++;
          continue;
        }
        await db
          .update(franchiseSeasons)
          .set({ maxPointsFor, updatedAt: new Date() })
          .where(and(eq(franchiseSeasons.id, row.id), isNull(franchiseSeasons.maxPointsFor)));
        updated++;
      }
      console.log(`${season.seasonYear}: ${nullRows.length} candidates`);
    }

    console.log(`Done. Updated: ${updated}, still null: ${stillNull}`);
    await logSyncComplete(logId, "success", updated, undefined, { updated, stillNull });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logSyncComplete(logId, "failure", 0, message);
    throw err;
  }
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
