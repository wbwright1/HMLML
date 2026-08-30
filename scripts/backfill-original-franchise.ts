/**
 * One-time backfill script: populates original_franchise_id on draft_picks
 * for all historical drafts by fetching draft_order from the Sleeper API.
 *
 * Usage: npx tsx scripts/backfill-original-franchise.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "@/lib/db";
import { seasons, franchiseSeasons, draftPicks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getLeagueDrafts, getDraftPicks } from "@/lib/sleeper";

async function backfill() {
  // Get all seasons with a league ID
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

  for (const season of allSeasons) {
    console.log(`\n--- Season ${season.seasonYear} (league ${season.leagueId}) ---`);

    // Get franchise_seasons for roster_id -> franchise_id and user_id -> franchise_id mappings
    const fsRows = await db
      .select({
        rosterId: franchiseSeasons.rosterId,
        franchiseId: franchiseSeasons.franchiseId,
        userId: franchiseSeasons.userId,
      })
      .from(franchiseSeasons)
      .where(eq(franchiseSeasons.seasonId, season.id));

    if (fsRows.length === 0) {
      console.log("  No franchise_seasons data, skipping");
      continue;
    }

    const rosterToFranchise = new Map<string, string>();
    const userToFranchise = new Map<string, string>();
    for (const row of fsRows) {
      rosterToFranchise.set(row.rosterId, row.franchiseId);
      userToFranchise.set(row.userId, row.franchiseId);
    }

    // Fetch drafts for this league from Sleeper
    const draftsResult = await getLeagueDrafts(season.leagueId);
    if ("error" in draftsResult) {
      console.log(`  Sleeper API error: ${draftsResult.error.message}`);
      continue;
    }

    const completedDrafts = draftsResult.data.filter((d) => d.status === "complete");
    console.log(`  Found ${completedDrafts.length} completed draft(s)`);

    for (const draft of completedDrafts) {
      if (!draft.draft_order) {
        console.log(`  Draft ${draft.draft_id}: no draft_order, skipping`);
        continue;
      }

      // Build slot -> original franchise mapping
      const slotToOriginalFranchise = new Map<number, string>();
      for (const [userId, slot] of Object.entries(draft.draft_order)) {
        const franchiseId = userToFranchise.get(userId);
        if (franchiseId) {
          slotToOriginalFranchise.set(slot, franchiseId);
        }
      }

      if (slotToOriginalFranchise.size === 0) {
        console.log(`  Draft ${draft.draft_id}: could not map draft_order to franchises`);
        continue;
      }

      // Determine draft type
      const rounds = typeof draft.settings?.rounds === "number"
        ? (draft.settings.rounds as number)
        : 0;
      const draftType = rounds > 10 ? "startup" : "rookie";
      const totalTeams = Object.keys(draft.draft_order).length;

      // Fetch picks to get pick_no -> roster_id mapping
      const picksResult = await getDraftPicks(draft.draft_id);
      if ("error" in picksResult) {
        console.log(`  Draft ${draft.draft_id}: failed to fetch picks`);
        continue;
      }

      let updatedInDraft = 0;

      for (const pick of picksResult.data) {
        const rosterIdStr = String(pick.roster_id);
        const franchiseId = rosterToFranchise.get(rosterIdStr) ?? null;

        // Compute original slot for this pick
        const pickInRound = ((pick.pick_no - 1) % totalTeams) + 1;
        const isSnake = draftType === "startup";
        const isEvenRound = pick.round % 2 === 0;
        const originalSlot = isSnake && isEvenRound
          ? totalTeams - pickInRound + 1
          : pickInRound;
        const originalFranchiseId = slotToOriginalFranchise.get(originalSlot) ?? null;

        // Only set when the pick was traded (original differs from current)
        if (originalFranchiseId && originalFranchiseId !== franchiseId) {
          await db
            .update(draftPicks)
            .set({ originalFranchiseId })
            .where(
              and(
                eq(draftPicks.draftId, draft.draft_id),
                eq(draftPicks.pickNumber, pick.pick_no)
              )
            );
          updatedInDraft++;
        }
      }

      console.log(`  Draft ${draft.draft_id} (${draftType}): ${updatedInDraft} traded pick(s) updated`);
      totalUpdated += updatedInDraft;
    }
  }

  console.log(`\nDone. Total picks updated with originalFranchiseId: ${totalUpdated}`);
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
