import { describe, it, expect } from "vitest";
import { resolveHubSeasonType, isPreWeekOne } from "./season-state";

describe("resolveHubSeasonType", () => {
  it("maps NFL regular season to regular", () => {
    expect(
      resolveHubSeasonType({
        nflSeasonType: "regular",
        dbSeasonStatus: null,
        hasLiveMatchups: true,
        nothingPlayedYet: false,
        weekOneLeadWindow: false,
      })
    ).toBe("regular");
  });

  it("maps NFL post season to post", () => {
    expect(
      resolveHubSeasonType({
        nflSeasonType: "post",
        dbSeasonStatus: null,
        hasLiveMatchups: false,
        nothingPlayedYet: false,
        weekOneLeadWindow: false,
      })
    ).toBe("post");
  });

  it("maps NFL preseason to pre", () => {
    expect(
      resolveHubSeasonType({
        nflSeasonType: "pre",
        dbSeasonStatus: "in_season",
        hasLiveMatchups: false,
        nothingPlayedYet: false,
        weekOneLeadWindow: false,
      })
    ).toBe("pre");
  });

  it("falls back to db status when NFL state is unavailable", () => {
    expect(
      resolveHubSeasonType({
        nflSeasonType: null,
        dbSeasonStatus: "in_season",
        hasLiveMatchups: false,
        nothingPlayedYet: false,
        weekOneLeadWindow: false,
      })
    ).toBe("regular");
    expect(
      resolveHubSeasonType({
        nflSeasonType: null,
        dbSeasonStatus: "pre_draft",
        hasLiveMatchups: false,
        nothingPlayedYet: false,
        weekOneLeadWindow: false,
      })
    ).toBe("pre");
    expect(
      resolveHubSeasonType({
        nflSeasonType: null,
        dbSeasonStatus: "complete",
        hasLiveMatchups: false,
        nothingPlayedYet: false,
        weekOneLeadWindow: false,
      })
    ).toBe("pre");
  });

  it("defaults to off with no NFL state or db status", () => {
    expect(
      resolveHubSeasonType({
        nflSeasonType: null,
        dbSeasonStatus: null,
        hasLiveMatchups: false,
        nothingPlayedYet: false,
        weekOneLeadWindow: false,
      })
    ).toBe("off");
  });

  it("overrides regular to pre when nothing has been played yet and nothing is live", () => {
    expect(
      resolveHubSeasonType({
        nflSeasonType: "regular",
        dbSeasonStatus: null,
        hasLiveMatchups: false,
        nothingPlayedYet: true,
        weekOneLeadWindow: false,
      })
    ).toBe("pre");
  });

  it("keeps regular during the week-one lead window even when everyone is 0-0", () => {
    expect(
      resolveHubSeasonType({
        nflSeasonType: "regular",
        dbSeasonStatus: "in_season",
        hasLiveMatchups: false,
        nothingPlayedYet: true,
        weekOneLeadWindow: true,
      })
    ).toBe("regular");
  });

  it("lead window alone never promotes a real preseason state", () => {
    expect(
      resolveHubSeasonType({
        nflSeasonType: "pre",
        dbSeasonStatus: "in_season",
        hasLiveMatchups: false,
        nothingPlayedYet: true,
        weekOneLeadWindow: true,
      })
    ).toBe("pre");
  });

  it("does not override to pre when a game is live, even if nothing has been played yet", () => {
    expect(
      resolveHubSeasonType({
        nflSeasonType: "regular",
        dbSeasonStatus: null,
        hasLiveMatchups: true,
        nothingPlayedYet: true,
        weekOneLeadWindow: false,
      })
    ).toBe("regular");
  });
});

describe("isPreWeekOne", () => {
  it("is false for empty standings (unsynced season)", () => {
    expect(isPreWeekOne([])).toBe(false);
  });

  it("is true when every team is 0-0-0", () => {
    expect(
      isPreWeekOne([
        { wins: 0, losses: 0, ties: 0 },
        { wins: 0, losses: 0, ties: 0 },
      ])
    ).toBe(true);
  });

  it("treats nulls as zero", () => {
    expect(
      isPreWeekOne([
        { wins: null, losses: null, ties: null },
        { wins: 0, losses: 0, ties: 0 },
      ])
    ).toBe(true);
  });

  it("is false once any team has a result", () => {
    expect(
      isPreWeekOne([
        { wins: 1, losses: 0, ties: 0 },
        { wins: 0, losses: 1, ties: 0 },
      ])
    ).toBe(false);
  });
});
