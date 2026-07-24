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
  // The league's "Toilet Bowl" is the losers-bracket FINAL: the `p === 1`
  // match in Sleeper's losers_bracket. BOTH participants of that match carry
  // the `toilet_bowl` result (it is an appearance in the Toilet Bowl, not a
  // single last-place team). Every other losers-bracket roster is
  // `consolation`. Bracket shapes vary (4-team losers brackets have maxP=3,
  // 6-team have maxP=5), so we key off the fixed `p === 1` final, not maxP.
  //
  // Graceful mid-season behavior: the final may be unplayed, so t1/t2/w/l can
  // be null. We only tag rosters that are actually known; unresolved slots are
  // left untagged until a later sync fills them in.
  const toiletBowlRosterIds = new Set<number>();
  const toiletBowlFinal = losersBracket.find((m) => m.p === 1);
  if (toiletBowlFinal) {
    // Prefer decided participants (w/l) but fall back to seeded slots (t1/t2)
    // so an in-progress or seeded-but-unplayed final still resolves both teams.
    const candidates = [
      toiletBowlFinal.w,
      toiletBowlFinal.l,
      typeof toiletBowlFinal.t1 === "number" ? toiletBowlFinal.t1 : null,
      typeof toiletBowlFinal.t2 === "number" ? toiletBowlFinal.t2 : null,
    ];
    for (const rosterId of candidates) {
      if (rosterId != null) toiletBowlRosterIds.add(rosterId);
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
      if (toiletBowlRosterIds.has(rosterId)) {
        franchiseResults.set(franchiseId, "toilet_bowl");
      } else {
        franchiseResults.set(franchiseId, "consolation");
      }
    }
  }

  return { championFranchiseId, runnerUpFranchiseId, franchiseResults };
}
