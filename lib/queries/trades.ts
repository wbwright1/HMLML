import { db } from "@/lib/db";
import { transactions, franchiseSeasons, franchises, players, seasons, draftPicks } from "@/lib/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { isVoidedPick } from "@/lib/voided-picks";

interface DraftPickInvolved {
  season: string;
  round: number;
  roster_id: number;
  previous_owner_id: number;
  owner_id: number;
}

export interface FranchiseInfo {
  id: string;
  name: string;
  slug: string;
  abbreviation?: string;
  brandingColor?: string;
  avatarUrl?: string | null;
}

/** What a traded pick became once its draft completed. */
export interface PickBecame {
  id: string | null;
  name: string;
}

/**
 * A draft pick moved in a trade, enriched with (a) the crest of the franchise
 * whose original draft slot it was, and (b) which player the pick became once
 * that draft completed (null for future/incomplete drafts or legacy-era picks).
 * When the receiving team later traded this same pick onward, `flippedToTradeId`
 * points at that later trade so the card can link down the chain instead of
 * implying the "became" player was part of this team's haul.
 */
export interface PickAsset {
  season: string;
  round: number;
  originalFranchise: FranchiseInfo | null;
  became: PickBecame | null;
  flippedToTradeId: number | null;
  /**
   * True when this pick was traded in a deal that predates the 2023 startup
   * redraft but names a pick for the redraft season or later: that pick never
   * conveyed, since the redraft reset the board. `became` and
   * `flippedToTradeId` are always null on a voided pick; it is also excluded
   * from `movementsByKey` so it can never source or receive real flip credit.
   */
  voided: boolean;
}

interface TradeSide {
  franchise: FranchiseInfo | null;
  rosterId: string;
  players: Array<{ id: string; name: string; position: string | null; nflTeam: string | null }>;
  picks: PickAsset[];
  /**
   * How many assets this side GAVE UP in the deal (players dropped + picks
   * sent). Used to dilute flip-chain credit in hindsight grading: a pick
   * flipped into a later trade earns 1/gaveAssetCount of that trade's haul.
   */
  gaveAssetCount: number;
}

// ---------------------------------------------------------------------------
// Pure pick-provenance resolution (unit-tested in trades.test.ts)
// ---------------------------------------------------------------------------

/** Lookup tables resolved once per getTrades() call, keyed for O(1) access. */
export interface PickResolutionMaps {
  /** seasonYear -> seasons.id */
  seasonYearToId: Map<number, number>;
  /** `${seasonId}:${rosterId}` -> franchise that held that roster slot that season */
  franchiseBySeasonRoster: Map<string, FranchiseInfo>;
  /** `${seasonId}:${round}:${originalFranchiseId}` -> the pick's resulting player */
  draftPickByKey: Map<string, { playerId: string | null; playerName: string | null }>;
}

/**
 * Resolves a raw Sleeper draft-pick asset into a display-ready PickAsset.
 *
 * Origin crest: resolve `roster_id` (the original slot owner) against the
 * pick's OWN season's franchise_seasons; if that season row doesn't exist yet
 * (e.g. a future pick traded before its season is set up), fall back to the
 * trade's season, else no crest.
 *
 * "Became" player: only when the pick's own season resolves a franchise and a
 * matching completed draft_picks row exists (originalFranchiseId = that
 * franchise, same round). Otherwise null (plain pick text), covering future or
 * incomplete drafts and the legacy era.
 *
 * Pure: takes prebuilt maps, touches no I/O.
 */
export function resolvePickAsset(
  raw: { season: string; round: number; roster_id: number },
  tradeSeasonId: number,
  maps: PickResolutionMaps
): PickAsset {
  const pickSeasonYear = Number(raw.season);
  const pickSeasonId = Number.isFinite(pickSeasonYear)
    ? maps.seasonYearToId.get(pickSeasonYear)
    : undefined;

  const pickSeasonFranchise =
    pickSeasonId !== undefined
      ? maps.franchiseBySeasonRoster.get(`${pickSeasonId}:${raw.roster_id}`) ?? null
      : null;
  const fallbackFranchise =
    maps.franchiseBySeasonRoster.get(`${tradeSeasonId}:${raw.roster_id}`) ?? null;

  const originalFranchise = pickSeasonFranchise ?? fallbackFranchise;

  let became: PickBecame | null = null;
  if (pickSeasonId !== undefined && pickSeasonFranchise) {
    const dp = maps.draftPickByKey.get(
      `${pickSeasonId}:${raw.round}:${pickSeasonFranchise.id}`
    );
    if (dp && (dp.playerId || dp.playerName)) {
      became = { id: dp.playerId, name: dp.playerName ?? "Unknown Player" };
    }
  }

  return {
    season: raw.season,
    round: raw.round,
    originalFranchise,
    became,
    flippedToTradeId: null,
    voided: false,
  };
}

