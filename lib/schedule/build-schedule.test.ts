import { describe, it, expect } from "vitest";
import {
  assembleSchedule,
  validateSchedule,
  buildRoundRobin,
  buildDivisionalWeeks,
  TOTAL_WEEKS,
  GAMES_PER_WEEK,
  TEAM_COUNT,
  type Pair,
  type Week,
} from "./build-schedule";

// Synthetic 12 teams in 3 divisions of 4. No DB, no mocks.
const DIVISIONS = [
  ["a1", "a2", "a3", "a4"],
  ["b1", "b2", "b3", "b4"],
  ["c1", "c2", "c3", "c4"],
];
const ALL_TEAMS = DIVISIONS.flat();

function meetingCounts(weeks: Week[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const w of weeks) {
    for (const g of w.games) {
      const key = [g.a, g.b].sort().join("|");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

const sameDivision = (a: string, b: string) =>
  DIVISIONS.findIndex((d) => d.includes(a)) === DIVISIONS.findIndex((d) => d.includes(b));

describe("buildRoundRobin", () => {
  it("produces n-1 rounds covering every pair exactly once", () => {
    const rounds = buildRoundRobin(ALL_TEAMS);
    expect(rounds).toHaveLength(TEAM_COUNT - 1); // 11
    for (const round of rounds) {
      expect(round).toHaveLength(GAMES_PER_WEEK); // 6
      expect(new Set(round.flat()).size).toBe(TEAM_COUNT); // every team once
    }
    // Every unordered pair appears exactly once.
    const counts = new Map<string, number>();
    for (const round of rounds) {
      for (const [a, b] of round) {
        const key = [a, b].sort().join("|");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const totalPairs = (TEAM_COUNT * (TEAM_COUNT - 1)) / 2; // 66
    expect(counts.size).toBe(totalPairs);
    for (const c of counts.values()) expect(c).toBe(1);
  });

  it("throws on an odd team count", () => {
    expect(() => buildRoundRobin(["x", "y", "z"])).toThrow();
  });
});

describe("buildDivisionalWeeks", () => {
  it("yields 3 rounds where each is entirely intra-division and covers every within-division pair once", () => {
    const rounds = buildDivisionalWeeks(DIVISIONS);
    expect(rounds).toHaveLength(3);
    const counts = new Map<string, number>();
    for (const round of rounds) {
      expect(round).toHaveLength(GAMES_PER_WEEK);
      expect(new Set(round.flat()).size).toBe(TEAM_COUNT);
      for (const [a, b] of round) {
        expect(sameDivision(a, b)).toBe(true);
        counts.set([a, b].sort().join("|"), (counts.get([a, b].sort().join("|")) ?? 0) + 1);
      }
    }
    // 6 within-division pairs per division x 3 = 18, each once.
    expect(counts.size).toBe(18);
    for (const c of counts.values()) expect(c).toBe(1);
  });
});

describe("assembleSchedule", () => {
  const finalists: Pair = ["a1", "b1"]; // cross-division finalists
  const weeks = assembleSchedule({
    divisions: DIVISIONS,
    finalists,
    divisionalWeeks: [6, 10, 14],
    primetimeWeek: 14,
  });

  it("passes the independent validator", () => {
    expect(() => validateSchedule(weeks, DIVISIONS, finalists)).not.toThrow();
  });

  it("has 14 weeks of 6 games with each team playing once per week", () => {
    expect(weeks).toHaveLength(TOTAL_WEEKS);
    for (const w of weeks) {
      expect(w.games).toHaveLength(GAMES_PER_WEEK);
      const teams = w.games.flatMap((g) => [g.a, g.b]);
      expect(new Set(teams).size).toBe(TEAM_COUNT);
    }
  });

  it("meets division rivals twice and everyone else once", () => {
    const counts = meetingCounts(weeks);
    for (let i = 0; i < ALL_TEAMS.length; i++) {
      for (let j = i + 1; j < ALL_TEAMS.length; j++) {
        const [a, b] = [ALL_TEAMS[i], ALL_TEAMS[j]];
        const key = [a, b].sort().join("|");
        expect(counts.get(key) ?? 0).toBe(sameDivision(a, b) ? 2 : 1);
      }
    }
  });

  it("opens week 1 with the finals rematch", () => {
    const wk1 = weeks[0];
    const hasPair = wk1.games.some(
      (g) => (g.a === "a1" && g.b === "b1") || (g.a === "b1" && g.b === "a1"),
    );
    expect(hasPair).toBe(true);
    expect(wk1.kind).toBe("mixed");
  });

  it("marks the configured divisional weeks (all intra-division) and one primetime", () => {
    const divisionalWeeks = weeks.filter((w) => w.kind === "divisional");
    expect(divisionalWeeks.map((w) => w.week).sort((x, y) => x - y)).toEqual([6, 10, 14]);
    for (const w of divisionalWeeks) {
      for (const g of w.games) expect(g.sameDivision).toBe(true);
    }
    expect(weeks.find((w) => w.week === 14)?.label).toBe("Divisional — Primetime");
  });

  it("handles same-division finalists (rematch in week 1, second meeting later)", () => {
    const sameDivFinalists: Pair = ["a1", "a2"];
    const w = assembleSchedule({
      divisions: DIVISIONS,
      finalists: sameDivFinalists,
      divisionalWeeks: [6, 10, 14],
      primetimeWeek: 14,
    });
    expect(() => validateSchedule(w, DIVISIONS, sameDivFinalists)).not.toThrow();
    const wk1 = w[0];
    expect(
      wk1.games.some((g) => [g.a, g.b].sort().join("|") === "a1|a2"),
    ).toBe(true);
    // They meet exactly twice overall.
    expect(meetingCounts(w).get("a1|a2")).toBe(2);
  });
});

describe("config validation", () => {
  const base = {
    divisions: DIVISIONS,
    finalists: ["a1", "b1"] as Pair,
    divisionalWeeks: [6, 10, 14],
    primetimeWeek: 14,
  };

  it("rejects a divisional week on week 1", () => {
    expect(() => assembleSchedule({ ...base, divisionalWeeks: [1, 10, 14] })).toThrow();
  });

  it("rejects a primetime week that is not a divisional week", () => {
    expect(() => assembleSchedule({ ...base, primetimeWeek: 7 })).toThrow();
  });

  it("rejects wrong division sizes", () => {
    expect(() =>
      assembleSchedule({ ...base, divisions: [["a1", "a2", "a3"], ["b1", "b2", "b3", "b4"], ["c1", "c2", "c3", "c4", "c5"]] }),
    ).toThrow();
  });

  it("rejects finalists not in the league", () => {
    expect(() => assembleSchedule({ ...base, finalists: ["a1", "zz"] as Pair })).toThrow();
  });
});
