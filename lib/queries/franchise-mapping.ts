import { db } from "@/lib/db";
import { franchiseSeasons } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Builds the roster_id -> franchise_id map for a season (stable across weeks),
 * used by the sync pipeline to attribute Sleeper roster data to franchises.
 *
 * Intentionally does NOT swallow errors: sync callers run this inside their own
 * try/catch and must be able to log a failed sync rather than silently
 * proceeding with an empty map.
 */
export async function getRosterToFranchiseMap(
  seasonId: number
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      rosterId: franchiseSeasons.rosterId,
      franchiseId: franchiseSeasons.franchiseId,
    })
    .from(franchiseSeasons)
    .where(eq(franchiseSeasons.seasonId, seasonId));

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.rosterId, row.franchiseId);
  }
  return map;
}
