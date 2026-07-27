import { describe, it, expect } from "vitest";
import { pickAssetToValueId } from "./player-values";

describe("pickAssetToValueId", () => {
  it("builds the FantasyCalc pseudo-id for a valid pick", () => {
    expect(pickAssetToValueId({ season: "2026", round: 1 })).toBe("FP_2026_1");
    expect(pickAssetToValueId({ season: "2025", round: 3 })).toBe("FP_2025_3");
  });

  it("returns null for a non-numeric season", () => {
    expect(pickAssetToValueId({ season: "abc", round: 1 })).toBeNull();
  });

  it("returns null for a non-integer round", () => {
    expect(pickAssetToValueId({ season: "2026", round: 1.5 })).toBeNull();
  });

  it("returns null for a round less than 1", () => {
    expect(pickAssetToValueId({ season: "2026", round: 0 })).toBeNull();
    expect(pickAssetToValueId({ season: "2026", round: -1 })).toBeNull();
  });
});
