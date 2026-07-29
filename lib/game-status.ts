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

// ---------------------------------------------------------------------------
// Players-page "this week" (WK) column display decision
// ---------------------------------------------------------------------------

export interface WeekDisplay {
  // The number to render in the WK cell.
  value: number;
  // True when `value` is a projection (game not started / no schedule): the
  // cell shows it de-emphasized with a "~" prefix so the distinction never
  // rests on color alone.
  isProjected: boolean;
}

/**
 * Decides what a player's merged "this week" (WK) cell shows on the players
 * page, given the real NFL game status of their team plus their current-week
 * actual and projected points.
 *
 * - Game started or finished (any non-null status other than "pre_game",
 *   including in-game, "complete", and "canceled"): show ACTUAL points, even a
 *   0.0 final (never a projection). Falls back to the projection only if there
 *   is no actual points value at all.
 * - Not started ("pre_game") or no game / no schedule (null status): show the
 *   PROJECTION, flagged isProjected. Falls back to actual points if there is no
 *   projection.
 * - Neither value available: returns null (the cell renders a dash).
 *
 * CRITICAL: `gameStatus` must come from real NFL game data (the nfl_games
 * table), never a points heuristic. Callers pass null for every player when
 * nfl_games has no rows for the week, which correctly yields projections.
 */
export function decideWeekDisplay(
  gameStatus: string | null | undefined,
  points: number | null,
  projected: number | null
): WeekDisplay | null {
  const hasPlayed = gameStatus != null && gameStatus !== "pre_game";

  if (hasPlayed) {
    if (points != null) return { value: points, isProjected: false };
    return projected != null ? { value: projected, isProjected: true } : null;
  }

  // Not started / no game: prefer the projection.
  if (projected != null) return { value: projected, isProjected: true };
  if (points != null) return { value: points, isProjected: false };
  return null;
}
