// Pure classification of a starter's live state from the real NFL game status
// of their team. No I/O, no dependencies — safe to unit test directly.
//
// Replaces the old points===0 && projected>0 heuristic, which misclassified a
// starter who genuinely finished with 0.0 points as "yet to play". A starter's
// game status is the source of truth: a finished game means the player has
// played, regardless of how few points they scored.

export interface StarterGameState {
  // True only when the player's game has not started yet.
  yetToPlay: boolean;
  // Projected points still expected from this starter (0 once finished).
  projRemaining: number;
}

/**
 * Classifies one starter given the status of their NFL team's game, their
 * points so far, and their projected total.
 *
 * - "pre_game": game hasn't started -> yet to play, full projection remains.
 * - "complete" | "canceled": game is over -> played, nothing remains, even for
 *   a 0.0 finisher (a canceled game will not be played, so nothing remains).
 * - any other non-null status (in-game): playing now -> not "yet to play", the
 *   remaining projection is what's left of the projection above current points.
 * - null/undefined status (no game found for the team, e.g. bye week or a
 *   missing/unmatched team): treated as not playing, nothing remains.
 */
export function classifyStarter(
  gameStatus: string | null | undefined,
  points: number,
  projectedPoints: number | null
): StarterGameState {
  const projected = projectedPoints ?? 0;

  if (gameStatus == null) {
    return { yetToPlay: false, projRemaining: 0 };
  }

  if (gameStatus === "pre_game") {
    return { yetToPlay: true, projRemaining: projected };
  }

  if (gameStatus === "complete" || gameStatus === "canceled") {
    return { yetToPlay: false, projRemaining: 0 };
  }

  // In-game: some projection may still be coming.
  return { yetToPlay: false, projRemaining: Math.max(0, projected - points) };
}
