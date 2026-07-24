/**
 * One-time backfill script: populates franchise_seasons.avatar_url for
 * historical seasons where it is NULL (2021-2025), by re-fetching league
 * users from Sleeper and resolving each owner's avatar URL.
 *
 * Only fills NULL values; never overwrites an existing avatar_url. Safe to
 * re-run (idempotent) -- a second run should report 0 updates.
 *
 * Usage: POSTGRES_DRIVER=pg npx tsx scripts/backfill-franchise-avatars.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "@/lib/db";
import { seasons, franchiseSeasons } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getLeagueUsers } from "@/lib/sleeper";
import { resolveAvatarUrl } from "@/lib/sync/daily";
import { logSyncStart, logSyncComplete } from "@/lib/queries/sync-log";

async function backfill() {
  const logId = await logSyncStart("backfill", "franchise_avatars");

  try {
    const allSeasons = await db
      .select({
        id: seasons.id,
        seasonYear: seasons.seasonYear,
        leagueId: seasons.leagueId,
      })
      .from(seasons)
      .orderBy(seasons.seasonYear);

    console.log(`Found ${allSeasons.length} seasons to process`);

    let totalCandidates = 0;
    let totalUpdated = 0;
    let totalStillNull = 0;

    for (const season of allSeasons) {
      console.log(`\n--- Season ${season.seasonYear} (league ${season.leagueId}) ---`);

      const nullRows = await db
        .select({
          id: franchiseSeasons.id,
          userId: franchiseSeasons.userId,
        })
        .from(franchiseSeasons)
        .where(
          and(
            eq(franchiseSeasons.seasonId, season.id),
            isNull(franchiseSeasons.avatarUrl)
          )
        );

      if (nullRows.length === 0) {
        console.log("  No NULL avatar_url rows, skipping");
        continue;
      }

      totalCandidates += nullRows.length;
      console.log(`  ${nullRows.length} row(s) with NULL avatar_url`);

      const usersResult = await getLeagueUsers(season.leagueId);
      if ("error" in usersResult) {
        console.log(`  Sleeper API error: ${usersResult.error.message}`);
        totalStillNull += nullRows.length;
        continue;
      }

      const userMap = new Map(usersResult.data.map((u) => [u.user_id, u]));

      let updatedInSeason = 0;
      let stillNullInSeason = 0;

      for (const row of nullRows) {
        const user = userMap.get(row.userId);
        const avatarUrl = user ? resolveAvatarUrl(user) : null;

        if (!avatarUrl) {
          stillNullInSeason++;
          continue;
        }

        await db
          .update(franchiseSeasons)
          .set({ avatarUrl, updatedAt: new Date() })
          .where(
            and(
              eq(franchiseSeasons.id, row.id),
              isNull(franchiseSeasons.avatarUrl)
            )
          );
        updatedInSeason++;
      }

      console.log(`  Updated: ${updatedInSeason}, still null: ${stillNullInSeason}`);
      totalUpdated += updatedInSeason;
      totalStillNull += stillNullInSeason;
    }

    console.log(
      `\nDone. Candidates: ${totalCandidates}, updated: ${totalUpdated}, still null: ${totalStillNull}`
    );

    await logSyncComplete(logId, "success", totalUpdated, undefined, {
      candidates: totalCandidates,
      updated: totalUpdated,
      stillNull: totalStillNull,
    });
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
