import { describe, it, expect } from "vitest";
import {
  isBottomThirdFinish,
  computeSustainedDoormat,
  computeSustainedContender,
} from "./franchise-longevity";

describe("isBottomThirdFinish", () => {
  it("flags a finish strictly worse than the top two-thirds cutoff", () => {
    // 12 rosters: cutoff = ceil(24/3) = 8. Finish 9-12 is bottom third.
    expect(isBottomThirdFinish(9, 12)).toBe(true);
    expect(isBottomThirdFinish(12, 12)).toBe(true);
    expect(isBottomThirdFinish(8, 12)).toBe(false);
    expect(isBottomThirdFinish(1, 12)).toBe(false);
  });

  it("never penalizes on missing data", () => {
    expect(isBottomThirdFinish(null, 12)).toBe(false);
    expect(isBottomThirdFinish(9, null)).toBe(false);
    expect(isBottomThirdFinish(9, 0)).toBe(false);
  });
});

describe("computeSustainedDoormat", () => {
  it("is false with fewer than 2 completed seasons of history", () => {
    expect(computeSustainedDoormat([])).toBe(false);
    expect(computeSustainedDoormat([{ finish: 12, totalRosters: 12 }])).toBe(false);
  });

  it("is true when every season in the window is bottom-third", () => {
    expect(
      computeSustainedDoormat([
        { finish: 12, totalRosters: 12 },
        { finish: 10, totalRosters: 12 },
        { finish: 11, totalRosters: 12 },
      ]),
    ).toBe(true);
  });

  it("is false when a single season breaks the streak", () => {
    expect(
      computeSustainedDoormat([
        { finish: 12, totalRosters: 12 },
        { finish: 3, totalRosters: 12 }, // one good season interrupts the trend
        { finish: 11, totalRosters: 12 },
      ]),
    ).toBe(false);
  });
});

describe("computeSustainedContender", () => {
  it("is false with fewer than 2 completed seasons of history", () => {
    expect(computeSustainedContender([])).toBe(false);
    expect(computeSustainedContender([true])).toBe(false);
  });

  it("is true when every season in the window made the playoffs", () => {
    expect(computeSustainedContender([true, true, true])).toBe(true);
  });

  it("is false when any season missed the playoffs", () => {
    expect(computeSustainedContender([true, false, true])).toBe(false);
  });
});
