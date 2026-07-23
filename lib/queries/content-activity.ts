import { db } from "@/lib/db";
import { syncLog, transactions } from "@/lib/db/schema";
import { and, count, desc, eq, gt } from "drizzle-orm";
import { selectLastOffseasonGenerationAt } from "@/lib/content-gen/activity-gate";

// ---------------------------------------------------------------------------
// Offseason activity-gate data sources
// ---------------------------------------------------------------------------
// Two thin reads that feed the pure shouldGenerateOffseason gate
// (lib/content-gen/activity-gate.ts): when offseason content was last generated
// for a season, and how many transactions have been synced since. Both degrade
// gracefully (null / 0) so a missing table or DB hiccup never blocks the cron.

// Recent generate-content runs scanned for the offseason watermark. Weekly
// cron, so this covers well over a year of runs across all seasons/states.
const GENERATION_LOG_SCAN = 200;

/**
 * The timestamp of the most recent SUCCESSFUL offseason generation for a
 * season, read from sync_log. Scoped to offseason runs (detailsJson.seasonType
 * === "off") so a preseason generation, which also writes season-scoped
 * hub_content in the same shared kinds, never pollutes the watermark; quiet
 * skip runs are excluded too (they generated no content). Null when this season
 * has never had a real offseason generation, which the gate treats as
 * "first run, generate". The scoping itself lives in the pure
 * selectLastOffseasonGenerationAt so it is unit-tested without a database.
 */
export async function getLastOffseasonGenerationAt(
  seasonId: number,
): Promise<Date | null> {
  try {
    const rows = await db
      .select({
        startedAt: syncLog.startedAt,
        completedAt: syncLog.completedAt,
        details: syncLog.detailsJson,
      })
      .from(syncLog)
      .where(
        and(
          eq(syncLog.syncType, "generate-content"),
          eq(syncLog.status, "success"),
        ),
      )
      .orderBy(desc(syncLog.startedAt))
      .limit(GENERATION_LOG_SCAN);

    return selectLastOffseasonGenerationAt(
      rows.map((r) => {
        const d = (r.details as Record<string, unknown> | null) ?? {};
        return {
          seasonType: d.seasonType,
          seasonId: d.seasonId,
          skipped: d.skipped,
          at: r.completedAt ?? r.startedAt ?? null,
        };
      }),
      seasonId,
    );
  } catch (e) {
    console.error("[content-activity] getLastOffseasonGenerationAt error:", e);
    return null;
  }
}

/**
 * Count of transactions for a season whose row was synced (created_at) strictly
 * after `since`. Uses the server-side createdAt (when the sync inserted the row)
 * rather than Sleeper's event time, so this answers exactly "how many new
 * transactions have shown up since we last generated". When `since` is null
 * (no prior content), returns the season's total transaction count.
 */
export async function countTransactionsSyncedSince(
  seasonId: number,
  since: Date | null,
): Promise<number> {
  try {
    const conditions = [eq(transactions.seasonId, seasonId)];
    if (since != null) conditions.push(gt(transactions.createdAt, since));
    const [row] = await db
      .select({ n: count() })
      .from(transactions)
      .where(and(...conditions));
    return row?.n ?? 0;
  } catch (e) {
    console.error("[content-activity] countTransactionsSyncedSince error:", e);
    return 0;
  }
}
