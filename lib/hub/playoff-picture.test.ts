import { describe, expect, it } from "vitest";
import {
  PLAYOFF_PICTURE_START_WEEK,
  buildDraftWatch,
  showPlayoffPicture,
} from "@/lib/hub/playoff-picture";
import type { DraftOrderTeam } from "@/lib/rookie-draft-order";

function team(id: string, maxPointsFor: number | null, wins = 5, losses = 5): DraftOrderTeam {
  return { franchiseId: id, wins, losses, ties: 0, maxPointsFor };
}

describe("showPlayoffPicture", () => {
  it("starts at week 8", () => {
    expect(PLAYOFF_PICTURE_START_WEEK).toBe(8);
    expect(showPlayoffPicture(7, 15)).toBe(false);
    expect(showPlayoffPicture(8, 15)).toBe(true);
    expect(showPlayoffPicture(14, 15)).toBe(true);
  });

  it("stops when the playoffs start", () => {
    expect(showPlayoffPicture(15, 15)).toBe(false);
    expect(showPlayoffPicture(16, 15)).toBe(false);
  });

  it("still shows from week 8 when the season has no playoff start week", () => {
    expect(showPlayoffPicture(9, null)).toBe(true);
    expect(showPlayoffPicture(9, undefined)).toBe(true);
  });

  it("never shows for a non-numeric week", () => {
    expect(showPlayoffPicture(Number.NaN, 15)).toBe(false);
  });
});

describe("buildDraftWatch", () => {
  const teams = [
    team("a", 1500),
    team("b", 1400),
    team("c", 1300),
    team("d", 1200),
    team("e", 1100),
    team("f", 1000),
    team("g", 1350),
    team("h", 1250),
    team("i", 1150),
    team("j", 1050),
    team("k", 1450),
    team("l", 1600),
  ];
  const field = ["a", "b", "c", "d", "k", "l"];

  it("gives the non-playoff teams the first picks, lowest Max PF first", () => {
    const watch = buildDraftWatch(teams, field);
    expect(watch.entries.map((e) => e.franchiseId)).toEqual(["f", "j", "e", "i", "h", "g"]);
    expect(watch.entries.map((e) => e.pick)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(watch.entries[0].maxPointsFor).toBe(1000);
  });

  it("reports the playoff teams' picks as a bracket range, not invented slots", () => {
    expect(buildDraftWatch(teams, field).bracketPicks).toEqual({ from: 7, to: 12 });
  });

  it("breaks a Max PF tie by the worse record", () => {
    const tied = [...teams.filter((t) => t.franchiseId !== "j"), team("j", 1000, 3, 7)];
    const order = buildDraftWatch(tied, field).entries.map((e) => e.franchiseId);
    expect(order.slice(0, 2)).toEqual(["j", "f"]);
  });

  it("is empty without a projected field or teams", () => {
    expect(buildDraftWatch(teams, [])).toEqual({ entries: [], bracketPicks: null });
    expect(buildDraftWatch([], field)).toEqual({ entries: [], bracketPicks: null });
  });
});
