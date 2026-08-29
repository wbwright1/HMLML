import { describe, it, expect } from "vitest";
import {
  chooseProjectedTotals,
  formatRecord,
  kickoffWeekday,
  pairRosterIds,
  REGULAR_SEASON_GAMES,
} from "./book";

describe("pairRosterIds", () => {
  it("pins home to the numerically lower roster id", () => {
    expect(pairRosterIds(["11", "2"])).toEqual(["2", "11"]);
    expect(pairRosterIds(["2", "11"])).toEqual(["2", "11"]);
  });

  it("refuses anything that is not a clean pair", () => {
    expect(pairRosterIds(["3"])).toBeNull();
    expect(pairRosterIds(["3", "4", "5"])).toBeNull();
  });
});

describe("formatRecord", () => {
  it("renders wins and losses", () => {
    expect(formatRecord(7, 2, 0)).toBe("7-2");
    expect(formatRecord(0, 0, 0)).toBe("0-0");
  });

  it("adds ties only when there are some", () => {
    expect(formatRecord(6, 2, 1)).toBe("6-2-1");
  });

  it("treats missing values as zero", () => {
    expect(formatRecord(null, null, null)).toBe("0-0");
  });
});

describe("kickoffWeekday", () => {
  it("labels a stored game date with its weekday", () => {
    expect(kickoffWeekday("2026-09-13")).toBe("SUN");
    expect(kickoffWeekday("2026-09-10")).toBe("THU");
    expect(kickoffWeekday("2026-09-14")).toBe("MON");
  });

  it("returns null for anything unusable", () => {
    expect(kickoffWeekday(null)).toBeNull();
    expect(kickoffWeekday("")).toBeNull();
    expect(kickoffWeekday("week one")).toBeNull();
  });
});

describe("chooseProjectedTotals", () => {
  const seasonLong = new Map([
    ["1", 2550 / REGULAR_SEASON_GAMES],
    ["2", 2040 / REGULAR_SEASON_GAMES],
  ]);

  it("uses the weekly projection when the lineup is full", () => {
    const chosen = chooseProjectedTotals(
      [
        { rosterId: "1", starters: 10, projected: 148.2 },
        { rosterId: "2", starters: 10, projected: 121.4 },
      ],
      seasonLong,
    );
    expect(chosen.get("1")).toBe(148.2);
    expect(chosen.get("2")).toBe(121.4);
  });

  it("ignores a roster whose lineup is not set and prices it season-long", () => {
    const chosen = chooseProjectedTotals(
      [
        { rosterId: "1", starters: 10, projected: 148.2 },
        { rosterId: "2", starters: 8, projected: 26.5 },
      ],
      seasonLong,
    );
    expect(chosen.get("1")).toBe(148.2);
    expect(chosen.get("2")).toBeCloseTo(120, 0);
    expect(chosen.get("2")).not.toBe(26.5);
  });

  it("falls back entirely when there are no weekly projections yet", () => {
    const chosen = chooseProjectedTotals([], seasonLong);
    expect(chosen.get("1")).toBeCloseTo(150, 0);
    expect(chosen.get("2")).toBeCloseTo(120, 0);
  });

  it("drops a roster with no usable number from either source", () => {
    const chosen = chooseProjectedTotals(
      [{ rosterId: "3", starters: 10, projected: 0 }],
      new Map([["3", 0]]),
    );
    expect(chosen.has("3")).toBe(false);
  });
});
