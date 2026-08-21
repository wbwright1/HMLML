import { describe, expect, it } from "vitest";
import {
  buildBracketStage,
  getAdvancingTeam,
  getPlacementColumn,
} from "@/lib/playoff-bracket-layout";
import type { BracketType } from "@/lib/playoff-bracket";
import type {
  BracketMatchView,
  BracketRound,
  BracketTeam,
} from "@/lib/queries/playoff-bracket";

// Fixtures mirror the real stored shapes: 2025's 6-team/3-round winners
// bracket (two byes), the same season's inverted Toilet Bowl, 2021's 2-round
// losers bracket, and an undecided in-progress bracket.

function team(rosterId: number, advanced: boolean, points: number | null): BracketTeam {
  return {
    rosterId,
    franchiseId: `f${rosterId}`,
    franchiseName: `Team ${rosterId}`,
    franchiseSlug: `team-${rosterId}`,
    franchiseAbbreviation: `T${rosterId}`,
    franchiseBrandingColor: "#908440",
    avatarUrl: null,
    points,
    advanced,
  };
}

interface MatchSpec {
  m: number;
  round: number;
  placement?: number | null;
  t1?: BracketTeam | null;
  t2?: BracketTeam | null;
  from1?: number | null;
  from2?: number | null;
  decided?: boolean;
}

function makeMatch(spec: MatchSpec, type: BracketType): BracketMatchView {
  return {
    matchNumber: spec.m,
    bracketType: type,
    round: spec.round,
    week: 14 + spec.round,
    placement: spec.placement ?? null,
    placementLabel: spec.placement === 1 ? "Championship" : null,
    team1: spec.t1 ?? null,
    team2: spec.t2 ?? null,
    team1FromMatch: spec.from1 ?? null,
    team2FromMatch: spec.from2 ?? null,
    decided: spec.decided ?? Boolean(spec.t1?.advanced || spec.t2?.advanced),
  };
}

function makeRounds(specs: MatchSpec[], type: BracketType): BracketRound[] {
  const rounds = new Map<number, BracketMatchView[]>();
  for (const spec of specs) {
    const list = rounds.get(spec.round) ?? [];
    list.push(makeMatch(spec, type));
    rounds.set(spec.round, list);
  }
  return [...rounds.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, matches]) => ({
      round,
      week: 14 + round,
      label: `Round ${round}`,
      matches: matches.sort((a, b) => a.matchNumber - b.matchNumber),
    }));
}

// 2025 winners, exactly as stored: rosters 11 and 4 drew first-round byes,
// and note that only the round-3 rows kept their team1FromMatch/team2FromMatch
// references. Sleeper drops the feeder once the slot resolves, so the layout
// has to re-derive the round-1 -> round-2 links from advancement.
const WINNERS_2025 = makeRounds(
  [
    { m: 1, round: 1, t1: team(7, false, 129.92), t2: team(2, true, 171.22) },
    { m: 2, round: 1, t1: team(6, true, 145.2), t2: team(1, false, 111.3) },
    { m: 3, round: 2, t1: team(11, true, 230.88), t2: team(6, false, 202.88) },
    { m: 4, round: 2, t1: team(4, false, 86.42), t2: team(2, true, 157.74) },
    {
      m: 5,
      round: 2,
      placement: 5,
      t1: team(1, true, 127.26),
      t2: team(7, false, 116.24),
    },
    {
      m: 6,
      round: 3,
      placement: 1,
      t1: team(11, true, 180.34),
      t2: team(2, false, 129.16),
      from1: 3,
      from2: 4,
    },
    {
      m: 7,
      round: 3,
      placement: 3,
      t1: team(6, true, 137.76),
      t2: team(4, false, 98.64),
      from1: 3,
      from2: 4,
    },
  ],
  "winners",
);

