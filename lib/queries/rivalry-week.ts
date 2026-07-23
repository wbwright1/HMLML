import { getRivalries, type RivalrySummary } from "@/lib/queries/records";
import type { PairedMatchup } from "@/lib/queries/matchups";

// Rivalry Week auto-detection.
//
// A current-week matchup earns the "Rivalry Week" badge only when the two
// franchises are each other's MUTUAL top rival. "Top rival" is defined
// concretely and provably from lifetime head-to-head history (getRivalries):
// the opponent a franchise has played the most, breaking ties toward the
// closest all-time record. Requiring the relationship to be mutual (A's top
// rival is B AND B's top rival is A) keeps the badge rare and meaningful, and
// a minimum lifetime meeting count keeps a one-off pairing from ever counting.
//
// Everything here degrades to empty during the offseason: no matchups in, no
// pairings out, nothing rendered.

/** A franchise pair must have met at least this many times to be a rivalry. */
const MIN_RIVALRY_GAMES = 3;

export interface RivalryPairing {
  /** The two franchise ids, sorted ascending (matches the pair key). */
  franchiseIdA: string;
  franchiseIdB: string;
  totalGames: number;
}

/**
 * Order-independent key for a franchise pair, so a lookup works regardless of
 * which franchise is "home". Sorted so (a,b) and (b,a) collide.
 */
export function rivalryPairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

/**
 * From the full set of lifetime rivalry summaries, returns the pairs that are
 * MUTUAL top rivals (keyed by rivalryPairKey). Pure and synchronous so the
 * detection rule can be unit tested without a database.
 *
 * For each franchise we rank its opponents by total games played DESC, then by
 * closest all-time record (|wins - losses| ASC), then by opponent id ASC for a
 * deterministic tiebreak. A franchise's "top rival" is the first opponent in
 * that ranking, provided the pair has met at least MIN_RIVALRY_GAMES times. A
 * pair is returned only when each side's top rival is the other.
 */
export function detectMutualTopRivals(
  rivalries: RivalrySummary[]
): Map<string, RivalryPairing> {
  // Build, per franchise, the list of its opponents with the pair's stats.
  interface OpponentEntry {
    opponentId: string;
    totalGames: number;
    recordGap: number; // |wins - losses| from this franchise's perspective
  }
  const byFranchise = new Map<string, OpponentEntry[]>();

  const add = (
    selfId: string,
    opponentId: string,
    totalGames: number,
    recordGap: number
  ) => {
    const list = byFranchise.get(selfId) ?? [];
    list.push({ opponentId, totalGames, recordGap });
    byFranchise.set(selfId, list);
  };

  for (const r of rivalries) {
    if (r.totalGames < MIN_RIVALRY_GAMES) continue;
    // |wins - losses| is perspective-independent, so both directions share it.
    const gap = Math.abs(r.record.wins - r.record.losses);
    add(r.franchiseA.id, r.franchiseB.id, r.totalGames, gap);
    add(r.franchiseB.id, r.franchiseA.id, r.totalGames, gap);
  }

  const topRivalOf = new Map<string, string>();
  for (const [franchiseId, opponents] of byFranchise) {
    const ranked = [...opponents].sort((a, b) => {
      if (b.totalGames !== a.totalGames) return b.totalGames - a.totalGames;
      if (a.recordGap !== b.recordGap) return a.recordGap - b.recordGap;
      return a.opponentId < b.opponentId ? -1 : a.opponentId > b.opponentId ? 1 : 0;
    });
    if (ranked.length > 0) topRivalOf.set(franchiseId, ranked[0].opponentId);
  }

  const pairings = new Map<string, RivalryPairing>();
  for (const [franchiseId, opponentId] of topRivalOf) {
    // Mutual check: each side's top rival must be the other.
    if (topRivalOf.get(opponentId) !== franchiseId) continue;
    const key = rivalryPairKey(franchiseId, opponentId);
    if (pairings.has(key)) continue;
    const [a, b] = franchiseId < opponentId ? [franchiseId, opponentId] : [opponentId, franchiseId];
    // Recover the pair's total games from either side's opponent list.
    const totalGames =
      byFranchise.get(a)?.find((o) => o.opponentId === b)?.totalGames ?? 0;
    pairings.set(key, { franchiseIdA: a, franchiseIdB: b, totalGames });
  }

  return pairings;
}

/**
 * Returns the set of rivalry-pair keys among a given week's matchups. Empty
 * (renders nothing) when there are no matchups (offseason) or no lifetime
 * rivalry history yet. The returned keys are produced by rivalryPairKey over
 * each matchup's two franchise ids, so a caller can test a matchup with
 * `rivalrySet.has(rivalryPairKey(homeId, awayId))`.
 */
export async function getRivalryWeek(
  weekMatchups: PairedMatchup[]
): Promise<Set<string>> {
  if (weekMatchups.length === 0) return new Set();

  let rivalries: RivalrySummary[] = [];
  try {
    rivalries = await getRivalries();
  } catch {
    return new Set();
  }
  if (rivalries.length === 0) return new Set();

  const mutualByKey = detectMutualTopRivals(rivalries);
  if (mutualByKey.size === 0) return new Set();

  const result = new Set<string>();
  for (const m of weekMatchups) {
    const key = rivalryPairKey(m.homeTeam.franchiseId, m.awayTeam.franchiseId);
    if (mutualByKey.has(key)) result.add(key);
  }
  return result;
}
