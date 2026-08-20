/**
 * One-time backfill script: recomputes franchise_seasons.playoff_result for
 * every completed Sleeper season using the FIXED derivePlayoffResults, which
 * tags BOTH participants of the losers-bracket final (p === 1) as
 * `toilet_bowl` and every other losers-bracket team as `consolation`.
 *
 * Previously the loser of the highest-`p` losers match was mis-tagged as the
 * single `toilet_bowl` team. This corrects franchise_seasons in the live DB.
 *
 * SPENT: this script has been run against the live DB and is kept only for the
 * record. It also predates the discovery that the losers bracket is INVERTED
 * (you advance by LOSING, and Sleeper records the advancing team in `w`), so
 * do not treat its wording as a description of the current model. The single
 * last-place franchise now lives in seasons.toilet_bowl_franchise_id, written
 * by scripts/backfill-playoff-brackets.ts and the daily sync. Nothing here
 * touches that column.
 *
 * It only writes rows whose playoff_result actually changes, and logs every
 * before/after transition. It never rewrites champion/runner_up assignments
 * silently: any diff touching those results is flagged loudly (none expected,
 * since only the losers-bracket logic changed).
 *
 * Idempotent: a second run reports 0 changes.
 *
 * Usage: POSTGRES_DRIVER=pg npx tsx scripts/backfill-toilet-bowl.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "@/lib/db";
import { seasons, franchiseSeasons } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getLeague, getWinnersBracket, getLosersBracket } from "@/lib/sleeper";
import { derivePlayoffResults } from "@/lib/sync/derive-playoffs";
import { logSyncStart, logSyncComplete } from "@/lib/queries/sync-log";

async function backfill() {
  const logId = await logSyncStart("backfill", "toilet_bowl");

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

    let totalUpdated = 0;
    let totalUnchanged = 0;
    const flagged: string[] = [];

    for (const season of allSeasons) {
      if (!season.leagueId) {
        console.log(`\n--- Season ${season.seasonYear}: no leagueId (legacy/pre-Sleeper), skipping ---`);
        continue;
      }

      console.log(`\n--- Season ${season.seasonYear} (league ${season.leagueId}) ---`);

      // Mirror the daily-sync guard: only completed seasons have real playoff
      // results. Sleeper serves a pre-seeded bracket SHELL (t1/t2 seeds, all
      // w/l null) for the upcoming season, which must NOT populate results.
      const leagueResult = await getLeague(season.leagueId);
      if ("error" in leagueResult) {
        console.log(`  League API error: ${leagueResult.error.message}, skipping`);
        continue;
      }
      if (leagueResult.data.status !== "complete") {
        console.log(`  League status "${leagueResult.data.status}" (not complete), skipping`);
        continue;
      }

      const [winnersResult, losersResult] = await Promise.all([
        getWinnersBracket(season.leagueId),
        getLosersBracket(season.leagueId),
      ]);

      if ("error" in winnersResult) {
        console.log(`  Winners bracket API error: ${winnersResult.error.message}, skipping`);
        continue;
      }
      if ("error" in losersResult) {
        console.log(`  Losers bracket API error: ${losersResult.error.message}, skipping`);
        continue;
      }

      if (winnersResult.data.length === 0 && losersResult.data.length === 0) {
        console.log(`  No bracket data (season not played / in progress), skipping`);
        continue;
      }

      // Build roster_id (number) -> franchise_id from the persisted per-season
      // franchise_seasons mapping (same source the row is keyed on).
      const rows = await db
        .select({
          rosterId: franchiseSeasons.rosterId,
          franchiseId: franchiseSeasons.franchiseId,
          playoffResult: franchiseSeasons.playoffResult,
        })
        .from(franchiseSeasons)
        .where(eq(franchiseSeasons.seasonId, season.id));

      const rosterToFranchise = new Map<number, string>();
      const currentResultByFranchise = new Map<string, string | null>();
      for (const row of rows) {
        if (row.rosterId != null) {
          rosterToFranchise.set(Number(row.rosterId), row.franchiseId);
        }
        currentResultByFranchise.set(row.franchiseId, row.playoffResult);
      }

      const results = derivePlayoffResults(
        winnersResult.data,
        losersResult.data,
        rosterToFranchise
      );

      let updatedInSeason = 0;
      for (const [franchiseId, newResult] of results.franchiseResults) {
        const oldResult = currentResultByFranchise.get(franchiseId) ?? null;
        if (oldResult === newResult) {
          totalUnchanged++;
          continue;
        }

        const changesChampionship =
          oldResult === "champion" ||
          oldResult === "runner_up" ||
          newResult === "champion" ||
          newResult === "runner_up";
        const tag = changesChampionship ? "  [!] CHAMPIONSHIP DIFF" : "  ~";
        const line = `Season ${season.seasonYear} franchise ${franchiseId}: ${oldResult ?? "null"} -> ${newResult}`;
        console.log(`${tag} ${line}`);
        if (changesChampionship) flagged.push(line);

        await db
          .update(franchiseSeasons)
          .set({ playoffResult: newResult, updatedAt: new Date() })
          .where(
            and(
              eq(franchiseSeasons.seasonId, season.id),
              eq(franchiseSeasons.franchiseId, franchiseId)
            )
          );
        updatedInSeason++;
        totalUpdated++;
      }

      const tbTeams = [...results.franchiseResults.entries()]
        .filter(([, r]) => r === "toilet_bowl")
        .map(([f]) => f);
      console.log(`  Updated ${updatedInSeason} row(s). Toilet Bowl finalists: ${tbTeams.join(", ") || "(none)"}`);
    }

    console.log(`\nDone. Updated: ${totalUpdated}, unchanged: ${totalUnchanged}`);
    if (flagged.length > 0) {
      console.log(`\n[!] ${flagged.length} championship-related diffs (review before trusting):`);
      for (const f of flagged) console.log(`    ${f}`);
    } else {
      console.log(`No champion/runner_up assignments changed (as expected).`);
    }

    await logSyncComplete(logId, "success", totalUpdated, undefined, {
      updated: totalUpdated,
      unchanged: totalUnchanged,
      championshipDiffs: flagged.length,
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