// ---------------------------------------------------------------------------
// Pure pick-flip detection (unit-tested in trades.test.ts)
// ---------------------------------------------------------------------------

/** One movement of a pick asset through a completed trade. */
export interface PickMovement {
  tradeId: number;
  /** Sleeper trade timestamp (ms). */
  timestamp: number;
  /** The sending side, resolved to a franchise when possible. */
  fromFranchiseId: string | null;
  fromRosterId: number;
}

/**
 * Identity of a pick asset across trades: Sleeper keys a traded pick by its
 * draft season, round, and original slot owner, so the same triple appearing
 * in two trades is the same physical pick moving again.
 */
export function pickMovementKey(p: {
  season: string;
  round: number;
  roster_id: number;
}): string {
  return `${p.season}:${p.round}:${p.roster_id}`;
}

/**
 * Finds the trade in which a received pick was traded onward by its receiver:
 * the earliest strictly-later movement of the same pick where the sender is
 * the receiving team. Sides are compared by franchise id when both resolve
 * (roster ids aren't guaranteed stable across Sleeper league years), falling
 * back to raw roster ids otherwise. Returns that trade's id, or null if the
 * receiver kept the pick (or ordering is unknowable because the receiving
 * trade has no timestamp).
 */
export function findPickFlip(
  movementsByKey: Map<string, PickMovement[]>,
  received: {
    pickKey: string;
    tradeId: number;
    timestamp: number | null;
    franchiseId: string | null;
    rosterId: number;
  }
): number | null {
  if (received.timestamp === null) return null;
  const movements = movementsByKey.get(received.pickKey);
  if (!movements) return null;

  let flip: PickMovement | null = null;
  for (const m of movements) {
    if (m.tradeId === received.tradeId) continue;
    if (m.timestamp <= received.timestamp) continue;
    const senderMatches =
      m.fromFranchiseId !== null && received.franchiseId !== null
        ? m.fromFranchiseId === received.franchiseId
        : m.fromRosterId === received.rosterId;
    if (!senderMatches) continue;
    if (flip === null || m.timestamp < flip.timestamp) flip = m;
  }

  return flip?.tradeId ?? null;
}

/**
 * Display filter over an already-resolved trade list. Pages that also grade
 * trades should fetch getTrades() UNFILTERED (grading needs full cross-season
 * flip-chain context) and narrow the visible list with this.
 */
export function filterTrades(
  trades: Trade[],
  { seasonYear, franchiseId }: { seasonYear?: number; franchiseId?: string }
): Trade[] {
  let result = trades;
  if (seasonYear !== undefined) {
    result = result.filter((t) => t.seasonYear === seasonYear);
  }
  if (franchiseId !== undefined) {
    result = result.filter((t) =>
      t.sides.some((side) => side.franchise?.id === franchiseId)
    );
  }
  return result;
}

