import { describe, it, expect } from "vitest";
import {
  parseGameDate,
  resolveSeasonSegment,
  KICKOFF_LEAD_DAYS,
} from "./season-segment";

const WEEK1 = "2026-09-09"; // earliest week-1 game
const week1Ms = Date.UTC(2026, 8, 9);
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
});
