/**
 * Backfill script: persists every season's Sleeper winners and losers bracket
 * into playoff_bracket_matches, and sets seasons.toilet_bowl_franchise_id.
 *
 * Before this existed the brackets were fetched by the daily sync and thrown
 * away, so the only surviving playoff fact was a single string per franchise
 * in franchise_seasons.playoff_result. The bracket page had to guess pairings
 * from flat matchup rows.
 *
 * THE INVERSION: the losers bracket advances the team that LOSES, and Sleeper
 * records that team in `w`. The Toilet Bowl champion is therefore the `w` of
 * the p === 1 losers match, and it is the team that finished dead last. This
 * script prints each season's resolved champion so the output can be diffed
 * against the known-good list:
 *
 *   2021 Bucky's General Store · 2022 Foopus · 2023 Olave Garden
 *   2024 Watson Love Diggs     · 2025 Latter Day Lamb Special
 *
 * In-progress seasons keep a null champion: the bracket rows are still stored
 * (so TBD slots render), but nobody is crowned until the final is played.
 *
 * Idempotent: bracket rows are replaced per season on every run.
 *
 * Usage: POSTGRES_DRIVER=pg npx tsx scripts/backfill-playoff-brackets.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "@/lib/db";
import { seasons, franchises } from "@/lib/db/schema";
import { getWinnersBracket, getLosersBracket, getLeagueRosters } from "@/lib/sleeper";
import { deriveToiletBowlChampion } from "@/lib/playoff-bracket";
import { persistBracketMatches } from "@/lib/sync/playoff-brackets";
import { logSyncStart, logSyncComplete } from "@/lib/queries/sync-log";

async function backfill() {
  const logId = await logSyncStart("backfill", "playoff_brackets");

  try {
    const allSeasons = await db
      .select({
        id: seasons.id,
        seasonYear: seasons.seasonYear,
        leagueId: seasons.leagueId,
        status: seasons.status,
      })
      .from(seasons)
      .orderBy(seasons.seasonYear);

    const franchiseRows = await db
      .select({ id: franchises.id, name: franchises.name })
      .from(franchises);
    const franchiseNames = new Map(franchiseRows.map((f) => [f.id, f.name]));

    console.log(`Found ${allSeasons.length} seasons`);

    let totalRows = 0;

    for (const season of allSeasons) {
      if (!season.leagueId) {
        console.log(`\n--- ${season.seasonYear}: no leagueId (pre-Sleeper), skipping ---`);
        continue;
      }

      console.log(`\n--- ${season.seasonYear} (league ${season.leagueId}) ---`);

      const rostersResult = await getLeagueRosters(season.leagueId);
      if ("error" in rostersResult) {
        throw new Error(
          `${season.seasonYear} rosters: ${rostersResult.error.message}`,
        );
      }
      const rosterToFranchise = new Map<number, string>();
      for (const roster of rostersResult.data) {
        if (roster.owner_id) rosterToFranchise.set(roster.roster_id, roster.owner_id);
      }

      const [winnersResult, losersResult] = await Promise.all([
        getWinnersBracket(season.leagueId),
        getLosersBracket(season.leagueId),
      ]);
      if ("error" in winnersResult) {
        throw new Error(
          `${season.seasonYear} winners bracket: ${winnersResult.error.message}`,
        );
      }
      if ("error" in losersResult) {
        throw new Error(
          `${season.seasonYear} losers bracket: ${losersResult.error.message}`,
        );
      }

      const toiletBowlFranchiseId = deriveToiletBowlChampion(
        losersResult.data,
        rosterToFranchise,
      );

      const rowCount = await persistBracketMatches(
        season.id,
        winnersResult.data,
        losersResult.data,
        toiletBowlFranchiseId,
      );
      totalRows += rowCount;

      const championName = toiletBowlFranchiseId
        ? (franchiseNames.get(toiletBowlFranchiseId) ?? toiletBowlFranchiseId)
        : "none (final unplayed)";

      console.log(
        `  ${winnersResult.data.length} winners + ${losersResult.data.length} losers = ${rowCount} rows`,
      );
      console.log(`  Toilet Bowl champion: ${championName}`);
    }

    console.log(`\nDone. ${totalRows} bracket rows written.`);
    await logSyncComplete(logId, "success", totalRows);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(`\nFAILED: ${message}`);
    await logSyncComplete(logId, "failure", 0, message);
    process.exitCode = 1;
  }
}

backfill().then(() => process.exit(process.exitCode ?? 0));
