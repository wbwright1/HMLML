import { db } from "@/lib/db";
import { playerValues } from "@/lib/db/schema";
import { inArray, and, lte, asc, desc } from "drizzle-orm";

export interface AssetValue {
  assetId: string;
  value: number;
  overallRank: number | null;
  positionRank: number | null;
  trend30Day: number | null;
  position: string | null;
  name: string | null;
  source: string;
  snapshotDate: string;
}

/** Formats a Date or date-string input as a yyyy-mm-dd string for comparison
 * against the `snapshot_date` column. */
function toDateString(atDate: Date | string): string {
  if (typeof atDate === "string") return atDate.slice(0, 10);
  return atDate.toISOString().slice(0, 10);
}

/**
 * Returns the latest known value per asset, across all sources. When both
 * sources have a row on the same snapshot date, fantasycalc wins: it is the
 * live daily feed and carries ranks/trend/redraft data that the historical
 * dynastyprocess backfill does not.
 */
export async function getLatestValues(
  assetIds: string[]
): Promise<Map<string, AssetValue>> {
  if (assetIds.length === 0) return new Map();

  const rows = await db
    .select({
      assetId: playerValues.assetId,
      value: playerValues.value,
      overallRank: playerValues.overallRank,
      positionRank: playerValues.positionRank,
      trend30Day: playerValues.trend30Day,
      position: playerValues.position,
      name: playerValues.name,
      source: playerValues.source,
      snapshotDate: playerValues.snapshotDate,
    })
    .from(playerValues)
    .where(inArray(playerValues.assetId, assetIds))
    .orderBy(
      asc(playerValues.assetId),
      desc(playerValues.snapshotDate),
      // 'fantasycalc' > 'dynastyprocess' lexically ('f' > 'd'), so ordering
      // source DESC surfaces fantasycalc first on a tied snapshot date.
      desc(playerValues.source)
    );

  const map = new Map<string, AssetValue>();
  for (const row of rows) {
    if (!map.has(row.assetId)) {
      map.set(row.assetId, row as AssetValue);
    }
  }
  return map;
}

/**
 * Returns the nearest on-or-before value per asset relative to `atDate`. On a
 * tied snapshot date, dynastyprocess is preferred: it is the historical
 * backfill source and is the more likely to actually exist for old dates,
 * whereas fantasycalc only has same-day data from the day the daily sync ran.
 */
export async function getValuesForAssets(
  assetIds: string[],
  atDate: Date | string
): Promise<Map<string, AssetValue>> {
  if (assetIds.length === 0) return new Map();

  const dateStr = toDateString(atDate);

  const rows = await db
    .select({
      assetId: playerValues.assetId,
      value: playerValues.value,
      overallRank: playerValues.overallRank,
      positionRank: playerValues.positionRank,
      trend30Day: playerValues.trend30Day,
      position: playerValues.position,
      name: playerValues.name,
      source: playerValues.source,
      snapshotDate: playerValues.snapshotDate,
    })
    .from(playerValues)
    .where(
      and(
        inArray(playerValues.assetId, assetIds),
        lte(playerValues.snapshotDate, dateStr)
      )
    )
    .orderBy(
      asc(playerValues.assetId),
      desc(playerValues.snapshotDate),
      asc(playerValues.source)
    );

  const map = new Map<string, AssetValue>();
  for (const row of rows) {
    if (!map.has(row.assetId)) {
      map.set(row.assetId, row as AssetValue);
    }
  }
  return map;
}

/**
 * Maps a traded draft pick to the FantasyCalc pseudo-id its value would be
 * stored under (e.g. { season: "2026", round: 1 } -> "FP_2026_1"). Pure
 * function: returns null when season isn't a finite year or round isn't a
 * positive integer.
 */
export function pickAssetToValueId(pick: {
  season: string;
  round: number;
}): string | null {
  const year = Number(pick.season);
  if (!Number.isFinite(year)) return null;
  if (!Number.isInteger(pick.round) || pick.round < 1) return null;
  return `FP_${pick.season}_${pick.round}`;
}
