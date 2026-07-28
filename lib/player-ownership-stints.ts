/**
 * Pure ownership-stint computation, shared by the Ownership Ledger
 * (getPlayerFranchiseHistory) and the career timeline's "rostered by" events
 * (getPlayerTimeline). No db import — feed it presence rows, get stints back.
 *
 * A "stint" is a chronologically contiguous run of presence with ONE
 * franchise. Re-acquisitions (the player leaves and comes back later) produce
 * SEPARATE stints — collapsing them into one would lie about a gap in
 * ownership. A mid-season trade produces two ADJACENT stints that both touch
 * the same season year (e.g. traded week 11 of 2024): the outgoing
 * franchise's stint ends at 2024, the incoming franchise's stint starts at
 * 2024 — intentional, not a bug.
 */

export interface OwnershipPresence {
  franchiseId: string;
  seasonYear: number;
  /** Earliest week of presence within the season, or null when only known via roster (no lineup week). */
  minWeek: number | null;
}

export interface OwnershipStint {
  franchiseId: string;
  firstSeasonYear: number;
  lastSeasonYear: number;
}

/**
 * Dedupe presence rows per (seasonYear, franchiseId) keeping the minimum
 * week, sort chronologically (season asc, then week asc with null sorting
 * last within its season), then walk the sorted list merging only ADJACENT
 * entries that share a franchise into one stint.
 */
export function computeOwnershipStints(
  presence: OwnershipPresence[],
): OwnershipStint[] {
  const byKey = new Map<string, OwnershipPresence>();
  for (const p of presence) {
    const key = `${p.seasonYear}:${p.franchiseId}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...p });
    } else {
      const existingWeek = existing.minWeek ?? Infinity;
      const newWeek = p.minWeek ?? Infinity;
      if (newWeek < existingWeek) existing.minWeek = p.minWeek;
    }
  }

  const deduped = [...byKey.values()].sort((a, b) => {
    if (a.seasonYear !== b.seasonYear) return a.seasonYear - b.seasonYear;
    return (a.minWeek ?? Infinity) - (b.minWeek ?? Infinity);
  });

  const stints: OwnershipStint[] = [];
  for (const p of deduped) {
    const last = stints[stints.length - 1];
    if (last && last.franchiseId === p.franchiseId) {
      last.lastSeasonYear = p.seasonYear;
    } else {
      stints.push({
        franchiseId: p.franchiseId,
        firstSeasonYear: p.seasonYear,
        lastSeasonYear: p.seasonYear,
      });
    }
  }
  return stints;
}
