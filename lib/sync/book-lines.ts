import { db } from "@/lib/db";
import { bookLines, matchups } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { priceGame } from "@/lib/book/pricing";
import {
  getRosterKickoffStates,
  getWeekProjectedTotals,
  pairRosterIds,
} from "@/lib/queries/book";

export interface RepriceResult {
  /** book_lines rows written or refreshed. */
  rowCount: number;
  /** Games left alone because they are already under way. */
  lockedSkipped: number;
  /** Games with no usable projection on one side, so no honest price exists. */
  unpriceable: number;
}

/**
 * Prices (and re-prices) The Book's lines for one week.
 *
 * Runs from the hourly sync. Every line for the week is recomputed from the
 * latest projections and upserted in place, EXCEPT games that have already
 * kicked off: once a starter is on the field the line is booked history, and
 * moving it would retroactively change what people bet into. Lock state comes
 * from real NFL game status (nfl_games), never from a points heuristic.
 *
 * "home" is the lower roster id of the pairing (see lib/book/pricing.ts), so a
 * pairing prices the same way every run and the stored spread's sign is stable.
 *
 * A game whose projections are missing on either side is skipped rather than
 * priced off a zero, which would post a fictional 100-point favorite.
 */
export async function repriceBookLines(
  seasonId: number,
  seasonYear: number,
  week: number,
): Promise<RepriceResult> {
  const rows = await db
    .select({
      matchupId: matchups.matchupId,
      rosterId: matchups.rosterId,
    })
    .from(matchups)
    .where(and(eq(matchups.seasonId, seasonId), eq(matchups.week, week)));

  if (rows.length === 0) {
    return { rowCount: 0, lockedSkipped: 0, unpriceable: 0 };
  }

  const byMatchup = new Map<number, string[]>();
  for (const row of rows) {
    const list = byMatchup.get(row.matchupId) ?? [];
    list.push(row.rosterId);
    byMatchup.set(row.matchupId, list);
  }

  const projections = await getWeekProjectedTotals(seasonId, seasonYear, week);
  const kickoffs = await getRosterKickoffStates(seasonId, seasonYear, week);

  let rowCount = 0;
  let lockedSkipped = 0;
  let unpriceable = 0;

  for (const [matchupId, rosterIds] of byMatchup) {
    const pair = pairRosterIds(rosterIds);
    if (!pair) {
      unpriceable++;
      continue;
    }
    const [homeRosterId, awayRosterId] = pair;

    if (
      kickoffs.get(homeRosterId)?.started ||
      kickoffs.get(awayRosterId)?.started
    ) {
      lockedSkipped++;
      continue;
    }

    const homeProjected = projections.get(homeRosterId);
    const awayProjected = projections.get(awayRosterId);
    if (!homeProjected || !awayProjected) {
      unpriceable++;
      continue;
    }

    const price = priceGame(homeProjected, awayProjected);

    await db
      .insert(bookLines)
      .values({
        seasonId,
        week,
        matchupId,
        homeRosterId,
        awayRosterId,
        spread: price.spread,
        mlHome: price.mlHome,
        mlAway: price.mlAway,
        homeProjected,
        awayProjected,
        pricedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [bookLines.seasonId, bookLines.week, bookLines.matchupId],
        set: {
          homeRosterId,
          awayRosterId,
          spread: price.spread,
          mlHome: price.mlHome,
          mlAway: price.mlAway,
          homeProjected,
          awayProjected,
          pricedAt: new Date(),
        },
      });

    rowCount++;
  }

  return { rowCount, lockedSkipped, unpriceable };
}
