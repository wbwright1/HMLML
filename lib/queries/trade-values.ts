import type { Trade } from "@/lib/queries/trades";
import {
  getLatestValues,
  getValuesForAssets,
  pickAssetToValueId,
} from "@/lib/queries/player-values";

/**
 * Dynasty market value snapshot for one side of a trade: purely
 * presentational context, never an input to hindsight grading.
 */
export interface TradeValueSide {
  rosterId: string;
  /** Combined dynasty value of this side's haul at the time of the trade. */
  then: number | null;
  /** Combined current dynasty value of this side's haul. */
  now: number | null;
  /**
   * "full": every asset has both a then and a now value.
   * "partial": every asset has a now value, but not all have a then value
   * (picks never have historical values, so any pick makes a side partial
   * unless it already became a player and that player predates the trade).
   * "none": at least one asset is missing a now value entirely, or the side
   * has no valued assets (FAAB-only).
   */
  coverage: "full" | "partial" | "none";
}

export interface TradeValueSummary {
  sides: TradeValueSide[];
}

/** One asset on a trade side, resolved to the id its value is stored under. */
interface SideAsset {
  /** The player_values.asset_id to look up ("now"), or null if unresolvable. */
  valueId: string | null;
  /** Picks never carry a historical "then" value; only players do. */
  isPick: boolean;
}

function toUtcDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function sideAssets(side: Trade["sides"][number]): SideAsset[] {
  const assets: SideAsset[] = side.players.map((p) => ({
    valueId: p.id,
    isPick: false,
  }));
  for (const pick of side.picks) {
    const valueId = pick.became?.id ?? pickAssetToValueId(pick);
    assets.push({ valueId, isPick: true });
  }
  return assets;
}

/**
 * Batched "then vs now" dynasty value summary for a list of trades. Never
 * throws: any failure returns an empty map so trade cards simply omit the
 * value block.
 */
export async function getTradeValues(
  trades: Trade[]
): Promise<Map<number, TradeValueSummary>> {
  const result = new Map<number, TradeValueSummary>();
  if (trades.length === 0) return result;

  try {
    // Precompute each trade's per-side assets once.
    const assetsByTrade = new Map<number, Map<string, SideAsset[]>>();
    const nowIds = new Set<string>();
    const dateKeys = new Map<number, string>(); // tradeId -> UTC date key

    for (const trade of trades) {
      const bySide = new Map<string, SideAsset[]>();
      for (const side of trade.sides) {
        const assets = sideAssets(side);
        bySide.set(side.rosterId, assets);
        for (const a of assets) {
          if (a.valueId) nowIds.add(a.valueId);
        }
      }
      assetsByTrade.set(trade.id, bySide);
      if (trade.createdAtMs !== null) {
        dateKeys.set(trade.id, toUtcDateKey(trade.createdAtMs));
      }
    }

    // Group trades by distinct UTC date, unioning "then"-eligible (player,
    // non-pick) asset ids per date, then fetch one snapshot per date.
    const idsByDate = new Map<string, Set<string>>();
    for (const trade of trades) {
      const dateKey = dateKeys.get(trade.id);
      if (dateKey === undefined) continue;
      const bySide = assetsByTrade.get(trade.id)!;
      const set = idsByDate.get(dateKey) ?? new Set<string>();
      for (const assets of bySide.values()) {
        for (const a of assets) {
          if (!a.isPick && a.valueId) set.add(a.valueId);
        }
      }
      idsByDate.set(dateKey, set);
    }

    const [nowValues, thenByDate] = await Promise.all([
      getLatestValues(Array.from(nowIds)),
      (async () => {
        const map = new Map<string, Awaited<ReturnType<typeof getValuesForAssets>>>();
        await Promise.all(
          Array.from(idsByDate.entries()).map(async ([dateKey, ids]) => {
            map.set(dateKey, await getValuesForAssets(Array.from(ids), dateKey));
          })
        );
        return map;
      })(),
    ]);

    for (const trade of trades) {
      const bySide = assetsByTrade.get(trade.id)!;
      const dateKey = dateKeys.get(trade.id);
      const thenValues = dateKey !== undefined ? thenByDate.get(dateKey) : undefined;

      const sides: TradeValueSide[] = trade.sides.map((side) => {
        const assets = bySide.get(side.rosterId) ?? [];

        if (assets.length === 0) {
          return { rosterId: side.rosterId, then: null, now: null, coverage: "none" };
        }

        const nows = assets.map((a) => (a.valueId ? nowValues.get(a.valueId) : undefined));
        const allHaveNow = nows.every((v) => v !== undefined);
        if (!allHaveNow) {
          return { rosterId: side.rosterId, then: null, now: null, coverage: "none" };
        }

        const thens = assets.map((a) =>
          !a.isPick && a.valueId && thenValues ? thenValues.get(a.valueId) : undefined
        );
        const allHaveThen = thens.every((v) => v !== undefined);

        const nowSum = nows.reduce((sum, v) => sum + (v?.value ?? 0), 0);

        if (allHaveThen) {
          const thenSum = thens.reduce((sum, v) => sum + (v?.value ?? 0), 0);
          return { rosterId: side.rosterId, then: thenSum, now: nowSum, coverage: "full" };
        }

        return { rosterId: side.rosterId, then: null, now: nowSum, coverage: "partial" };
      });

      result.set(trade.id, { sides });
    }

    return result;
  } catch (error) {
    console.error("[trade-values] getTradeValues error:", error);
    return new Map();
  }
}
