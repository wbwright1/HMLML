import type { SleeperBracketMatch } from "@/lib/sleeper-schemas";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlayoffResults {
  /** franchise_id (owner_id) of the champion, or null if not yet determined */
  championFranchiseId: string | null;
  /** franchise_id (owner_id) of the runner-up, or null if not yet determined */
  runnerUpFranchiseId: string | null;
  /** Map of franchise_id → playoff result string */
  franchiseResults: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Derive playoff results from bracket data
// ---------------------------------------------------------------------------

/**
 * Derive playoff results from Sleeper bracket data.
 *
 * @param winnersBracket - Winners (playoff) bracket matches
 * @param losersBracket - Losers (consolation) bracket matches
 * @param rosterToFranchise - Map of roster_id (number) → franchise_id (owner's user_id)
 */
export function derivePlayoffResults(
  winnersBracket: SleeperBracketMatch[],
  losersBracket: SleeperBracketMatch[],
  rosterToFranchise: Map<number, string>
): PlayoffResults {
  let championFranchiseId: string | null = null;
  let runnerUpFranchiseId: string | null = null;
  const franchiseResults = new Map<string, string>();

  // --- Winners bracket ---
  // Collect all roster_ids that appear in the winners bracket
  const winnersBracketRosterIds = new Set<number>();
  for (const match of winnersBracket) {
    if (typeof match.t1 === "number") winnersBracketRosterIds.add(match.t1);
    if (typeof match.t2 === "number") winnersBracketRosterIds.add(match.t2);
    if (match.w != null) winnersBracketRosterIds.add(match.w);
    if (match.l != null) winnersBracketRosterIds.add(match.l);
  }

  // Find the championship match (p=1 in winners bracket)
  const championshipMatch = winnersBracket.find((m) => m.p === 1);
  if (championshipMatch) {
    if (championshipMatch.w != null) {
      const champFId = rosterToFranchise.get(championshipMatch.w);
      if (champFId) {
        championFranchiseId = champFId;
        franchiseResults.set(champFId, "champion");
      }
    }
    if (championshipMatch.l != null) {
      const runnerFId = rosterToFranchise.get(championshipMatch.l);
      if (runnerFId) {
        runnerUpFranchiseId = runnerFId;
        franchiseResults.set(runnerFId, "runner_up");
      }
    }
  }

  // All other winners bracket participants get 'made_playoffs'
  for (const rosterId of winnersBracketRosterIds) {
    const franchiseId = rosterToFranchise.get(rosterId);
    if (franchiseId && !franchiseResults.has(franchiseId)) {
      franchiseResults.set(franchiseId, "made_playoffs");
    }
  }

  // --- Losers bracket ---
  // Find the "toilet bowl" loser: the loser of the match with the highest
  // `p` value in the losers bracket (last-place match).
  let toiletBowlRosterId: number | null = null;
  if (losersBracket.length > 0) {
    const lastPlaceMatch = losersBracket.reduce((max, m) => ((m.p ?? 0) > (max.p ?? 0) ? m : max), losersBracket[0]);
    if (lastPlaceMatch.l != null) {
      toiletBowlRosterId = lastPlaceMatch.l;
    }
  }

  // Collect all roster_ids in the losers bracket
  const losersBracketRosterIds = new Set<number>();
  for (const match of losersBracket) {
    if (typeof match.t1 === "number") losersBracketRosterIds.add(match.t1);
    if (typeof match.t2 === "number") losersBracketRosterIds.add(match.t2);
    if (match.w != null) losersBracketRosterIds.add(match.w);
    if (match.l != null) losersBracketRosterIds.add(match.l);
  }

  for (const rosterId of losersBracketRosterIds) {
    const franchiseId = rosterToFranchise.get(rosterId);
    if (franchiseId && !franchiseResults.has(franchiseId)) {
      if (rosterId === toiletBowlRosterId) {
        franchiseResults.set(franchiseId, "toilet_bowl");
      } else {
        franchiseResults.set(franchiseId, "consolation");
      }
    }
  }

  return { championFranchiseId, runnerUpFranchiseId, franchiseResults };
}