export interface Trade {
  id: number;
  seasonYear: number;
  date: string;
  /** Raw Sleeper trade timestamp (ms), for age-gating hindsight grades. */
  createdAtMs: number | null;
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
): Promise<{
  bySeason: Map<number, Map<string, FranchiseInfo>>;
  flat: Map<string, FranchiseInfo>;
}> {
  const bySeason = new Map<number, Map<string, FranchiseInfo>>();
  const flat = new Map<string, FranchiseInfo>();
  if (seasonIds.length === 0) return { bySeason, flat };

  const rows = await db
    .select({
      seasonId: franchiseSeasons.seasonId,
      rosterId: franchiseSeasons.rosterId,
      franchiseId: franchises.id,
      name: franchises.name,
      slug: franchises.slug,
      abbreviation: franchises.abbreviation,
      brandingColor: franchises.brandingColor,
      avatarUrl: franchiseSeasons.avatarUrl,
    })
    .from(franchiseSeasons)
    .innerJoin(franchises, eq(franchiseSeasons.franchiseId, franchises.id))
    .where(inArray(franchiseSeasons.seasonId, seasonIds));

  for (const row of rows) {
    const info: FranchiseInfo = {
      id: row.franchiseId,
      name: row.name,
      slug: row.slug,
      abbreviation: row.abbreviation ?? undefined,
      brandingColor: row.brandingColor ?? undefined,
      avatarUrl: row.avatarUrl,
    };
    if (!bySeason.has(row.seasonId)) {
      bySeason.set(row.seasonId, new Map());
    }
    bySeason.get(row.seasonId)!.set(row.rosterId, info);
    flat.set(`${row.seasonId}:${row.rosterId}`, info);
  }

  return { bySeason, flat };
}

/**
 * Builds the `${seasonId}:${round}:${originalFranchiseId}` -> resulting player
 * index for #58 "pick became player". originalFranchiseId is populated on
 * every draft_picks row (including "came home" picks, where the original slot
 * owner and the drafter are the same franchise), so no non-null filter is
 * needed here.
 */
async function getDraftPickIndex(
  seasonIds: number[]
): Promise<Map<string, { playerId: string | null; playerName: string | null }>> {
  const map = new Map<string, { playerId: string | null; playerName: string | null }>();
  if (seasonIds.length === 0) return map;

  const rows = await db
    .select({
      seasonId: draftPicks.seasonId,
      round: draftPicks.round,
      originalFranchiseId: draftPicks.originalFranchiseId,
      playerId: draftPicks.playerId,
      playerName: draftPicks.playerName,
    })
    .from(draftPicks)
    .where(inArray(draftPicks.seasonId, seasonIds));

  for (const r of rows) {
    map.set(`${r.seasonId}:${r.round}:${r.originalFranchiseId}`, {
      playerId: r.playerId,
      playerName: r.playerName,
    });
  }

  return map;
}

