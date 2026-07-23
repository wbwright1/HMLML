import { describe, it, expect } from "vitest";
import {
  computePlayoffRaceTags,
  computeStandingsRaceTags,
  type RaceTeam,
} from "@/lib/queries/playoff-race";

// 14-game regular season, 6 berths (3 division winners + 3 wildcards).
const WEEKS = 14;
const BERTHS = 6;

function team(
  id: string,
  wins: number,
  played: number,
  division: number | null = null
): RaceTeam {
  return { franchiseId: id, wins, losses: played - wins, ties: 0, division };
}

describe("computePlayoffRaceTags — league-wide (no divisions)", () => {
  it("clinches a team no one else can catch even if it loses out", () => {
    // Leader done at 12-2; only a handful of teams could even reach 12.
    const teams: RaceTeam[] = [
      team("leader", 12, 14),
      team("b", 9, 14), // ceil 9
      team("c", 8, 14),
      team("d", 8, 14),
      team("e", 7, 14),
      team("f", 6, 14),
      team("g", 5, 14),
      team("h", 4, 14),
    ];
    const tags = computePlayoffRaceTags(teams, {
      berths: BERTHS,
      regularSeasonWeeks: WEEKS,
      isFinalWeek: false,
    });
    expect(tags.get("leader")).toBe("clinched");
  });

  it("eliminates a team when at least `berths` others are out of reach ahead", () => {
    // x is 1-13 (ceil 2). Six teams already have >2 wins locked in.
    const teams: RaceTeam[] = [
      team("x", 1, 13),
      team("a", 9, 14),
      team("b", 8, 14),
      team("c", 7, 14),
      team("d", 6, 14),
      team("e", 5, 14),
      team("f", 4, 14),
    ];
    const tags = computePlayoffRaceTags(teams, {
      berths: BERTHS,
      regularSeasonWeeks: WEEKS,
      isFinalWeek: false,
    });
    expect(tags.get("x")).toBe("eliminated");
  });

  it("does not clinch or eliminate a mid-pack team with games left", () => {
    const teams: RaceTeam[] = [
      team("a", 7, 10),
      team("b", 6, 10),
      team("c", 6, 10),
      team("d", 5, 10),
      team("e", 5, 10),
      team("f", 5, 10),
      team("g", 4, 10),
      team("h", 4, 10),
    ];
    const tags = computePlayoffRaceTags(teams, {
      berths: BERTHS,
      regularSeasonWeeks: WEEKS,
      isFinalWeek: false,
    });
    expect(tags.size).toBe(0);
  });

  it("flags win-and-in only in the final week when a win would clinch", () => {
    // Final week; team `w` at 8-5 with one to play (ceil 9). Six others are
    // locked at 8 wins (reach w's floor of 8, so w is NOT already clinched),
    // but only one other team can reach 9, so winning the last game clinches.
    const teams: RaceTeam[] = [
      team("w", 8, 13), // ceil 9
      team("a", 9, 14), // done at 9 -> can reach 9
      team("b", 8, 14), // done at 8 -> reaches 8, capped below 9
      team("c", 8, 14),
      team("d", 8, 14),
      team("e", 8, 14),
      team("f", 8, 14),
      team("g", 8, 14),
      team("h", 4, 14),
      team("i", 4, 14),
      team("j", 4, 14),
      team("k", 4, 14),
    ];
    const tags = computePlayoffRaceTags(teams, {
      berths: BERTHS,
      regularSeasonWeeks: WEEKS,
      isFinalWeek: true,
    });
    // At floor 8, seven others (a plus b-g) reach 8 -> not clinched yet. If w
    // wins to 9, only `a` can reach 9, so fewer than `berths` teams remain
    // ahead-or-level -> a win clinches.
    expect(tags.get("w")).toBe("win-and-in");
  });
});

