import { describe, it, expect } from "vitest";
import { maxPointsForOf } from "@/lib/sync/max-points-for";

describe("maxPointsForOf", () => {
  it("combines whole and decimal parts (real 2026 roster 2 after week 11)", () => {
    expect(maxPointsForOf({ ppts: 1384, ppts_decimal: 56 })).toBeCloseTo(1384.56, 6);
  });
  it("is null, not zero, when Sleeper has not reported it", () => {
    expect(maxPointsForOf({})).toBeNull();
  });
});
