import { db } from "@/lib/db";
import { transactions, franchiseSeasons, franchises, players, seasons } from "@/lib/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";

interface DraftPickInvolved {
  season: string;
  round: number;
  roster_id: number;
  previous_owner_id: number;
  owner_id: number;
}

interface FranchiseInfo {
  id: string;
  name: string;
  slug: string;
  abbreviation?: string;
  brandingColor?: string;
}

interface TradeSide {
  franchise: FranchiseInfo | null;
  rosterId: string;
  players: Array<{ id: string; name: string; position: string | null; nflTeam: string | null }>;
  picks: Array<{ season: string; round: number }>;
}

export interface Trade {
  id: number;
  seasonYear: number;
  date: string;
  week: number | null;
  sides: TradeSide[];
}

interface GetTradesParams {
  seasonId?: number;
  franchiseId?: string;
}

/**
 * Builds a batched roster_id -> franchise map across multiple seasons, joined
 * to franchise branding. Unlike getRosterToFranchiseMap (single-season, no
 * branding), this is used for rendering trade cards which may span seasons.
 */
async function getRosterToFranchiseMapForSeasons(
  seasonIds: number[]
): Promise<Map<number, Map<string, FranchiseInfo>>> {
  const result = new Map<number, Map<string, FranchiseInfo>>();
  if (seasonIds.length === 0) return result;

  const rows = await db
    .select({
      seasonId: franchiseSeasons.seasonId,
      rosterId: franchiseSeasons.rosterId,
      franchiseId: franchises.id,
      name: franchises.name,
      slug: franchises.slug,
      abbreviation: franchises.abbreviation,
      brandingColor: franchises.brandingColor,
    })
    .from(franchiseSeasons)
    .innerJoin(franchises, eq(franchiseSeasons.franchiseId, franchises.id))
    .where(inArray(franchiseSeasons.seasonId, seasonIds));

  for (const row of rows) {
    if (!result.has(row.seasonId)) {
      result.set(row.seasonId, new Map());
    }
    result.get(row.seasonId)!.set(row.rosterId, {
      id: row.franchiseId,
      name: row.name,
      slug: row.slug,
      abbreviation: row.abbreviation ?? undefined,
      brandingColor: row.brandingColor ?? undefined,
    });
  }

  return result;
}

/**
 * Returns completed trades (type='trade', status='complete'), newest first,
 * with franchise and player names resolved. Optionally filtered by season
 * and/or franchise (franchise filtering happens in JS after resolution,
 * since a franchise's involvement is only knowable from rosterIds/adds/picks).
 *
 * Note: Sleeper's `waiver_budget` (FAAB) field is dropped by Zod validation
 * at sync time (lib/sleeper-schemas.ts) and is not stored, so FAAB amounts
 * involved in a trade cannot be displayed. Out of scope for this page.
 */
export async function getTrades({
  seasonId,
  franchiseId,
}: GetTradesParams = {}): Promise<Trade[]> {
  try {
    const whereConditions = [
      eq(transactions.type, "trade"),
      eq(transactions.status, "complete"),
    ];
    if (seasonId !== undefined) {
      whereConditions.push(eq(transactions.seasonId, seasonId));
    }

    const rows = await db
      .select({
        id: transactions.id,
        seasonId: transactions.seasonId,
        seasonYear: seasons.seasonYear,
        week: transactions.week,
        rosterIds: transactions.rosterIds,
        adds: transactions.adds,
        drops: transactions.drops,
        draftPicksInvolved: transactions.draftPicksInvolved,
        createdAtSleeper: transactions.createdAtSleeper,
      })
      .from(transactions)
      .innerJoin(seasons, eq(transactions.seasonId, seasons.id))
      .where(and(...whereConditions))
      .orderBy(desc(transactions.createdAtSleeper));

    if (rows.length === 0) return [];

    // Batch-fetch roster -> franchise maps for all seasons involved.
    const seasonIds = Array.from(new Set(rows.map((r) => r.seasonId)));
    const rosterMapBySeason = await getRosterToFranchiseMapForSeasons(seasonIds);

    // Batch-fetch player names/positions/teams for all players involved.
    const allPlayerIds = new Set<string>();
    for (const row of rows) {
      const adds = row.adds as Record<string, number> | null;
      if (adds) Object.keys(adds).forEach((id) => allPlayerIds.add(id));
    }

    const playerMap = new Map<
      string,
      { name: string; position: string | null; nflTeam: string | null }
    >();
    if (allPlayerIds.size > 0) {
      const playerRows = await db
        .select({
          id: players.id,
          fullName: players.fullName,
          position: players.position,
          nflTeam: players.nflTeam,
        })
        .from(players)
        .where(inArray(players.id, Array.from(allPlayerIds)));

      for (const p of playerRows) {
        playerMap.set(p.id, {
          name: p.fullName ?? "Unknown Player",
          position: p.position,
          nflTeam: p.nflTeam,
        });
      }
    }

    const trades: Trade[] = rows.map((row) => {
      const rosterMap = rosterMapBySeason.get(row.seasonId) ?? new Map();
      const rosterIds = (row.rosterIds as number[] | null) ?? [];
      const adds = (row.adds as Record<string, number> | null) ?? {};
      const picks = (row.draftPicksInvolved as DraftPickInvolved[] | null) ?? [];

      const uniqueRosterIds = Array.from(new Set(rosterIds));

      const sides: TradeSide[] = uniqueRosterIds.map((rosterIdNum) => {
        const rosterIdStr = String(rosterIdNum);
        const franchise = rosterMap.get(rosterIdStr) ?? null;

        const receivedPlayers = Object.entries(adds)
          .filter(([, receivingRosterId]) => receivingRosterId === rosterIdNum)
          .map(([playerId]) => {
            const info = playerMap.get(playerId);
            return {
              id: playerId,
              name: info?.name ?? "Unknown Player",
              position: info?.position ?? null,
              nflTeam: info?.nflTeam ?? null,
            };
          });

        const receivedPicks = picks
          .filter((p) => p.owner_id === rosterIdNum)
          .map((p) => ({ season: p.season, round: p.round }));

        return {
          franchise,
          rosterId: rosterIdStr,
          players: receivedPlayers,
          picks: receivedPicks,
        };
      });

      const date = row.createdAtSleeper
        ? new Date(row.createdAtSleeper).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "Unknown date";

      return {
        id: row.id,
        seasonYear: row.seasonYear,
        date,
        week: row.week,
        sides,
      };
    });

    if (franchiseId !== undefined) {
      return trades.filter((trade) =>
        trade.sides.some((side) => side.franchise?.id === franchiseId)
      );
    }

    return trades;
  } catch (error) {
    console.error("[trades] getTrades error:", error);
    return [];
  }
}
