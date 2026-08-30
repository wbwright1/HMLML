import { describe, it, expect } from "vitest";
import {
  bestWeekOf,
  deriveStreak,
  formatAtsRecord,
  formatStreak,
  isNotableWeek,
  pickOutcome,
  tallyOutcomes,
  unitsForOutcome,
  type PickOutcome,
  type WeeklyRecord,
} from "./grading";

describe("pickOutcome", () => {
  it("wins when the picked side covers", () => {
    // home -3.5, wins by 10 -> covers
    expect(pickOutcome(110, 100, { side: "home", spreadAtPick: -3.5 })).toBe(
      "win",
    );
  });

  it("loses when the picked side does not cover", () => {
    // home -10.5, wins by only 3 -> does not cover
    expect(pickOutcome(103, 100, { side: "home", spreadAtPick: -10.5 })).toBe(
      "loss",
    );
  });

  it("pushes when the margin lands on exactly the spread", () => {
    expect(pickOutcome(100.5, 100, { side: "home", spreadAtPick: -0.5 })).toBe(
      "push",
    );
    expect(pickOutcome(100.5, 100, { side: "away", spreadAtPick: -0.5 })).toBe(
      "push",
    );
  });

  it("grades the away side the same way", () => {
    // away is +3.5 (home spread -3.5); away loses by only 1, so away covers
    expect(pickOutcome(101, 100, { side: "away", spreadAtPick: -3.5 })).toBe(
      "win",
    );
  });

  it("grades against LIVE scores exactly like final scores (same function)", () => {
    // A game mid-play: the picked side is behind on the spread right now.
    expect(pickOutcome(40, 38, { side: "home", spreadAtPick: -3.5 })).toBe(
      "loss",
    );
  });
});

describe("unitsForOutcome", () => {
  it("pays a win at -110: a $10 stake wins $9.09", () => {
    expect(unitsForOutcome("win")).toBeCloseTo(9.09, 2);
  });

  it("loses the full $10 stake", () => {
    expect(unitsForOutcome("loss")).toBe(-10);
  });

  it("refunds a push to exactly zero", () => {
    expect(unitsForOutcome("push")).toBe(0);
  });
});

describe("deriveStreak", () => {
  it("reads a simple win streak", () => {
    expect(deriveStreak(["win", "win", "win", "loss"])).toEqual({
      type: "W",
      length: 3,
    });
  });

  it("reads a simple loss streak", () => {
    expect(deriveStreak(["loss", "loss", "win"])).toEqual({
      type: "L",
      length: 2,
    });
  });

  it("skips pushes without breaking the streak", () => {
    expect(deriveStreak(["win", "push", "win", "loss"])).toEqual({
      type: "W",
      length: 2,
    });
  });

  it("returns null with no graded history", () => {
    expect(deriveStreak([])).toBeNull();
  });

  it("returns null when everything so far is a push", () => {
    expect(deriveStreak(["push", "push"])).toBeNull();
  });
});

describe("formatStreak", () => {
  it("formats a win streak", () => {
    expect(formatStreak({ type: "W", length: 6 })).toBe("W6");
  });

  it("formats null as null", () => {
    expect(formatStreak(null)).toBeNull();
  });
});

describe("tallyOutcomes", () => {
  it("tallies wins, losses, pushes, and units together", () => {
    const outcomes: PickOutcome[] = ["win", "win", "loss", "push"];
    const tally = tallyOutcomes(outcomes);
    expect(tally.wins).toBe(2);
    expect(tally.losses).toBe(1);
    expect(tally.pushes).toBe(1);
    expect(tally.units).toBeCloseTo(9.09 * 2 - 10, 2);
  });

  it("excludes pushes from win percentage", () => {
    const tally = tallyOutcomes(["win", "win", "loss", "push"]);
    expect(tally.winPct).toBeCloseTo(2 / 3, 5);
  });

  it("reports a zero win percentage with no decisions at all", () => {
    expect(tallyOutcomes([]).winPct).toBe(0);
    expect(tallyOutcomes(["push"]).winPct).toBe(0);
  });
});

describe("formatAtsRecord", () => {
  it("formats a plain record with no pushes", () => {
    expect(formatAtsRecord(tallyOutcomes(["win", "win", "loss"]))).toBe(
      "2-1",
    );
  });

  it("shows the push count only once one has actually happened", () => {
    expect(
      formatAtsRecord(tallyOutcomes(["win", "loss", "push"])),
    ).toBe("1-1-1");
  });
});

describe("isNotableWeek / bestWeekOf", () => {
  const week = (w: number, wins: number, losses: number): WeeklyRecord => ({
    week: w,
    wins,
    losses,
    pushes: 0,
  });

  it("requires at least 4 graded picks to be notable", () => {
    expect(isNotableWeek(week(1, 3, 0))).toBe(false);
    expect(isNotableWeek(week(1, 4, 0))).toBe(true);
  });

  it("picks the highest win count among notable weeks", () => {
    const weeks = [week(1, 4, 0), week(2, 6, 0), week(3, 5, 1)];
    expect(bestWeekOf(weeks)).toEqual(week(2, 6, 0));
  });

  it("ignores weeks that never reached the notability floor", () => {
    const weeks = [week(1, 3, 0), week(2, 2, 0)];
    expect(bestWeekOf(weeks)).toBeNull();
  });

  it("breaks ties toward fewer losses", () => {
    const weeks = [week(1, 4, 1), week(2, 4, 0)];
    expect(bestWeekOf(weeks)).toEqual(week(2, 4, 0));
  });

  it("returns null with no weeks at all", () => {
    expect(bestWeekOf([])).toBeNull();
  });
});
