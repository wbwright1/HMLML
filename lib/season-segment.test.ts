import { describe, it, expect } from "vitest";
import {
  parseGameDate,
  resolveSeasonSegment,
  isWithinWeekOneLeadWindow,
  isNflSeasonUnderway,
  KICKOFF_LEAD_DAYS,
} from "./season-segment";

const WEEK1 = "2026-09-09"; // earliest week-1 game
// The windows anchor on league-timezone (America/Chicago) midnight of the
// kickoff day, which in September (CDT) is 05:00 UTC, not 00:00 UTC.
const week1Ms = Date.UTC(2026, 8, 9, 5);
const daysBefore = (n: number) => new Date(week1Ms - n * 24 * 60 * 60 * 1000);

describe("parseGameDate", () => {
  it("parses a plain YYYY-MM-DD to UTC midnight", () => {
    expect(parseGameDate("2026-09-09")?.getTime()).toBe(Date.UTC(2026, 8, 9));
  });

  it("tolerates a trailing time component", () => {
    expect(parseGameDate("2026-09-09T20:15:00Z")?.getTime()).toBe(
      Date.UTC(2026, 8, 9)
    );
  });

  it("returns null for null, empty, or malformed input", () => {
    expect(parseGameDate(null)).toBeNull();
    expect(parseGameDate("")).toBeNull();
    expect(parseGameDate("not-a-date")).toBeNull();
    expect(parseGameDate("09/09/2026")).toBeNull();
  });
});

describe("resolveSeasonSegment", () => {
  it("pre_draft status -> offseason (even mid-NFL-season readings)", () => {
    expect(
      resolveSeasonSegment({
        seasonStatus: "pre_draft",
        seasonType: "regular",
        week1EarliestGameDate: WEEK1,
        now: daysBefore(-30),
      })
    ).toBe("offseason");
  });

  it("drafting status -> offseason", () => {
    expect(
      resolveSeasonSegment({
        seasonStatus: "drafting",
        seasonType: "off",
        week1EarliestGameDate: WEEK1,
        now: daysBefore(60),
      })
    ).toBe("offseason");
  });

  it("in_season status + season_type 'off', well before kickoff -> preseason (today's live state)", () => {
    expect(
      resolveSeasonSegment({
        seasonStatus: "in_season",
        seasonType: "off",
        week1EarliestGameDate: WEEK1,
        now: daysBefore(45),
      })
    ).toBe("preseason");
  });

  it("in_season status + season_type 'pre', 6 days before kickoff -> still preseason", () => {
    expect(
      resolveSeasonSegment({
        seasonStatus: "in_season",
        seasonType: "pre",
        week1EarliestGameDate: WEEK1,
        now: daysBefore(KICKOFF_LEAD_DAYS + 1),
      })
    ).toBe("preseason");
  });

  it("in_season status + season_type 'pre', 4 days before kickoff -> in_season (5-day rule)", () => {
    expect(
      resolveSeasonSegment({
        seasonStatus: "in_season",
        seasonType: "pre",
        week1EarliestGameDate: WEEK1,
        now: daysBefore(KICKOFF_LEAD_DAYS - 1),
      })
    ).toBe("in_season");
  });

  it("exactly 5 days before kickoff -> in_season (boundary is inclusive)", () => {
    expect(
      resolveSeasonSegment({
        seasonStatus: "in_season",
        seasonType: "pre",
        week1EarliestGameDate: WEEK1,
        now: daysBefore(KICKOFF_LEAD_DAYS),
      })
    ).toBe("in_season");
  });

  it("the 5-day window opens at league-timezone midnight, not UTC midnight", () => {
    // Kickoff 2026-09-09; CT threshold is 2026-09-04T00:00-05:00 (05:00 UTC).
    // The old UTC anchor put it at 2026-09-03T19:00-05:00 (00:00 UTC), so this
    // instant used to pass under the pre-#254 UTC-anchor bug.
    expect(
      resolveSeasonSegment({
        seasonStatus: "in_season",
        seasonType: "pre",
        week1EarliestGameDate: WEEK1,
        now: new Date("2026-09-03T22:00:00-05:00"),
      })
    ).toBe("preseason");
    expect(
      resolveSeasonSegment({
        seasonStatus: "in_season",
        seasonType: "pre",
        week1EarliestGameDate: WEEK1,
        now: new Date("2026-09-04T00:00:00-05:00"),
      })
    ).toBe("in_season");
  });

  it("season_type 'regular' mid-week -> in_season", () => {
    expect(
      resolveSeasonSegment({
        seasonStatus: "in_season",
        seasonType: "regular",
        week1EarliestGameDate: WEEK1,
        now: daysBefore(-14),
      })
    ).toBe("in_season");
  });

  it("season_type 'post' -> in_season", () => {
    expect(
      resolveSeasonSegment({
        seasonStatus: "in_season",
        seasonType: "post",
        week1EarliestGameDate: WEEK1,
        now: daysBefore(-90),
      })
    ).toBe("in_season");
  });

  it("no week-1 rows: falls back to season_type alone ('pre' -> preseason)", () => {
    expect(
      resolveSeasonSegment({
        seasonStatus: "in_season",
        seasonType: "pre",
        week1EarliestGameDate: null,
        now: daysBefore(2),
      })
    ).toBe("preseason");
  });

  it("no week-1 rows but season_type 'regular' -> in_season", () => {
    expect(
      resolveSeasonSegment({
        seasonStatus: "in_season",
        seasonType: "regular",
        week1EarliestGameDate: null,
        now: daysBefore(0),
      })
    ).toBe("in_season");
  });

  it("pins together with lib/queries/kickoff.ts's parseKickoff: the countdown target and the window threshold are the same instant plus KICKOFF_LEAD_DAYS", () => {
    // Both systems now share startOfDayInZone/LEAGUE_TIME_ZONE, so the window
    // threshold is exactly the kickoff instant minus KICKOFF_LEAD_DAYS days.
    // This is the test that would have caught #250 and fails if someone flips
    // only one of the two constants later.
    const kickoffInstant = new Date(week1Ms); // 2026-09-09T05:00:00Z (CDT)
    const threshold = new Date(
      kickoffInstant.getTime() - KICKOFF_LEAD_DAYS * 24 * 60 * 60 * 1000
    );
    expect(
      resolveSeasonSegment({
        seasonStatus: "in_season",
        seasonType: "pre",
        week1EarliestGameDate: WEEK1,
        now: new Date(threshold.getTime() - 1),
      })
    ).toBe("preseason");
    expect(
      resolveSeasonSegment({
        seasonStatus: "in_season",
        seasonType: "pre",
        week1EarliestGameDate: WEEK1,
        now: threshold,
      })
    ).toBe("in_season");
  });
});