describe("buildBracketStage: 6-team, 3-round winners bracket", () => {
  const stage = buildBracketStage(WINNERS_2025);

  it("lays out four round-1 slots in pairing order with byes interleaved", () => {
    const round1 = stage.cells
      .filter((c) => c.column === 0)
      .sort((a, b) => a.topUnits - b.topUnits);

    expect(round1.map((c) => c.kind)).toEqual(["bye", "match", "bye", "match"]);
    expect(round1.map((c) => c.topUnits)).toEqual([0, 1, 2, 3]);
    // Exactly two byes: the round-2 teams that played no round-1 game.
    expect(round1[0].byeTeam?.rosterId).toBe(11);
    expect(round1[2].byeTeam?.rosterId).toBe(4);
    // Feeder pairs sit adjacent to the bye they play next, so no connector
    // crosses another: roster 6 came out of match 2, roster 2 out of match 1.
    expect(round1[1].match?.matchNumber).toBe(2);
    expect(round1[3].match?.matchNumber).toBe(1);
  });

  it("centers each cell on the midpoint of its two feeders", () => {
    const byNumber = (n: number) =>
      stage.cells.find((c) => c.match?.matchNumber === n);

    expect(byNumber(3)).toMatchObject({ column: 1, topUnits: 0.5 });
    expect(byNumber(4)).toMatchObject({ column: 1, topUnits: 2.5 });
    expect(byNumber(6)).toMatchObject({ column: 2, topUnits: 1.5, isFinal: true });
    expect(stage.slotCount).toBe(4);
    expect(stage.columnCount).toBe(3);
  });

  it("pulls the placement games out of the columns into the lane", () => {
    expect(stage.placementMatches.map((m) => m.matchNumber)).toEqual([5, 7]);
    // ...and never into a bracket column.
    for (const cell of stage.cells) {
      expect([5, 7]).not.toContain(cell.match?.matchNumber);
    }
    // The 5th-place game was played in round 2, the 3rd-place game in round 3.
    const fifth = stage.placementMatches.find((m) => m.matchNumber === 5)!;
    const third = stage.placementMatches.find((m) => m.matchNumber === 7)!;
    expect(getPlacementColumn(stage, fifth)).toBe(1);
    expect(getPlacementColumn(stage, third)).toBe(2);
  });

  it("crowns the advancing team of the final and traces its road", () => {
    expect(stage.hasCapsule).toBe(true);
    expect(stage.champion?.rosterId).toBe(11);
    expect(stage.runnerUp?.rosterId).toBe(2);

    const road = stage.connectors.filter((c) => c.onRoad);
    // Bye -> semifinal (3 segments), semifinal -> final (3), final -> capsule.
    expect(road).toHaveLength(7);
    expect(road.some((c) => c.segment === "capsule")).toBe(true);
    // The road starts at the champion's bye cell in column 0, row 0.
    expect(
      road.some((c) => c.column === 0 && c.fromUnits === 0 && c.segment === "out"),
    ).toBe(true);
    // Every base connector is drawn as well.
    expect(stage.connectors.filter((c) => !c.onRoad)).toHaveLength(19);
  });
});

// The same season's Toilet Bowl: advancement is inverted. Roster 12 SANK the
// final with the LOWER score, and roster 8 escaped with the higher one.
const LOSERS_2025 = makeRounds(
  [
    { m: 1, round: 1, t1: team(8, true, 134.7), t2: team(9, false, 139.78) },
    { m: 2, round: 1, t1: team(10, false, 187.0), t2: team(11, true, 128.42) },
    { m: 3, round: 2, t1: team(7, false, 145.96), t2: team(8, true, 137.3) },
    { m: 4, round: 2, t1: team(12, true, 110.58), t2: team(11, false, 128.4) },
    {
      m: 6,
      round: 3,
      placement: 1,
      t1: team(8, false, 114.42),
      t2: team(12, true, 105.66),
      from1: 3,
      from2: 4,
    },
  ],
  "losers",
);

describe("buildBracketStage: THE INVERSION", () => {
  const stage = buildBracketStage(LOSERS_2025);

  it("traces the road of the team that advanced by LOSING", () => {
    // A layout that re-derived advancement from points would crown roster 8
    // (114.42) here instead of roster 12 (105.66).
    expect(stage.champion?.rosterId).toBe(12);
    expect(stage.champion?.points).toBe(105.66);
    expect(stage.runnerUp?.rosterId).toBe(8);

    const road = stage.connectors.filter((c) => c.onRoad);
    // Roster 12 had a bye, sank round 2, then sank the final: 3 + 3 + capsule.
    expect(road).toHaveLength(7);
    // The bye cell for roster 12 is the one the road leaves from.
    const byeCell = stage.cells.find((c) => c.byeTeam?.rosterId === 12);
    expect(byeCell).toBeDefined();
    expect(
      road.some(
        (c) => c.segment === "out" && c.fromUnits === byeCell!.topUnits,
      ),
    ).toBe(true);
  });

  it("reads advancement from the stored flag, not the scores", () => {
    const finalMatch = stage.finalMatch!;
    expect(getAdvancingTeam(finalMatch)?.rosterId).toBe(12);
    const scores = [finalMatch.team1!.points!, finalMatch.team2!.points!];
    expect(getAdvancingTeam(finalMatch)!.points).toBe(Math.min(...scores));
  });
});

