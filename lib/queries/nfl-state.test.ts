import { describe, it, expect } from "vitest";
import { parseNflStateOverrideValue, resolveNextScheduledWeek } from "./nfl-state";

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

  it("parses the 'next' week token as a request-time week", () => {
    const parsed = parseNflStateOverrideValue("regular:next:force");
    expect(parsed?.nextWeek).toBe(true);
    expect(parsed?.state.seasonType).toBe("regular");
    expect(parsed?.forceLeadWindow).toBe(true);
    expect(parsed?.forceRecapWindow).toBe(false);
    // A numbered week is never "next".
    expect(parseNflStateOverrideValue("regular:3")?.nextWeek).toBe(false);
  });

  it("parses the recap flag, alone, with a season, and alongside force in either order", () => {
    expect(parseNflStateOverrideValue("regular:next:recap")?.forceRecapWindow).toBe(true);
    expect(parseNflStateOverrideValue("regular:next:recap")?.forceLeadWindow).toBe(false);
    const both = parseNflStateOverrideValue("regular:next:2026:recap:force");
    expect(both?.state.season).toBe("2026");
    expect(both?.forceRecapWindow).toBe(true);
    expect(both?.forceLeadWindow).toBe(true);
    expect(parseNflStateOverrideValue("regular:1")?.forceRecapWindow).toBe(false);
  });

  it("rejects malformed next/recap spellings", () => {
    expect(parseNflStateOverrideValue("regular:nxt")).toBeNull();
    expect(parseNflStateOverrideValue("regular:next-1")).toBeNull();
    expect(parseNflStateOverrideValue("regular:next:replay")).toBeNull();
    expect(parseNflStateOverrideValue("regular:next:2026:force:bogus")).toBeNull();
  });
});

describe("resolveNextScheduledWeek", () => {
  it("picks the earliest week whose matchups are all scheduled", () => {
    expect(
      resolveNextScheduledWeek([
        { week: 1, allScheduled: false },
        { week: 2, allScheduled: false },
        { week: 3, allScheduled: true },
        { week: 4, allScheduled: true },
      ])
    ).toBe(3);
  });

  it("skips a week that is partly under way, and ignores row order", () => {
    expect(
      resolveNextScheduledWeek([
        { week: 5, allScheduled: true },
        { week: 3, allScheduled: false },
        { week: 4, allScheduled: true },
      ])
    ).toBe(4);
  });

  it("is null when every week has started (season over)", () => {
    expect(resolveNextScheduledWeek([{ week: 17, allScheduled: false }])).toBeNull();
    expect(resolveNextScheduledWeek([])).toBeNull();
  });
});