describe("computePlayoffRaceTags — divisions", () => {
  // Helper: a full 12-team, 3-division league where one team runs away with
  // division 0.
  function leagueWithRunawayDiv0(): RaceTeam[] {
    return [
      team("d0-lead", 12, 14, 0), // floor 12
      team("d0-2", 7, 14, 0), // ceil 7
      team("d0-3", 6, 14, 0),
      team("d0-4", 5, 14, 0),
      team("d1-1", 10, 14, 1),
      team("d1-2", 9, 14, 1),
      team("d1-3", 6, 14, 1),
      team("d1-4", 5, 14, 1),
      team("d2-1", 10, 14, 2),
      team("d2-2", 9, 14, 2),
      team("d2-3", 6, 14, 2),
      team("d2-4", 4, 14, 2),
    ];
  }

  it("clinches a runaway division winner via the division path", () => {
    const tags = computePlayoffRaceTags(leagueWithRunawayDiv0(), {
      berths: BERTHS,
      regularSeasonWeeks: WEEKS,
      isFinalWeek: false,
    });
    expect(tags.get("d0-lead")).toBe("clinched");
  });

  it("does NOT eliminate a low-win team that can still win its weak division", () => {
    // x trails badly overall, but every division-mate is still catchable, so a
    // division title (and auto-berth) remains possible -> no elimination tag.
    const teams: RaceTeam[] = [
      team("x", 3, 10, 0), // ceil 7, mates all reachable
      team("m1", 4, 10, 0), // ceil 8, but floor 4 <= x.ceil 7 -> catchable
      team("m2", 4, 10, 0),
      team("m3", 3, 10, 0),
      // Six clearly-ahead teams in other divisions.
      team("a", 12, 14, 1),
      team("b", 11, 14, 1),
      team("c", 10, 14, 1),
      team("d", 12, 14, 2),
      team("e", 11, 14, 2),
      team("f", 10, 14, 2),
    ];
    const tags = computePlayoffRaceTags(teams, {
      berths: BERTHS,
      regularSeasonWeeks: WEEKS,
      isFinalWeek: false,
    });
    expect(tags.get("x")).toBeUndefined();
  });

  it("emits NO tags when the division column is only partially populated", () => {
    // A clear runaway leader that WOULD clinch under a full division picture,
    // mixed with teams missing a division -> untrustworthy, so no tags at all.
    const teams: RaceTeam[] = [
      team("d0-lead", 12, 14, 0),
      team("d0-2", 7, 14, 0),
      team("d0-3", 6, 14, 0),
      team("d0-4", 5, 14, 0),
      team("mystery", 9, 14, null), // no division on file
      team("d1-2", 8, 14, 1),
      team("d1-3", 6, 14, 1),
      team("d1-4", 5, 14, 1),
      team("d2-1", 10, 14, 2),
      team("d2-2", 9, 14, 2),
      team("d2-3", 6, 14, 2),
      team("d2-4", 4, 14, 2),
    ];
    const tags = computePlayoffRaceTags(teams, {
      berths: BERTHS,
      regularSeasonWeeks: WEEKS,
      isFinalWeek: false,
    });
    expect(tags.size).toBe(0);
  });

  it("eliminates a team that cannot win its division and has `berths` teams out of reach", () => {
    const teams: RaceTeam[] = [
      team("x", 2, 14, 0), // done, ceil 2, cannot win division (mate ahead)
      team("m1", 9, 14, 0), // mate out of reach ahead
      team("m2", 8, 14, 0),
      team("m3", 7, 14, 0),
      team("a", 10, 14, 1),
      team("b", 9, 14, 1),
      team("c", 8, 14, 2),
      team("d", 7, 14, 2),
    ];
    const tags = computePlayoffRaceTags(teams, {
      berths: BERTHS,
      regularSeasonWeeks: WEEKS,
      isFinalWeek: false,
    });
    expect(tags.get("x")).toBe("eliminated");
  });
});

describe("computeStandingsRaceTags — gating", () => {
  const mkStandings = (division: number | null) =>
    [
      { franchiseId: "a", wins: 12, losses: 2, ties: 0, division },
      { franchiseId: "b", wins: 3, losses: 11, ties: 0, division },
    ] as unknown as Parameters<typeof computeStandingsRaceTags>[0];

  it("returns nothing before the minimum race week", () => {
    const tags = computeStandingsRaceTags(mkStandings(null), {
      week: 5,
      playoffWeekStart: 15,
    });
    expect(tags.size).toBe(0);
  });

  it("returns nothing once past the regular season", () => {
    const tags = computeStandingsRaceTags(mkStandings(null), {
      week: 15,
      playoffWeekStart: 15,
    });
    expect(tags.size).toBe(0);
  });

  it("returns nothing when no games have been played (all 0-0)", () => {
    const standings = [
      { franchiseId: "a", wins: 0, losses: 0, ties: 0, division: null },
      { franchiseId: "b", wins: 0, losses: 0, ties: 0, division: null },
    ] as unknown as Parameters<typeof computeStandingsRaceTags>[0];
    const tags = computeStandingsRaceTags(standings, {
      week: 10,
      playoffWeekStart: 15,
    });
    expect(tags.size).toBe(0);
  });
});
