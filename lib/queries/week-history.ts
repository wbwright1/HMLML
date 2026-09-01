import { db } from "@/lib/db";
import { franchises, matchups, seasons } from "@/lib/db/schema";
import { and, eq, lt } from "drizzle-orm";

// ---------------------------------------------------------------------------
// This Week in HMLML History
// ---------------------------------------------------------------------------
// On-this-week receipts: what happened in THIS week number in every prior
// season. Everything here is derived from completed matchups rows, so each
// claim is literally true and citable; nothing is generated.

/** One completed team-week from a past season, the rows the selector pairs up. */
export interface WeekHistoryRow {
  seasonYear: number;
  /** Sleeper matchup pairing id, unique per season+week. */
  matchupId: number;
  franchiseName: string;
  points: number;
}

export type WeekReceiptKind = "high" | "blowout" | "close";

/** The one place the receipt kickers live. */
export const WEEK_RECEIPT_LABELS: Record<WeekReceiptKind, string> = {
  high: "High Water",
  blowout: "Beatdown",
  close: "Nail-Biter",
};

export interface WeekReceipt {
  kind: WeekReceiptKind;
  label: string;
  seasonYear: number;
  /** The claim, franchises named as plain text (prose row). */
  claim: string;
  /** The number that backs it, formatted to one decimal. */
  value: string;
}

/** A paired game: the two sides of one matchupId, higher scorer first. */
interface PairedGame {
  key: string;
  seasonYear: number;
  matchupId: number;
  winner: string;
  loser: string;
  winnerPoints: number;
  loserPoints: number;
  margin: number;
}

function pairGames(rows: WeekHistoryRow[]): PairedGame[] {
  const byGame = new Map<string, WeekHistoryRow[]>();
  for (const r of rows) {
    const key = `${r.seasonYear}:${r.matchupId}`;
    const existing = byGame.get(key);
    if (existing) existing.push(r);
    else byGame.set(key, [r]);
  }

  const games: PairedGame[] = [];
  for (const [key, sides] of byGame) {
    if (sides.length !== 2) continue;
    const [a, b] = [...sides].sort((x, y) => {
      if (y.points !== x.points) return y.points - x.points;
      return x.franchiseName.localeCompare(y.franchiseName);
    });
    games.push({
      key,
      seasonYear: a.seasonYear,
      matchupId: a.matchupId,
      winner: a.franchiseName,
      loser: b.franchiseName,
      winnerPoints: a.points,
      loserPoints: b.points,
      margin: a.points - b.points,
    });
  }
  return games;
}

/**
 * Up to three receipts from this week number in past seasons: the highest
 * single-team score, the biggest blowout, and the closest finish. Pure: no DB
 * access, fully unit-testable.
 *
 * Each receipt cites a DIFFERENT game, so one wild afternoon cannot fill the
 * whole card; a receipt whose only candidate game is already spoken for is
 * dropped rather than repeated. Ties break on the more recent season, then on
 * matchupId, so the card is deterministic across renders.
 */
export function selectWeekHistoryReceipts(rows: WeekHistoryRow[]): WeekReceipt[] {
  const games = pairGames(rows);
  if (games.length === 0) return [];

  const recentFirst = (a: PairedGame, b: PairedGame): number => {
    if (b.seasonYear !== a.seasonYear) return b.seasonYear - a.seasonYear;
    return a.matchupId - b.matchupId;
  };

  const used = new Set<string>();
  const bestBy = (
    pool: PairedGame[],
    better: (a: PairedGame, b: PairedGame) => number
  ): PairedGame | null => {
    const available = pool.filter((g) => !used.has(g.key));
    if (available.length === 0) return null;
    const sorted = [...available].sort((a, b) => better(a, b) || recentFirst(a, b));
    return sorted[0];
  };

  const receipts: WeekReceipt[] = [];

  const high = bestBy(games, (a, b) => b.winnerPoints - a.winnerPoints);
  if (high) {
    used.add(high.key);
    receipts.push({
      kind: "high",
      label: WEEK_RECEIPT_LABELS.high,
      seasonYear: high.seasonYear,
      claim: `${high.winner} hung it on ${high.loser}`,
      value: high.winnerPoints.toFixed(1),
    });
  }

  // "Buried" needs a decided game, same as the closest-finish receipt below.
  const decided = games.filter((g) => g.margin > 0);
  const blowout = bestBy(decided, (a, b) => b.margin - a.margin);
  if (blowout) {
    used.add(blowout.key);
    receipts.push({
      kind: "blowout",
      label: WEEK_RECEIPT_LABELS.blowout,
      seasonYear: blowout.seasonYear,
      claim: `${blowout.winner} buried ${blowout.loser}`,
      value: blowout.margin.toFixed(1),
    });
  }

  // A tie is not a "won by" claim, so the closest-finish receipt needs a
  // decided game.
  const close = bestBy(decided, (a, b) => a.margin - b.margin);
  if (close) {
    used.add(close.key);
    receipts.push({
      kind: "close",
      label: WEEK_RECEIPT_LABELS.close,
      seasonYear: close.seasonYear,
      claim: `${close.winner} survived ${close.loser}`,
      value: `+${close.margin.toFixed(1)}`,
    });
  }

  return receipts;
}

// ---------------------------------------------------------------------------
// Query (thin DB wrapper)
// ---------------------------------------------------------------------------

/**
 * Completed games from this week number in every season before the current
 * one, turned into receipts. Degrades to [] on any failure: the card is
 * optional content and absence is fine.
 */
export async function getWeekInHistory(
  currentSeasonYear: number,
  week: number
): Promise<WeekReceipt[]> {
  try {
    const rows = await db
      .select({
        seasonYear: seasons.seasonYear,
        matchupId: matchups.matchupId,
        franchiseName: franchises.name,
        points: matchups.points,
      })
      .from(matchups)
      .innerJoin(seasons, eq(matchups.seasonId, seasons.id))
      .innerJoin(franchises, eq(matchups.franchiseId, franchises.id))
      .where(
        and(
          eq(matchups.week, week),
          eq(matchups.status, "complete"),
          // By season YEAR, not seasonId: the id is a serial and the legacy
          // chain was not necessarily imported in chronological order.
          lt(seasons.seasonYear, currentSeasonYear)
        )
      );

    return selectWeekHistoryReceipts(
      rows.map((r) => ({
        seasonYear: r.seasonYear,
        matchupId: r.matchupId,
        franchiseName: r.franchiseName,
        points: r.points ?? 0,
      }))
    );
  } catch (e) {
    console.error("[week-history] getWeekInHistory error:", e);
    return [];
  }
}
