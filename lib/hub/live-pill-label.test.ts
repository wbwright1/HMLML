import { describe, it, expect } from "vitest";
import {
  daysUntil,
  formatPreseasonKickoffLabel,
  formatBetweenWeeksKickoffLabel,
} from "./live-pill-label";

describe("daysUntil", () => {
  it("floors partial days (matches the countdown DAYS card)", () => {
    const now = new Date("2026-08-01T00:00:00Z");
    const target = new Date("2026-08-02T01:00:00Z"); // 25h out
    expect(daysUntil(target, now)).toBe(1);
  });

  it("floors at 0 for a past target", () => {
    const now = new Date("2026-08-05T00:00:00Z");
    const target = new Date("2026-08-01T00:00:00Z");
    expect(daysUntil(target, now)).toBe(0);
  });

  it("returns 0 when target equals now", () => {
    const now = new Date("2026-08-01T00:00:00Z");
    expect(daysUntil(now, now)).toBe(0);
  });
});

describe("formatPreseasonKickoffLabel", () => {
  it("formats the preseason countdown label", () => {
    const now = new Date("2026-08-01T00:00:00Z");
    const target = new Date("2026-09-04T00:00:00Z");
    expect(formatPreseasonKickoffLabel(target, now)).toBe("PRESEASON · WK 1 IN 34D");
  });
});

describe("formatBetweenWeeksKickoffLabel", () => {
  it("formats a day-only kickoff label in America/Chicago (no clock time)", () => {
    // A Chicago start-of-day anchor for Thursday 2026-09-10 (05:00 UTC = CDT
    // midnight). The label names the weekday only; we have no kickoff clock time.
    const target = new Date("2026-09-10T05:00:00Z");
    expect(formatBetweenWeeksKickoffLabel(10, target)).toBe("WK 10 · KICKOFF THU");
  });

  it("includes the week number", () => {
    const target = new Date("2026-09-10T05:00:00Z");
    expect(formatBetweenWeeksKickoffLabel(3, target)).toContain("WK 3");
  });
});
