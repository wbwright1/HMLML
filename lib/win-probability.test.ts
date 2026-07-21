import { describe, it, expect } from "vitest";
import { computeWinProbability } from "./win-probability";

describe("computeWinProbability", () => {
  it("returns 1 when the game is over and A is ahead", () => {
    expect(
      computeWinProbability({
        scoreA: 150,
        scoreB: 100,
        projRemainingA: 0,
        projRemainingB: 0,
      })
    ).toBe(1);
  });

  it("returns 0 when the game is over and A is behind", () => {
    expect(
      computeWinProbability({
        scoreA: 100,
        scoreB: 120,
        projRemainingA: 0,
        projRemainingB: 0,
      })
    ).toBe(0);
  });

  it("returns 0.5 when the game is over and tied", () => {
    expect(
      computeWinProbability({
        scoreA: 110,
        scoreB: 110,
        projRemainingA: 0,
        projRemainingB: 0,
      })
    ).toBe(0.5);
  });

  it("returns 0.5 pregame with equal scores and equal projections", () => {
    expect(
      computeWinProbability({
        scoreA: 0,
        scoreB: 0,
        projRemainingA: 120,
        projRemainingB: 120,
      })
    ).toBe(0.5);
  });

  it("clamps to at most 0.99 for a lopsided lead with little remaining", () => {
    const p = computeWinProbability({
      scoreA: 130,
      scoreB: 90,
      projRemainingA: 3,
      projRemainingB: 3,
    });
    expect(p).toBeGreaterThan(0.9);
    expect(p).toBeLessThanOrEqual(0.99);
  });

  it("never returns below 0.01 or above 0.99 while points remain", () => {
    const losing = computeWinProbability({
      scoreA: 50,
      scoreB: 130,
      projRemainingA: 2,
      projRemainingB: 2,
    });
    expect(losing).toBeGreaterThanOrEqual(0.01);
    expect(losing).toBeLessThan(0.1);
  });

  it("favors the projected winner but stays uncertain early", () => {
    // A trails now but is projected to finish ahead, with lots left.
    const p = computeWinProbability({
      scoreA: 40,
      scoreB: 45,
      projRemainingA: 80,
      projRemainingB: 70,
    });
    expect(p).toBeGreaterThan(0.5);
    expect(p).toBeLessThan(0.7);
  });

  it("is symmetric: swapping A and B gives the complementary probability", () => {
    const input = {
      scoreA: 60,
      scoreB: 55,
      projRemainingA: 50,
      projRemainingB: 60,
    };
    const pA = computeWinProbability(input);
    const pB = computeWinProbability({
      scoreA: input.scoreB,
      scoreB: input.scoreA,
      projRemainingA: input.projRemainingB,
      projRemainingB: input.projRemainingA,
    });
    expect(pA + pB).toBeCloseTo(1, 10);
  });
});
