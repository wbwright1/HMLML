// Pure display helpers for commissioner-named rivalries. No DB imports, so
// these stay unit-testable; the optional-data loader lives in
// lib/queries/named-rivalries-optional.ts.

/** The editorial fields of a named rivalry that a surface renders. */
export interface RivalryLore {
  name: string;
  tagline: string | null;
  origin: string | null;
  originYear: number | null;
  trophyName: string | null;
}

/** The minimal pair shape of a named rivalry (NamedRivalry satisfies it). */
export interface RivalryPair {
  franchiseAId: string;
  franchiseBId: string;
}

/** An all-time series record, from one named side's perspective. */
export interface SeriesRecord {
  wins: number;
  losses: number;
  ties: number;
  totalGames: number;
}

/** The pairwise summary shape getRivalries() returns (only what we read). */
export interface PairSummary {
  franchiseA: { id: string };
  franchiseB: { id: string };
  record: { wins: number; losses: number; ties: number };
  totalGames: number;
}

/**
 * The all-time record between two franchises, oriented so `wins` belongs to
 * `franchiseId`. Null when the pair has never finished a game.
 */
export function seriesRecordFor(
  summaries: readonly PairSummary[],
  franchiseId: string,
  opponentId: string,
): SeriesRecord | null {
  for (const s of summaries) {
    const aId = s.franchiseA.id;
    const bId = s.franchiseB.id;
    if (aId === franchiseId && bId === opponentId) {
      return {
        wins: s.record.wins,
        losses: s.record.losses,
        ties: s.record.ties,
        totalGames: s.totalGames,
      };
    }
    if (aId === opponentId && bId === franchiseId) {
      return {
        wins: s.record.losses,
        losses: s.record.wins,
        ties: s.record.ties,
        totalGames: s.totalGames,
      };
    }
  }
  return null;
}

/**
 * Every named rivalry a franchise is part of, each paired with the opponent's
 * id. Keeps the input order (getNamedRivalries sorts by name).
 */
export function namedRivalriesFor<R extends RivalryPair>(
  list: readonly R[],
  franchiseId: string,
): { rivalry: R; opponentId: string }[] {
  const out: { rivalry: R; opponentId: string }[] = [];
  for (const r of list) {
    if (r.franchiseAId === franchiseId) {
      out.push({ rivalry: r, opponentId: r.franchiseBId });
    } else if (r.franchiseBId === franchiseId) {
      out.push({ rivalry: r, opponentId: r.franchiseAId });
    }
  }
  return out;
}

/** Who holds the series: the named side, the other side, dead even, or nobody yet. */
export type SeriesStanding = "leads" | "trails" | "tied" | "unplayed";

export function seriesStanding(record: SeriesRecord | null): SeriesStanding {
  if (!record || record.totalGames === 0) return "unplayed";
  if (record.wins > record.losses) return "leads";
  if (record.losses > record.wins) return "trails";
  return "tied";
}

/** "4-0" or "4-4-1": the record as a compact string for mono rendering. */
export function formatSeriesRecord(record: SeriesRecord): string {
  const base = `${record.wins}-${record.losses}`;
  return record.ties > 0 ? `${base}-${record.ties}` : base;
}
