import { describe, it, expect } from "vitest";
import { pickSeasonFranchise } from "./awards-import";

describe("pickSeasonFranchise", () => {
  it("returns null for no shares", () => {
    expect(pickSeasonFranchise([])).toBeNull();
  });

  it("returns the sole franchise unchanged", () => {
    const only = { franchiseId: "a", franchiseSlug: "aces", points: 300, maxWeek: 18 };
    expect(pickSeasonFranchise([only])).toBe(only);
  });

  it("prefers the season-end holder (max week) when split", () => {
    // Mirrors the real 2022 ROY (Garrett Wilson) case: the franchise with more
    // total points held him earlier, but a different franchise held him at
    // season end and should win.
    const early = { franchiseId: "a", franchiseSlug: "early", points: 109.8, maxWeek: 11 };
    const late = { franchiseId: "b", franchiseSlug: "late", points: 105.9, maxWeek: 18 };
    expect(pickSeasonFranchise([early, late])?.franchiseSlug).toBe("late");
  });

  it("breaks a max-week tie by total points", () => {
    const a = { franchiseId: "a", franchiseSlug: "a", points: 100, maxWeek: 17 };
    const b = { franchiseId: "b", franchiseSlug: "b", points: 140, maxWeek: 17 };
    expect(pickSeasonFranchise([a, b])?.franchiseSlug).toBe("b");
  });
});