// 2021-style 4-team, 2-round losers bracket: no byes at all.
const LOSERS_2021 = makeRounds(
  [
    { m: 1, round: 1, t1: team(9, true, 88.1), t2: team(10, false, 101.4) },
    { m: 2, round: 1, t1: team(11, false, 120.2), t2: team(12, true, 95.6) },
    {
      m: 3,
      round: 2,
      placement: 1,
      t1: team(9, true, 90.0),
      t2: team(12, false, 112.5),
      from1: 1,
      from2: 2,
    },
  ],
  "losers",
);

describe("buildBracketStage: 4-team, 2-round bracket", () => {
  const stage = buildBracketStage(LOSERS_2021);

  it("places two round-1 matches and a centered final, with no byes", () => {
    expect(stage.columnCount).toBe(2);
    expect(stage.slotCount).toBe(2);
    expect(stage.cells.filter((c) => c.kind === "bye")).toHaveLength(0);
    expect(stage.cells.find((c) => c.match?.matchNumber === 3)).toMatchObject({
      column: 1,
      topUnits: 0.5,
      isFinal: true,
    });
  });

  it("traces a two-segment road for the sinker", () => {
    expect(stage.champion?.rosterId).toBe(9);
    // Round-1 match -> final (3 segments) + the capsule line.
    expect(stage.connectors.filter((c) => c.onRoad)).toHaveLength(4);
  });
});

// An in-progress bracket: round 1 played, everything after it unresolved.
const UNDECIDED = makeRounds(
  [
    { m: 1, round: 1, t1: team(4, true, 120.0), t2: team(5, false, 99.0) },
    { m: 2, round: 1, t1: team(3, true, 130.0), t2: team(6, false, 110.0) },
    { m: 3, round: 2, t1: team(1, false, null), t2: null, from2: 1, decided: false },
    { m: 4, round: 2, t1: team(2, false, null), t2: null, from2: 2, decided: false },
    {
      m: 5,
      round: 3,
      placement: 1,
      t1: null,
      t2: null,
      from1: 3,
      from2: 4,
      decided: false,
    },
  ],
  "winners",
);

describe("buildBracketStage: undecided bracket", () => {
  const stage = buildBracketStage(UNDECIDED);

  it("renders the full shape with no capsule and no road", () => {
    expect(stage.hasCapsule).toBe(false);
    expect(stage.champion).toBeNull();
    expect(stage.connectors.filter((c) => c.onRoad)).toHaveLength(0);
    expect(stage.cells.filter((c) => c.column === 0)).toHaveLength(4);
  });

  it("keeps the byes it does know about", () => {
    const byes = stage.cells.filter((c) => c.kind === "bye");
    expect(byes.map((c) => c.byeTeam?.rosterId).sort()).toEqual([1, 2]);
  });
});

describe("buildBracketStage: robustness", () => {
  it("returns an empty stage for a season with no bracket rows", () => {
    const stage = buildBracketStage([]);
    expect(stage.cells).toHaveLength(0);
    expect(stage.columnCount).toBe(0);
    expect(stage.hasCapsule).toBe(false);
  });

  it("never drops a match the walk cannot reach from the final", () => {
    // Match 2's result feeds nothing: the final only references match 1.
    const orphaned = makeRounds(
      [
        { m: 1, round: 1, t1: team(1, true, 100), t2: team(2, false, 90) },
        { m: 2, round: 1, t1: team(3, true, 105), t2: team(4, false, 95) },
        {
          m: 3,
          round: 2,
          placement: 1,
          t1: team(1, true, 110),
          t2: team(5, false, 108),
          from1: 1,
        },
      ],
      "winners",
    );
    const stage = buildBracketStage(orphaned);
    const numbers = stage.cells
      .map((c) => c.match?.matchNumber)
      .filter((n): n is number => n != null);
    expect(numbers).toContain(2);
    expect(stage.cells.find((c) => c.match?.matchNumber === 2)?.column).toBe(0);
  });

  it("falls back to the sole last-round match when no placement is stored", () => {
    const noPlacements = makeRounds(
      [
        { m: 1, round: 1, t1: team(1, true, 100), t2: team(2, false, 90) },
        { m: 2, round: 1, t1: team(3, true, 105), t2: team(4, false, 95) },
        {
          m: 3,
          round: 2,
          t1: team(1, true, 110),
          t2: team(3, false, 108),
          from1: 1,
          from2: 2,
        },
      ],
      "winners",
    );
    const stage = buildBracketStage(noPlacements);
    expect(stage.finalMatch?.matchNumber).toBe(3);
    expect(stage.hasCapsule).toBe(true);
    expect(stage.champion?.rosterId).toBe(1);
  });
});
