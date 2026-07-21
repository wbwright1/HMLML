// Pure win-probability model for live matchups. Given each side's current
// score and its projected remaining points, estimate the probability that
// team A wins. No I/O — safe to unit test directly.

export interface WinProbabilityInput {
  scoreA: number;
  scoreB: number;
  projRemainingA: number;
  projRemainingB: number;
}

// Controls how quickly probability moves toward the leader as remaining
// projection shrinks. Uncertainty (in points) = SCALE * sqrt(totalRemaining),
// so a game with lots of football left stays close to a coin flip and one with
// little left swings hard toward the projected winner.
const UNCERTAINTY_SCALE = 1.75;

const MIN_PROB = 0.01;
const MAX_PROB = 0.99;

/**
 * Returns the probability in [0, 1] that team A beats team B.
 *
 * Model: expected final margin = (scoreA + projRemainingA) - (scoreB +
 * projRemainingB); uncertainty scales with sqrt of total remaining
 * projection; a logistic maps margin/uncertainty to a probability, clamped to
 * [0.01, 0.99]. When no projected points remain on either side the game is
 * treated as decided: 1, 0, or 0.5 by the actual current margin.
 */
export function computeWinProbability(input: WinProbabilityInput): number {
  const { scoreA, scoreB, projRemainingA, projRemainingB } = input;

  const remainingA = Math.max(0, projRemainingA);
  const remainingB = Math.max(0, projRemainingB);
  const totalRemaining = remainingA + remainingB;

  // Game over (nothing projected to be scored): decide by actual margin.
  if (totalRemaining <= 0) {
    if (scoreA > scoreB) return 1;
    if (scoreA < scoreB) return 0;
    return 0.5;
  }

  const expectedMargin =
    scoreA + remainingA - (scoreB + remainingB);
  const uncertainty = UNCERTAINTY_SCALE * Math.sqrt(totalRemaining);

  const prob = logistic(expectedMargin / uncertainty);
  return clamp(prob, MIN_PROB, MAX_PROB);
}

/** Numerically stable standard logistic function. */
function logistic(z: number): number {
  if (z >= 0) {
    return 1 / (1 + Math.exp(-z));
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
