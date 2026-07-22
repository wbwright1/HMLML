import { describe, it, expect } from "vitest";
import {
  parseKickoff,
  earliestKickoff,
  computeIsBetweenWeeks,
} from "./kickoff";

// America/Chicago weekday of an instant, for asserting date-only anchoring.
function chicagoWeekday(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "America/Chicago",
  }).format(d);
}

describe("parseKickoff", () => {
  it("returns null for null/undefined/empty", () => {
    expect(parseKickoff(null)).toBeNull();
    expect(parseKickoff(undefined)).toBeNull();
    expect(parseKickoff("")).toBeNull();
  });

  it("returns null for an unparseable string", () => {
    expect(parseKickoff("not-a-date")).toBeNull();
  });

  it("anchors a date-only string to Chicago start-of-day (not UTC midnight)", () => {
    // Production data is date-only (Sleeper gives no clock time). 2026-09-10 is
    // a Thursday; UTC midnight would render as Wednesday evening in Chicago, so
    // the anchored instant MUST still read as Thursday in America/Chicago.
    const d = parseKickoff("2026-09-10");
    expect(d).toBeInstanceOf(Date);
    expect(chicagoWeekday(d!)).toBe("Thu");
    // CDT (UTC-5) in September: Chicago midnight is 05:00 UTC.
    expect(d?.toISOString()).toBe("2026-09-10T05:00:00.000Z");
  });

  it("anchors a winter date-only string across the DST boundary (CST, UTC-6)", () => {
    // 2026-12-10 is a Thursday; Chicago is on CST (UTC-6), so midnight is 06:00 UTC.
    const d = parseKickoff("2026-12-10");
    expect(chicagoWeekday(d!)).toBe("Thu");
    expect(d?.toISOString()).toBe("2026-12-10T06:00:00.000Z");
  });

  it("passes a full ISO timestamp straight through (Phase 2 time source)", () => {
    const d = parseKickoff("2026-09-10T20:15:00Z");
    expect(d?.getTime()).toBe(new Date("2026-09-10T20:15:00Z").getTime());
  });
});

describe("earliestKickoff", () => {
  it("returns null when there are no games", () => {
    expect(earliestKickoff([])).toBeNull();
  });

  it("ignores non-pre_game games", () => {
    // Production-shaped date-only rows.
    expect(
      earliestKickoff([
        { gameDate: "2026-09-10", status: "complete" },
        { gameDate: "2026-09-11", status: "in_game" },
      ])
    ).toBeNull();
  });

  it("returns the earliest pre_game kickoff (date-only, Chicago-anchored)", () => {
    const result = earliestKickoff([
      { gameDate: "2026-09-14", status: "pre_game" },
      { gameDate: "2026-09-11", status: "pre_game" }, // earliest
      { gameDate: "2026-09-13", status: "pre_game" },
    ]);
    // 2026-09-11 Chicago start-of-day (CDT, UTC-5) = 05:00 UTC.
    expect(result?.toISOString()).toBe("2026-09-11T05:00:00.000Z");
  });

  it("skips pre_game rows with an unparseable/null date", () => {
    const result = earliestKickoff([
      { gameDate: null, status: "pre_game" },
      { gameDate: "garbage", status: "pre_game" },
      { gameDate: "2026-09-13", status: "pre_game" },
    ]);
    expect(result?.toISOString()).toBe("2026-09-13T05:00:00.000Z");
  });
});

describe("computeIsBetweenWeeks", () => {
  it("is false outside the regular season", () => {
    expect(
      computeIsBetweenWeeks({
        seasonType: "pre",
        matchupStatuses: ["scheduled", "scheduled"],
      })
    ).toBe(false);
  });

  it("is false when a game is live (an in_progress status fails every-scheduled)", () => {
    expect(
      computeIsBetweenWeeks({
        seasonType: "regular",
        matchupStatuses: ["scheduled", "in_progress"],
      })
    ).toBe(false);
  });

  it("is false when any matchup has completed (mid-week)", () => {
    expect(
      computeIsBetweenWeeks({
        seasonType: "regular",
        matchupStatuses: ["scheduled", "complete"],
      })
    ).toBe(false);
  });

  it("is false when there are no matchups (unsynced week)", () => {
    expect(
      computeIsBetweenWeeks({
        seasonType: "regular",
        matchupStatuses: [],
      })
    ).toBe(false);
  });

  it("is true when regular season and all matchups scheduled", () => {
    expect(
      computeIsBetweenWeeks({
        seasonType: "regular",
        matchupStatuses: ["scheduled", "scheduled", "scheduled"],
      })
    ).toBe(true);
  });
});
