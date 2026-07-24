import { db } from "@/lib/db";
import { players, transactions } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

/** Transaction types that represent an off-waivers/free-agency add. */
const WAIVER_TYPES = ["waiver", "free_agent"] as const;

export interface PlayerLoreCount {
  playerId: string;
  playerName: string;
  position: string | null;
  count: number;
}

interface AddsRow {
  adds: Record<string, number> | null;
}

/** Counts how many transactions' adds map mention each player id. */
function countAdds(rows: AddsRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.adds) continue;
    for (const playerId of Object.keys(row.adds)) {
      counts.set(playerId, (counts.get(playerId) ?? 0) + 1);
    }
  }
  return counts;
}

async function resolveTopN(counts: Map<string, number>, limit: number): Promise<PlayerLoreCount[]> {
  if (counts.size === 0) return [];

  // Secondary sort by playerId is a deterministic tie-break: the live data
  // ties at the top (e.g. Doubs/Jefferson/Hopkins all at 3 trades), and a map
  // scan order alone is not guaranteed stable across requests, which would
  // make a limit=1 "most traded" card flicker between page loads.
  const topIds = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([playerId]) => playerId);

  if (topIds.length === 0) return [];

  const playerRows = await db
    .select({ id: players.id, fullName: players.fullName, position: players.position })
    .from(players)
    .where(inArray(players.id, topIds));
  const playerInfo = new Map(playerRows.map((p) => [p.id, p]));

  return topIds.map((playerId) => {
    const info = playerInfo.get(playerId);
    return {
      playerId,
      playerName: info?.fullName ?? "Unknown Player",
      position: info?.position ?? null,
      count: counts.get(playerId)!,
    };
  });
}

/**
 * The most-traded players in league history: how many completed trades'
 * adds map mentioned each player. Live-data check: Doubs/Jefferson/Hopkins
 * top out at 3 trades apiece.
 */
export async function getMostTradedPlayers(limit = 3): Promise<PlayerLoreCount[]> {
  try {
    const rows = await db
      .select({ adds: transactions.adds })
      .from(transactions)
      .where(eq(transactions.type, "trade"));

    const counts = countAdds(rows as unknown as AddsRow[]);
    return resolveTopN(counts, limit);
  } catch (error) {
    console.error("[player-lore] getMostTradedPlayers error:", error);
    return [];
  }
}

/**
 * The most add-churned players in league history: how many waiver/free-agent
 * transactions' adds map mentioned each player, i.e. "Waiver Yo-Yo" energy.
 * Deliberately excludes trades and commissioner moves so the count matches
 * the "added off waivers and free agency" copy on the card.
 */
export async function getMostChurnedPlayers(limit = 3): Promise<PlayerLoreCount[]> {
  try {
    const rows = await db
      .select({ adds: transactions.adds })
      .from(transactions)
      .where(inArray(transactions.type, WAIVER_TYPES));

    const counts = countAdds(rows as unknown as AddsRow[]);
    return resolveTopN(counts, limit);
  } catch (error) {
    console.error("[player-lore] getMostChurnedPlayers error:", error);
    return [];
  }
}
