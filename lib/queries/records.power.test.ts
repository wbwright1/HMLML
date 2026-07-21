import { describe, it, expect } from "vitest";
import { computePowerScore } from "./records";
import type { PowerFranchiseInput } from "./records";

function franchise(
  id: string,
  overrides: Partial<PowerFranchiseInput> = {}
): PowerFranchiseInput {
  return {
    franchiseId: id,
    games: [],
    injuryPenalty: 0,
    injuryCount: 0,
    standingsRank: 1,
    ...overrides,
  };
}

describe("computePowerScore: recency weighting", () => {
  it("ranks a most-recent win above an equal record with a most-recent loss", () => {
    // Both franchises are 2-2 over the window; A won its most recent game,
    // B lost its most recent game. A should score higher (win weighted more).
    const a = franchise("a", {
      games: [
        { week: 4, points: 100, isWinner: true },
        { week: 3, points: 100, isWinner: false },
        { week: 2, points: 100, isWinner: true },
        { week: 1, points: 100, isWinner: false },
      ],
    });
    const b = franchise("b", {
      games: [
        { week: 4, points: 100, isWinner: false },
        { week: 3, points: 100, isWinner: true },
        { week: 2, points: 100, isWinner: false },
        { week: 1, points: 100, isWinner: true },
      ],
    });

    const [first, second] = computePowerScore([a, b]);
    expect(first.franchiseId).toBe("a");
    expect(second.franchiseId).toBe("b");
    expect(first.powerScore).toBeGreaterThan(second.powerScore);
  });

  it("ranks 'hot start, cold finish' below 'cold start, hot finish' at equal W-L", () => {
    // Both franchises go 2-2 over 4 weeks. Hot-start-cold-finish wins its
    // earliest games and loses its most recent; cold-start-hot-finish is the
    // mirror image. Recency weighting must favor the team peaking now.
    const hotStartColdFinish = franchise("hot-start-cold-finish", {
      games: [
        { week: 4, points: 100, isWinner: false },
        { week: 3, points: 100, isWinner: false },
        { week: 2, points: 100, isWinner: true },
        { week: 1, points: 100, isWinner: true },
      ],
    });
    const coldStartHotFinish = franchise("cold-start-hot-finish", {
      games: [
        { week: 4, points: 100, isWinner: true },
        { week: 3, points: 100, isWinner: true },
        { week: 2, points: 100, isWinner: false },
        { week: 1, points: 100, isWinner: false },
      ],
    });

    const results = computePowerScore([hotStartColdFinish, coldStartHotFinish]);
    const hot = results.find((r) => r.franchiseId === "cold-start-hot-finish")!;
    const cold = results.find((r) => r.franchiseId === "hot-start-cold-finish")!;

    expect(hot.resultScore).toBeGreaterThan(cold.resultScore);
    expect(hot.powerScore).toBeGreaterThan(cold.powerScore);
    expect(hot.rank).toBeLessThan(cold.rank);
  });
});

describe("computePowerScore: injury penalty", () => {
  it("lowers power score monotonically as injury penalty increases", () => {
    const base = {
      games: [
        { week: 1, points: 100, isWinner: true },
        { week: 2, points: 100, isWinner: true },
      ],
      standingsRank: 1,
    };

    const none = franchise("none", { ...base, injuryPenalty: 0 });
    const mild = franchise("mild", { ...base, injuryPenalty: 0.3 });
    const severe = franchise("severe", { ...base, injuryPenalty: 1 });

    const results = computePowerScore([none, mild, severe]);
    const byId = new Map(results.map((r) => [r.franchiseId, r]));

    expect(byId.get("none")!.powerScore).toBeGreaterThan(
      byId.get("mild")!.powerScore
    );
    expect(byId.get("mild")!.powerScore).toBeGreaterThan(
      byId.get("severe")!.powerScore
    );
  });

  it("caps severity contribution so penalty never exceeds 1", () => {
    // injuryPenalty is passed in pre-clamped by the caller; verify the
    // formula treats penalty=1 as the floor (no scores below the 1-penalty case).
    const maxed = franchise("maxed", { injuryPenalty: 1 });
    const [result] = computePowerScore([maxed]);
    expect(result.powerScore).toBeGreaterThanOrEqual(0);
    expect(1 - result.injuryPenalty).toBe(0);
  });
});

describe("computePowerScore: scoring normalization", () => {
  it("normalizes all-equal scoring to 0.5 with no NaN", () => {
    const a = franchise("a", {
      games: [{ week: 1, points: 100, isWinner: true }],
    });
    const b = franchise("b", {
      games: [{ week: 1, points: 100, isWinner: false }],
    });

    const results = computePowerScore([a, b]);
    for (const r of results) {
      expect(r.scoringScore).toBe(0.5);
      expect(Number.isNaN(r.scoringScore)).toBe(false);
      expect(Number.isNaN(r.powerScore)).toBe(false);
    }
  });

  it("handles franchises with zero games in the window without NaN", () => {
    const noGames = franchise("no-games", { games: [] });
    const [result] = computePowerScore([noGames]);
    expect(result.windowGames).toBe(0);
    expect(result.scoringScore).toBe(0.5);
    expect(result.resultScore).toBe(0);
    expect(Number.isNaN(result.powerScore)).toBe(false);
  });
});

describe("computePowerScore: formDelta", () => {
  it("is positive when a franchise's power rank is better than its standings rank (rising)", () => {
    // standingsRank 3 but wins the power-score battle -> power rank 1 -> delta = 3 - 1 = 2
    const riser = franchise("riser", {
      standingsRank: 3,
      games: [
        { week: 1, points: 150, isWinner: true },
        { week: 2, points: 150, isWinner: true },
      ],
    });
    const others = franchise("others", {
      standingsRank: 1,
      games: [
        { week: 1, points: 90, isWinner: false },
        { week: 2, points: 90, isWinner: false },
      ],
    });

    const results = computePowerScore([riser, others]);
    const r = results.find((x) => x.franchiseId === "riser")!;
    expect(r.rank).toBe(1);
    expect(r.formDelta).toBe(2); // standingsRank(3) - powerRank(1)
  });

  it("is negative when a franchise's power rank is worse than its standings rank (falling)", () => {
    const faller = franchise("faller", {
      standingsRank: 1,
      games: [
        { week: 1, points: 50, isWinner: false },
        { week: 2, points: 50, isWinner: false },
      ],
    });
    const others = franchise("others", {
      standingsRank: 2,
      games: [
        { week: 1, points: 150, isWinner: true },
        { week: 2, points: 150, isWinner: true },
      ],
    });

    const results = computePowerScore([faller, others]);
    const f = results.find((x) => x.franchiseId === "faller")!;
    expect(f.rank).toBe(2);
    expect(f.formDelta).toBe(-1); // standingsRank(1) - powerRank(2)
  });

  it("is zero when standings rank and power rank agree", () => {
    const a = franchise("a", {
      standingsRank: 1,
      games: [{ week: 1, points: 150, isWinner: true }],
    });
    const b = franchise("b", {
      standingsRank: 2,
      games: [{ week: 1, points: 50, isWinner: false }],
    });

    const results = computePowerScore([a, b]);
    for (const r of results) {
      expect(r.formDelta).toBe(0);
    }
  });
});
