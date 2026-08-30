import { describe, it, expect } from "vitest";
import { parseNflStateOverrideValue } from "./nfl-state";

describe("parseNflStateOverrideValue", () => {
  it("parses a bare type:week", () => {
    const parsed = parseNflStateOverrideValue("regular:1");
    expect(parsed?.state.seasonType).toBe("regular");
    expect(parsed?.state.week).toBe(1);
    expect(parsed?.forceLeadWindow).toBe(false);
  });

  it("parses an explicit season and the force flag", () => {
    const parsed = parseNflStateOverrideValue("regular:1:2026:force");
    expect(parsed?.state.season).toBe("2026");
    expect(parsed?.forceLeadWindow).toBe(true);
  });

  it("accepts the top of the week range", () => {
    expect(parseNflStateOverrideValue("regular:18")?.state.week).toBe(18);
    expect(parseNflStateOverrideValue("post:22")?.state.week).toBe(22);
  });

  it("rejects out-of-range weeks rather than clamping", () => {
    expect(parseNflStateOverrideValue("regular:0")).toBeNull();
    expect(parseNflStateOverrideValue("regular:99")).toBeNull();
    expect(parseNflStateOverrideValue("off:0")).toBeNull();
  });

  it("returns null for unset or malformed values", () => {
    expect(parseNflStateOverrideValue(null)).toBeNull();
    expect(parseNflStateOverrideValue(undefined)).toBeNull();
    expect(parseNflStateOverrideValue("")).toBeNull();
    expect(parseNflStateOverrideValue("regular")).toBeNull();
    expect(parseNflStateOverrideValue("summer:3")).toBeNull();
    expect(parseNflStateOverrideValue("regular:abc")).toBeNull();
  });
});
