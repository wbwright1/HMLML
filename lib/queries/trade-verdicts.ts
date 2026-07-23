import { db } from "@/lib/db";
import { hubContent } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Trade verdicts (read side)
// ---------------------------------------------------------------------------
// Site Desk "who won this trade" asides are generated into hub_content as
// `trade_verdict` rows keyed by the trade's transaction id in refKey (see
// lib/content-gen/templates.ts). The /trades page reads them here and attaches
// each verdict to its trade card. Season-scoped, generated during the offseason
// pass; they persist across state transitions until the next offseason run
// refreshes them, so verdicts show year-round.

/**
 * Returns a map of transaction id (as string) -> verdict body for every
 * published trade_verdict row. Cross-season: verdicts are keyed by the globally
 * unique transaction id, so every trade card can resolve its own verdict
 * regardless of which season's generation pass produced it. Never throws: on
 * any DB error (including the table not existing yet) it returns an empty map so
 * the trades page simply renders without verdicts.
 */
export async function getTradeVerdicts(): Promise<Map<string, string>> {
  const verdicts = new Map<string, string>();
  try {
    const rows = await db
      .select({ refKey: hubContent.refKey, body: hubContent.body })
      .from(hubContent)
      .where(
        and(
          eq(hubContent.kind, "trade_verdict"),
          eq(hubContent.status, "published"),
        ),
      )
      .orderBy(hubContent.id);

    for (const row of rows) {
      // Last write wins if the same trade somehow has more than one row.
      if (row.refKey && row.body) verdicts.set(row.refKey, row.body);
    }
  } catch (e) {
    // Benign when hub_content has not been migrated yet; other errors are surfaced.
    console.error("[trade-verdicts] getTradeVerdicts error:", e);
  }
  return verdicts;
}
