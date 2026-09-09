import { describe, it, expect } from "vitest";
import {
  bookWeekFor,
  kickoffWeekday,
  optimalProjectedTotals,
  pairRosterIds,
  REGULAR_SEASON_GAMES,
  type RosterSlotRow,
  type WeekProjectionRow,
} from "./book";

describe("pairRosterIds", () => {
  it("pins home to the numerically lower roster id", () => {
    expect(pairRosterIds(["11", "2"])).toEqual(["2", "11"]);
    expect(pairRosterIds(["2", "11"])).toEqual(["2", "11"]);
  });

  it("refuses anything that is not a clean pair", () => {
    expect(pairRosterIds(["3"])).toBeNull();
    expect(pairRosterIds(["3", "4", "5"])).toBeNull();
  });
});

describe("bookWeekFor", () => {
  it("trades the current week in the regular season and playoffs", () => {
    expect(bookWeekFor("regular", 9)).toBe(9);
    expect(bookWeekFor("post", 16)).toBe(16);
  });

  it("ignores the preseason week counter, which counts preseason weeks", () => {
    // The bug this exists to prevent: in late August Sleeper reports week 3,
    // which priced fantasy week 3 while the board displayed week 1.
    expect(bookWeekFor("pre", 3)).toBe(1);
    expect(bookWeekFor("off", 0)).toBe(1);
    expect(bookWeekFor(null, 7)).toBe(1);
  });

  it("never returns week zero", () => {
    expect(bookWeekFor("regular", 0)).toBe(1);
  });
});

describe("kickoffWeekday", () => {
  it("labels a stored game date with its weekday", () => {
    expect(kickoffWeekday("2026-09-13")).toBe("SUN");
    expect(kickoffWeekday("2026-09-10")).toBe("THU");
    expect(kickoffWeekday("2026-09-14")).toBe("MON");
  });

  it("returns null for anything unusable", () => {
    expect(kickoffWeekday(null)).toBeNull();
    expect(kickoffWeekday("")).toBeNull();
    expect(kickoffWeekday("week one")).toBeNull();
  });
});

