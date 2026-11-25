import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { seasons, transactions } from "@/lib/db/schema";
import { resolvePickOwners, type PickMove } from "@/lib/pick-ownership";
import { isVoidedPick } from "@/lib/voided-picks";

interface DraftPickInvolved {
  season: string;
  round: number;
  roster_id: number;
  owner_id: number;
}

/**
 * Current owner roster of every traded pick in one draft season, from the
 * league's completed trades (Postgres only; no live Sleeper call). Keyed by
 * pickKey(round, originalRosterId); see lib/pick-ownership.ts. DB errors
 * propagate to the caller's rethrowUnlessTolerable guard.
 */
export async function getPickOwners(draftSeason: number): Promise<Map<string, number>> {
  const rows = await db
    .select({
      picks: transactions.draftPicksInvolved,
      createdAtSleeper: transactions.createdAtSleeper,
      createdAt: transactions.createdAt,
      tradeSeasonYear: seasons.seasonYear,
    })
    .from(transactions)
    .innerJoin(seasons, eq(transactions.seasonId, seasons.id))
    .where(
      and(
        eq(transactions.type, "trade"),
        eq(transactions.status, "complete"),
        isNotNull(transactions.draftPicksInvolved),
      ),
    );

  const moves: PickMove[] = [];
  for (const row of rows) {
    const picks = Array.isArray(row.picks) ? (row.picks as DraftPickInvolved[]) : [];
    const at = row.createdAtSleeper ?? (row.createdAt ? row.createdAt.getTime() : 0);
    for (const p of picks) {
      if (isVoidedPick(row.tradeSeasonYear, p.season)) continue;
      moves.push({ season: p.season, round: p.round, rosterId: p.roster_id, ownerId: p.owner_id, at });
    }
  }
  return resolvePickOwners(moves, draftSeason);
}