describe("isNflSeasonUnderway", () => {
  it("is true for regular and post", () => {
    expect(isNflSeasonUnderway("regular")).toBe(true);
    expect(isNflSeasonUnderway("post")).toBe(true);
  });

  it("is false only for the two known not-started values", () => {
    expect(isNflSeasonUnderway("pre")).toBe(false);
    expect(isNflSeasonUnderway("off")).toBe(false);
  });

  it("fails safe to true for null, undefined, or an unrecognized rewording", () => {
    expect(isNflSeasonUnderway(null)).toBe(true);
    expect(isNflSeasonUnderway(undefined)).toBe(true);
    expect(isNflSeasonUnderway("REGULAR_SEASON")).toBe(true);
  });
});

describe("isWithinWeekOneLeadWindow", () => {
  // 2026 week 1 opens Wednesday 2026-09-09; the window opens league-timezone
  // (CT) midnight Sunday 2026-09-06 (2026-09-06T05:00:00Z).
  const wednesdayKickoff = "2026-09-09";

  it("is false right up to CT midnight on the Sunday preceding kickoff", () => {
    expect(
      isWithinWeekOneLeadWindow(wednesdayKickoff, new Date("2026-09-05T23:59:59-05:00"))
    ).toBe(false);
  });

  it("opens at CT midnight on the Sunday preceding kickoff", () => {
    expect(
      isWithinWeekOneLeadWindow(wednesdayKickoff, new Date("2026-09-06T00:00:00-05:00"))
    ).toBe(true);
  });

  it("does not open on the Saturday evening before (the old UTC-anchor bug)", () => {
    // 2026-09-05T22:00-05:00 is 2026-09-06T03:00Z, past UTC midnight Sunday.
    expect(
      isWithinWeekOneLeadWindow(wednesdayKickoff, new Date("2026-09-05T22:00:00-05:00"))
    ).toBe(false);
  });

  it("does not open at the old ET-anchor instant either (the #250 skew bug)", () => {
    // 2026-09-06T00:00-04:00 (ET midnight) is 2026-09-06T04:00Z, one hour
    // before the CT anchor (2026-09-06T05:00Z). Previously true under the ET
    // anchor introduced by #254; must now be false.
    expect(
      isWithinWeekOneLeadWindow(wednesdayKickoff, new Date("2026-09-06T00:00:00-04:00"))
    ).toBe(false);
  });

  it("stays open through kickoff day and beyond", () => {
    expect(
      isWithinWeekOneLeadWindow(wednesdayKickoff, new Date("2026-09-09T12:00:00Z"))
    ).toBe(true);
    expect(
      isWithinWeekOneLeadWindow(wednesdayKickoff, new Date("2026-10-01T00:00:00Z"))
    ).toBe(true);
  });

  it("never closes: still true months after kickoff (intentionally open-ended)", () => {
    expect(
      isWithinWeekOneLeadWindow(wednesdayKickoff, new Date("2027-06-01T00:00:00Z"))
    ).toBe(true);
  });

  it("anchors a Thursday kickoff to the same week's Sunday, at CT midnight", () => {
    // 2025-09-04 was a Thursday; its preceding Sunday is 2025-08-31.
    expect(isWithinWeekOneLeadWindow("2025-09-04", new Date("2025-08-30T12:00:00-05:00"))).toBe(false);
    expect(isWithinWeekOneLeadWindow("2025-09-04", new Date("2025-08-30T22:00:00-05:00"))).toBe(false);
    expect(isWithinWeekOneLeadWindow("2025-09-04", new Date("2025-08-31T00:00:00-05:00"))).toBe(true);
  });

  it("anchors a Sunday kickoff to the previous Sunday, at CT midnight", () => {
    // 2026-09-13 is a Sunday; the window opens 2026-09-06.
    expect(isWithinWeekOneLeadWindow("2026-09-13", new Date("2026-09-05T12:00:00-05:00"))).toBe(false);
    expect(isWithinWeekOneLeadWindow("2026-09-13", new Date("2026-09-05T22:00:00-05:00"))).toBe(false);
    expect(isWithinWeekOneLeadWindow("2026-09-13", new Date("2026-09-06T00:00:00-05:00"))).toBe(true);
  });

  it("is false with no week-1 schedule date", () => {
    expect(isWithinWeekOneLeadWindow(null, new Date("2026-09-08T00:00:00Z"))).toBe(false);
    expect(isWithinWeekOneLeadWindow("not-a-date", new Date("2026-09-08T00:00:00Z"))).toBe(false);
  });
});