/**
 * Returns completed trades (type='trade', status='complete'), newest first,
 * with franchise and player names resolved. Optionally filtered by season
 * and/or franchise; both filters happen in JS after resolution, since a
 * franchise's involvement is only knowable from rosterIds/adds/picks, and
 * pick-flip detection needs the full cross-season trade history.
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
    // Always fetch ALL completed trades, even when a season filter is set:
    // pick-flip detection needs the full history (a pick received in 2025 may
    // be flipped in a 2026 trade). Season filtering happens in JS at the end,
    // alongside the franchise filter.
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
      .where(
        and(eq(transactions.type, "trade"), eq(transactions.status, "complete"))
      )
      .orderBy(desc(transactions.createdAtSleeper));

    if (rows.length === 0) return [];

    // seasonYear -> seasonId, seeded from the trade rows themselves.
    const seasonYearToId = new Map<number, number>();
    for (const row of rows) seasonYearToId.set(row.seasonYear, row.seasonId);

    // Pick assets can reference a season different from the trade's (e.g. a
    // 2025 trade of a 2026 pick). Gather those years and resolve any not
    // already known from the trade rows.
    const pickSeasonYears = new Set<number>();
    for (const row of rows) {
      const picks = (row.draftPicksInvolved as DraftPickInvolved[] | null) ?? [];
      for (const p of picks) {
        const y = Number(p.season);
        if (Number.isFinite(y)) pickSeasonYears.add(y);
      }
    }
    const unknownYears = Array.from(pickSeasonYears).filter(
      (y) => !seasonYearToId.has(y)
    );
    if (unknownYears.length > 0) {
      const seasonRows = await db
        .select({ id: seasons.id, seasonYear: seasons.seasonYear })
        .from(seasons)
        .where(inArray(seasons.seasonYear, unknownYears));
      for (const s of seasonRows) seasonYearToId.set(s.seasonYear, s.id);
    }

    // Union of trade seasons and resolved pick seasons drives every downstream
    // lookup, so a pick's own-season franchise resolves even when no trade in
    // this result set happened that season.
    const tradeSeasonIds = rows.map((r) => r.seasonId);
    const pickSeasonIds = Array.from(pickSeasonYears)
      .map((y) => seasonYearToId.get(y))
      .filter((v): v is number => v !== undefined);
    const allSeasonIds = Array.from(new Set([...tradeSeasonIds, ...pickSeasonIds]));

    // Batch-fetch roster -> franchise maps (nested for trade sides, flat for
    // pick provenance) and the draft-pick "became" index in parallel.
    const [{ bySeason: rosterMapBySeason, flat: franchiseBySeasonRoster }, draftPickByKey] =
      await Promise.all([
        getRosterToFranchiseMapForSeasons(allSeasonIds),
        getDraftPickIndex(pickSeasonIds),
      ]);

    const pickMaps: PickResolutionMaps = {
      seasonYearToId,
      franchiseBySeasonRoster,
      draftPickByKey,
    };

    // Every pick movement across all trades, keyed by pick identity, for
    // "flipped later" detection. Senders resolve to franchises via the
    // sending trade's own season. Picks voided by the 2023 startup redraft
    // (traded before 2023 for a 2023+ season) are excluded entirely, so a
    // void pick can never be the source or target of a real pick's flip
    // lineage: this is the single source-level guard that keeps the grader,
    // offseason receipts, and content-gen from crediting a phantom flip.
    const movementsByKey = new Map<string, PickMovement[]>();
    for (const row of rows) {
      if (row.createdAtSleeper === null) continue;
      const picks = (row.draftPicksInvolved as DraftPickInvolved[] | null) ?? [];
      for (const p of picks) {
        if (isVoidedPick(row.seasonYear, p.season)) continue;
        const key = pickMovementKey(p);
        const list = movementsByKey.get(key) ?? [];
        list.push({
          tradeId: row.id,
          timestamp: row.createdAtSleeper,
          fromFranchiseId:
            franchiseBySeasonRoster.get(`${row.seasonId}:${p.previous_owner_id}`)
              ?.id ?? null,
          fromRosterId: p.previous_owner_id,
        });
        movementsByKey.set(key, list);
      }
    }

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

      const drops = (row.drops as Record<string, number> | null) ?? {};

      const sides: TradeSide[] = uniqueRosterIds.map((rosterIdNum) => {
        const rosterIdStr = String(rosterIdNum);
        const franchise = rosterMap.get(rosterIdStr) ?? null;

        const gaveAssetCount =
          Object.values(drops).filter((givingRosterId) => givingRosterId === rosterIdNum)
            .length + picks.filter((p) => p.previous_owner_id === rosterIdNum).length;

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
          .map((p) => {
            const voided = isVoidedPick(row.seasonYear, p.season);
            const resolved = resolvePickAsset(p, row.seasonId, pickMaps);
            if (voided) {
              // Never conveyed: no "became" resolution, and never a source or
              // target of flip-chain credit (see movementsByKey exclusion).
              return { ...resolved, became: null, flippedToTradeId: null, voided: true };
            }
            return {
              ...resolved,
              voided: false,
              flippedToTradeId: findPickFlip(movementsByKey, {
                pickKey: pickMovementKey(p),
                tradeId: row.id,
                timestamp: row.createdAtSleeper,
                franchiseId: franchise?.id ?? null,
                rosterId: rosterIdNum,
              }),
            };
          });

        return {
          franchise,
          rosterId: rosterIdStr,
          players: receivedPlayers,
          picks: receivedPicks,
          gaveAssetCount,
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
        createdAtMs: row.createdAtSleeper,
        week: row.week,
        sides,
      };
    });

    let result = trades;
    if (seasonId !== undefined) {
      const seasonIdByTradeId = new Map(rows.map((r) => [r.id, r.seasonId]));
      result = result.filter((trade) => seasonIdByTradeId.get(trade.id) === seasonId);
    }
    if (franchiseId !== undefined) {
      result = result.filter((trade) =>
        trade.sides.some((side) => side.franchise?.id === franchiseId)
      );
    }

    return result;
  } catch (error) {
    console.error("[trades] getTrades error:", error);
    return [];
  }
}
