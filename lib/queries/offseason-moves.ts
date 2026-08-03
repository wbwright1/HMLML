import { db } from "@/lib/db";
import { draftPicks, franchises, players } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getTrades, type Trade } from "@/lib/queries/trades";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
// Real, citable offseason activity per franchise: what they actually drafted
// (round/position/pick order) and what they actually traded (who gave up what
// for what). Everything here is sourced straight from draft_picks and
// transactions; nothing is fabricated. Used so hub offseason receipts can cite
// a real pick or a real trade instead of leaning on projection-only framing.

export interface OffseasonDraftPick {
  playerName: string;
  position: string | null;
  round: number;
  pickNumber: number;
  projectedPoints: number | null;
}

export interface OffseasonTradeAssets {
  players: string[];
  picks: string[];
}

export interface OffseasonTrade {
  date: string;
  acquired: OffseasonTradeAssets;
  surrendered: OffseasonTradeAssets;
}

export interface StatsOffseasonMoves {
  slug: string;
  name: string;
  /** Sorted pickNumber ascending (earliest pick first), so callers cite draft ORDER, not projection rank. */
  draftedPlayers: OffseasonDraftPick[];
  trades: OffseasonTrade[];
}

// ---------------------------------------------------------------------------
// Pure builder (unit-tested)
// ---------------------------------------------------------------------------

export interface DraftPickRow {
  franchiseId: string | null;
  playerId: string | null;
  playerName: string | null;
  position: string | null;
  round: number;
  pickNumber: number;
}

export interface FranchiseRef {
  id: string;
  slug: string;
  name: string;
}

function formatPick(p: { season: string; round: number }): string {
  return `${p.season} Round ${p.round}`;
}

/**
 * Groups draft picks and offseason trades per franchise. Pure and
 * dependency-free: given the raw rows, builds the per-franchise offseason
 * moves shape the templates/LLM cite. Drafted players are sorted by
 * pickNumber ascending so callers naturally cite the earliest (not the
 * highest-projected) picks first, which is what produces position variety
 * across receipts instead of every franchise's cited pick being its QB.
 *
 * `surrendered` for a trade side is the UNION of every OTHER side's received
 * assets, which works unmodified for both 2-team and 3+-team trades: what
 * side A gave up is exactly what every other side received.
 */
export function buildOffseasonMoves(
  draftRows: DraftPickRow[],
  trades: Trade[],
  projByPlayerId: Map<string, number>,
  franchiseRefs: FranchiseRef[],
): StatsOffseasonMoves[] {
  const byFranchise = new Map<string, StatsOffseasonMoves>();
  for (const f of franchiseRefs) {
    byFranchise.set(f.id, { slug: f.slug, name: f.name, draftedPlayers: [], trades: [] });
  }

  for (const row of draftRows) {
    if (!row.franchiseId) continue;
    const entry = byFranchise.get(row.franchiseId);
    if (!entry) continue;
    entry.draftedPlayers.push({
      playerName: row.playerName ?? "Unknown Player",
      position: row.position,
      round: row.round,
      pickNumber: row.pickNumber,
      projectedPoints: row.playerId ? (projByPlayerId.get(row.playerId) ?? null) : null,
    });
  }
  for (const entry of byFranchise.values()) {
    entry.draftedPlayers.sort((a, b) => a.pickNumber - b.pickNumber);
  }

  for (const trade of trades) {
    for (const side of trade.sides) {
      if (!side.franchise) continue;
      const entry = byFranchise.get(side.franchise.id);
      if (!entry) continue;
      const others = trade.sides.filter((s) => s !== side);
      entry.trades.push({
        date: trade.date,
        acquired: {
          players: side.players.map((p) => p.name),
          picks: side.picks.filter((p) => !p.voided).map(formatPick),
        },
        surrendered: {
          players: others.flatMap((s) => s.players.map((p) => p.name)),
          picks: others.flatMap((s) => s.picks.filter((p) => !p.voided).map(formatPick)),
        },
      });
    }
  }

  return [...byFranchise.values()];
}

// ---------------------------------------------------------------------------
// Query (thin DB wrapper)
// ---------------------------------------------------------------------------

/**
 * Real offseason activity (draft picks + offseason trades) for every
 * franchise in the given season, for use in preseason/offseason hub content.
 * Degrades to an empty array on any query failure, matching the pattern of
 * getRosterProjections / getLeagueLongevity.
 */
export async function getOffseasonMoves(
  seasonId: number,
  seasonYear: number,
): Promise<StatsOffseasonMoves[]> {
  try {
    const [draftJoined, franchiseRows, allTrades] = await Promise.all([
      db
        .select({
          franchiseId: draftPicks.franchiseId,
          playerId: draftPicks.playerId,
          playerName: draftPicks.playerName,
          position: players.position,
          round: draftPicks.round,
          pickNumber: draftPicks.pickNumber,
          projPointsPpr: players.projPointsPpr,
          projSeason: players.projSeason,
        })
        .from(draftPicks)
        .leftJoin(players, eq(draftPicks.playerId, players.id))
        .where(eq(draftPicks.seasonId, seasonId)),
      db
        .select({ id: franchises.id, slug: franchises.slug, name: franchises.name })
        .from(franchises),
      getTrades({ seasonId }),
    ]);

    // Offseason trades only: transactions.week is null for trades made outside
    // a regular-season week window.
    const offseasonTrades = allTrades.filter((t) => t.week == null);

    const projByPlayerId = new Map<string, number>();
    for (const r of draftJoined) {
      if (r.playerId && r.projSeason === seasonYear && r.projPointsPpr != null) {
        projByPlayerId.set(r.playerId, r.projPointsPpr);
      }
    }

    const draftRows: DraftPickRow[] = draftJoined.map((r) => ({
      franchiseId: r.franchiseId,
      playerId: r.playerId,
      playerName: r.playerName,
      position: r.position,
      round: r.round,
      pickNumber: r.pickNumber,
    }));

    return buildOffseasonMoves(draftRows, offseasonTrades, projByPlayerId, franchiseRows);
  } catch (e) {
    console.error("[offseason-moves] getOffseasonMoves error:", e);
    return [];
  }
}