describe("optimalProjectedTotals", () => {
  // QB, RB, RB, WR, WR, TE, FLEX = 7 starting slots.
  const ROSTER_POSITIONS = [
    "QB",
    "RB",
    "RB",
    "WR",
    "WR",
    "TE",
    "FLEX",
    "BN",
    "BN",
    "BN",
  ];

  const weekPlayer = (
    over: Partial<WeekProjectionRow> & Pick<WeekProjectionRow, "playerId" | "position">,
  ): WeekProjectionRow => ({
    rosterId: "1",
    nflTeam: "KC",
    projectedPoints: 0,
    started: true,
    ...over,
  });

  const slotPlayer = (
    over: Partial<RosterSlotRow> & Pick<RosterSlotRow, "playerId" | "position">,
  ): RosterSlotRow => ({
    rosterId: "1",
    slot: "bench",
    projPointsPpr: 0,
    projSeason: 2026,
    ...over,
  });

  // A full seven-slot lineup for roster 1, all on teams that have not kicked
  // off, worth 20 + 15 + 14 + 13 + 12 + 10 + 11 = 95.
  const fullWeek = (): WeekProjectionRow[] => [
    weekPlayer({ playerId: "qb", position: "QB", projectedPoints: 20 }),
    weekPlayer({ playerId: "rb1", position: "RB", projectedPoints: 15 }),
    weekPlayer({ playerId: "rb2", position: "RB", projectedPoints: 14 }),
    weekPlayer({ playerId: "wr1", position: "WR", projectedPoints: 13 }),
    weekPlayer({ playerId: "wr2", position: "WR", projectedPoints: 12 }),
    weekPlayer({ playerId: "te", position: "TE", projectedPoints: 10 }),
    weekPlayer({ playerId: "flex", position: "WR", projectedPoints: 11 }),
  ];

  const base = {
    rosterPositions: ROSTER_POSITIONS,
    seasonYear: 2026,
    kickedOffTeams: new Set<string>(),
  };

  it("prices the optimal lineup, not the lineup the manager set", () => {
    // Same roster, priced twice: once with the 20-point QB started, once with
    // him benched in favour of a 1-point backup. The line must not move.
    const started = optimalProjectedTotals({
      ...base,
      weekly: fullWeek(),
      rosterSlots: [],
    });

    const benched = optimalProjectedTotals({
      ...base,
      weekly: [
        ...fullWeek().map((p) =>
          p.playerId === "qb" ? { ...p, started: false } : p,
        ),
        weekPlayer({ playerId: "qb2", position: "QB", projectedPoints: 1 }),
      ],
      rosterSlots: [],
    });

    expect(started.get("1")).toBe(95);
    expect(benched.get("1")).toBe(95);
  });

  it("ignores bench players who cannot improve the lineup", () => {
    const totals = optimalProjectedTotals({
      ...base,
      weekly: [
        ...fullWeek(),
        weekPlayer({
          playerId: "scrub",
          position: "RB",
          projectedPoints: 2,
          started: false,
        }),
      ],
      rosterSlots: [],
    });
    expect(totals.get("1")).toBe(95);
  });

  it("excludes IR and taxi players, who cannot legally be started", () => {
    const weekly = [
      ...fullWeek(),
      weekPlayer({
        playerId: "stashed",
        position: "QB",
        projectedPoints: 40,
        started: false,
      }),
    ];

    expect(
      optimalProjectedTotals({ ...base, weekly, rosterSlots: [] }).get("1"),
    ).toBe(115);

    expect(
      optimalProjectedTotals({
        ...base,
        weekly,
        rosterSlots: [
          slotPlayer({ playerId: "stashed", position: "QB", slot: "ir" }),
        ],
      }).get("1"),
    ).toBe(95);

    expect(
      optimalProjectedTotals({
        ...base,
        weekly,
        rosterSlots: [
          slotPlayer({ playerId: "stashed", position: "QB", slot: "taxi" }),
        ],
      }).get("1"),
    ).toBe(95);
  });

  it("drops a benched player whose own game has already kicked off", () => {
    const weekly = [
      ...fullWeek(),
      weekPlayer({
        playerId: "thursday",
        position: "QB",
        projectedPoints: 40,
        started: false,
        nflTeam: "BUF",
      }),
    ];

    expect(
      optimalProjectedTotals({
        ...base,
        weekly,
        rosterSlots: [],
        kickedOffTeams: new Set(["BUF"]),
      }).get("1"),
    ).toBe(95);
  });

  it("keeps a started player whose game has already kicked off", () => {
    const weekly = fullWeek().map((p) =>
      p.playerId === "qb" ? { ...p, nflTeam: "BUF" } : p,
    );

    expect(
      optimalProjectedTotals({
        ...base,
        weekly,
        rosterSlots: [],
        kickedOffTeams: new Set(["BUF"]),
      }).get("1"),
    ).toBe(95);
  });

  it("falls back to the season-long pool before the week has any rows", () => {
    const totals = optimalProjectedTotals({
      ...base,
      weekly: [],
      rosterSlots: [
        slotPlayer({ playerId: "qb", position: "QB", projPointsPpr: 340 }),
        slotPlayer({ playerId: "rb1", position: "RB", projPointsPpr: 255 }),
        slotPlayer({ playerId: "te", position: "TE", projPointsPpr: 170 }),
      ],
    });
    expect(totals.get("1")).toBeCloseTo(765 / REGULAR_SEASON_GAMES, 5);
  });

  it("keeps IR and taxi players out of the season-long pool too", () => {
    const totals = optimalProjectedTotals({
      ...base,
      weekly: [],
      rosterSlots: [
        slotPlayer({ playerId: "qb", position: "QB", projPointsPpr: 340 }),
        slotPlayer({
          playerId: "stashed",
          position: "QB",
          projPointsPpr: 510,
          slot: "ir",
        }),
      ],
    });
    expect(totals.get("1")).toBeCloseTo(340 / REGULAR_SEASON_GAMES, 5);
  });

  it("counts a prior season's stored projection as zero", () => {
    const totals = optimalProjectedTotals({
      ...base,
      weekly: [],
      rosterSlots: [
        slotPlayer({ playerId: "qb", position: "QB", projPointsPpr: 340 }),
        slotPlayer({
          playerId: "stale",
          position: "RB",
          projPointsPpr: 300,
          projSeason: 2025,
        }),
      ],
    });
    expect(totals.get("1")).toBeCloseTo(340 / REGULAR_SEASON_GAMES, 5);
  });

  it("prefers the weekly source whenever it produces a number", () => {
    const totals = optimalProjectedTotals({
      ...base,
      weekly: fullWeek(),
      rosterSlots: [
        slotPlayer({ playerId: "qb", position: "QB", projPointsPpr: 3400 }),
      ],
    });
    expect(totals.get("1")).toBe(95);
  });

  it("prices each roster independently", () => {
    const totals = optimalProjectedTotals({
      ...base,
      weekly: [
        ...fullWeek(),
        weekPlayer({
          rosterId: "2",
          playerId: "qb-b",
          position: "QB",
          projectedPoints: 30,
        }),
      ],
      rosterSlots: [],
    });
    expect(totals.get("1")).toBe(95);
    expect(totals.get("2")).toBe(30);
  });

  it("drops a roster with no usable number from either source", () => {
    const totals = optimalProjectedTotals({
      ...base,
      weekly: [weekPlayer({ rosterId: "3", playerId: "x", position: "QB" })],
      rosterSlots: [
        slotPlayer({ rosterId: "3", playerId: "x", position: "QB" }),
      ],
    });
    expect(totals.has("3")).toBe(false);
  });
});
