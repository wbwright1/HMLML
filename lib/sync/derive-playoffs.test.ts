import { describe, it, expect } from "vitest";
import { derivePlayoffResults } from "./derive-playoffs";
import type { SleeperBracketMatch } from "@/lib/sleeper-schemas";

// Roster -> franchise mapping used across fixtures. Franchise ids are just
// stringified roster ids here for readability ("f<roster>").
function makeMapping(rosterIds: number[]): Map<number, string> {
  return new Map(rosterIds.map((id) => [id, `f${id}`]));
}

// A typical 6-team winners bracket (roster ids 1-6): two byes, quarters,
// semis, championship (p=1) and 3rd place (p=3).
const winners6: SleeperBracketMatch[] = [
  // Round 1 (quarterfinals): seeds 3v6, 4v5
  { m: 1, r: 1, t1: 3, t2: 6, w: 3, l: 6 },
  { m: 2, r: 1, t1: 4, t2: 5, w: 4, l: 5 },
  // Round 2 (semifinals): 1 vs winner(2), 2 vs winner(1)
  { m: 3, r: 2, t1: 1, t2: 3, w: 1, l: 3 },
  { m: 4, r: 2, t1: 2, t2: 4, w: 2, l: 4 },
  // Championship + 3rd place
  { m: 5, r: 3, p: 1, t1: 1, t2: 2, w: 1, l: 2 },
  { m: 6, r: 3, p: 3, t1: 3, t2: 4, w: 3, l: 4 },
];

describe("derivePlayoffResults - winners bracket (regression)", () => {
  it("marks champion, runner-up, and made_playoffs from the winners bracket", () => {
    const mapping = makeMapping([1, 2, 3, 4, 5, 6]);
    const { championFranchiseId, runnerUpFranchiseId, franchiseResults } =
      derivePlayoffResults(winners6, [], mapping);

    expect(championFranchiseId).toBe("f1");
    expect(runnerUpFranchiseId).toBe("f2");
    expect(franchiseResults.get("f1")).toBe("champion");
    expect(franchiseResults.get("f2")).toBe("runner_up");
    // Everyone else in the winners bracket made the playoffs
    for (const id of [3, 4, 5, 6]) {
      expect(franchiseResults.get(`f${id}`)).toBe("made_playoffs");
    }
  });
});

describe("derivePlayoffResults - 4-team losers bracket (2021/2022 shape, maxP=3)", () => {
  // Losers bracket for the bottom 4 seeds (7,8,9,10). Round 1 pairs them, then
  // a Toilet Bowl final (p=1) between the two ROUND-1 losers and a p=3 match
  // between the two round-1 winners.
  const losers4: SleeperBracketMatch[] = [
    { m: 1, r: 1, t1: 7, t2: 8, w: 7, l: 8 },
    { m: 2, r: 1, t1: 9, t2: 10, w: 9, l: 10 },
    // Toilet Bowl final: the two teams that LOST round 1 play for dead last.
    { m: 3, r: 2, p: 1, t1: 8, t2: 10, w: 10, l: 8 },
    // Consolation (5th-of-losers) between the round-1 winners.
    { m: 4, r: 2, p: 3, t1: 7, t2: 9, w: 7, l: 9 },
  ];

  it("tags BOTH p=1 finalists as toilet_bowl and everyone else consolation", () => {
    const mapping = makeMapping([7, 8, 9, 10]);
    const { franchiseResults } = derivePlayoffResults([], losers4, mapping);

    // Both participants of the p=1 match, winner AND loser.
    expect(franchiseResults.get("f10")).toBe("toilet_bowl");
    expect(franchiseResults.get("f8")).toBe("toilet_bowl");
    // The max-p (p=3) match losers/winners are consolation, NOT toilet_bowl.
    expect(franchiseResults.get("f7")).toBe("consolation");
    expect(franchiseResults.get("f9")).toBe("consolation");

    const toiletBowlCount = [...franchiseResults.values()].filter(
      (r) => r === "toilet_bowl"
    ).length;
    expect(toiletBowlCount).toBe(2);
  });
});

describe("derivePlayoffResults - 6-team losers bracket (2023-2025 shape, maxP=5)", () => {
  // Bottom 6 seeds (7..12). p=1 is the Toilet Bowl final; other placement
  // matches (p=3, p=5) are consolation. The p=1 finalists are NOT the max-p
  // match participants, which is exactly the bug being fixed.
  const losers6: SleeperBracketMatch[] = [
    { m: 1, r: 1, t1: 9, t2: 12, w: 9, l: 12 },
    { m: 2, r: 1, t1: 10, t2: 11, w: 10, l: 11 },
    { m: 3, r: 2, t1: 7, t2: 12, w: 7, l: 12 },
    { m: 4, r: 2, t1: 8, t2: 11, w: 8, l: 11 },
    // Placement finals
    { m: 5, r: 3, p: 1, t1: 12, t2: 11, w: 11, l: 12 }, // Toilet Bowl final
    { m: 6, r: 3, p: 3, t1: 9, t2: 10, w: 9, l: 10 },
    { m: 7, r: 3, p: 5, t1: 7, t2: 8, w: 7, l: 8 }, // highest p -> old buggy pick
  ];

  it("uses p=1, not max-p, for the Toilet Bowl", () => {
    const mapping = makeMapping([7, 8, 9, 10, 11, 12]);
    const { franchiseResults } = derivePlayoffResults([], losers6, mapping);

    // p=1 finalists
    expect(franchiseResults.get("f11")).toBe("toilet_bowl");
    expect(franchiseResults.get("f12")).toBe("toilet_bowl");
    // The old code would have tagged f8 (loser of max-p=5). It must be consolation now.
    expect(franchiseResults.get("f8")).toBe("consolation");
    for (const id of [7, 9, 10]) {
      expect(franchiseResults.get(`f${id}`)).toBe("consolation");
    }
    const toiletBowlCount = [...franchiseResults.values()].filter(
      (r) => r === "toilet_bowl"
    ).length;
    expect(toiletBowlCount).toBe(2);
  });
});

describe("derivePlayoffResults - graceful mid-season / edge cases", () => {
  it("resolves both finalists from seeded t1/t2 when the final is unplayed", () => {
    const losers: SleeperBracketMatch[] = [
      { m: 1, r: 1, t1: 7, t2: 8, w: 7, l: 8 },
      { m: 2, r: 1, t1: 9, t2: 10, w: 9, l: 10 },
      // p=1 seeded but not yet played: w/l null, t1/t2 known.
      { m: 3, r: 2, p: 1, t1: 8, t2: 10, w: null, l: null },
    ];
    const mapping = makeMapping([7, 8, 9, 10]);
    const { franchiseResults } = derivePlayoffResults([], losers, mapping);
    expect(franchiseResults.get("f8")).toBe("toilet_bowl");
    expect(franchiseResults.get("f10")).toBe("toilet_bowl");
    expect(franchiseResults.get("f7")).toBe("consolation");
    expect(franchiseResults.get("f9")).toBe("consolation");
  });

  it("tags no toilet_bowl when the p=1 final has no known participants", () => {
    const losers: SleeperBracketMatch[] = [
      { m: 1, r: 1, t1: 7, t2: 8, w: null, l: null },
      { m: 2, r: 2, p: 1, t1: null, t2: null, w: null, l: null },
    ];
    const mapping = makeMapping([7, 8]);
    const { franchiseResults } = derivePlayoffResults([], losers, mapping);
    const toiletBowlCount = [...franchiseResults.values()].filter(
      (r) => r === "toilet_bowl"
    ).length;
    expect(toiletBowlCount).toBe(0);
    // Known round-1 seeds still land as consolation.
    expect(franchiseResults.get("f7")).toBe("consolation");
    expect(franchiseResults.get("f8")).toBe("consolation");
  });

  it("handles an empty losers bracket without throwing", () => {
    const mapping = makeMapping([1, 2, 3, 4, 5, 6]);
    const { franchiseResults } = derivePlayoffResults(winners6, [], mapping);
    const toiletBowlCount = [...franchiseResults.values()].filter(
      (r) => r === "toilet_bowl"
    ).length;
    expect(toiletBowlCount).toBe(0);
  });

  it("does not overwrite a winners-bracket result for a roster also present in losers data", () => {
    // Defensive: a roster that somehow appears in both brackets keeps its
    // winners result (champion/runner_up/made_playoffs wins).
    const losers: SleeperBracketMatch[] = [
      { m: 1, r: 1, p: 1, t1: 2, t2: 7, w: 7, l: 2 },
    ];
    const mapping = makeMapping([1, 2, 3, 4, 5, 6, 7]);
    const { franchiseResults } = derivePlayoffResults(winners6, losers, mapping);
    expect(franchiseResults.get("f2")).toBe("runner_up");
    expect(franchiseResults.get("f7")).toBe("toilet_bowl");
  });
});

describe("derivePlayoffResults - toilet bowl champion", () => {
  it("crowns the advancing team of the p=1 losers final, not the higher scorer", () => {
    // Real 2023 losers bracket (league 916853033424773120). Roster 11 scored
    // 109.22 and roster 9 scored 119.98; Sleeper records 11 as `w` because the
    // bracket is inverted, so 11 is the Toilet Bowl champion.
    const losers: SleeperBracketMatch[] = [
      { m: 1, r: 1, l: 4, w: 5, t1: 4, t2: 5 },
      { m: 2, r: 1, l: 10, w: 11, t1: 10, t2: 11 },
      { m: 3, r: 2, l: 5, w: 9, t1: 9, t2: 5 },
      { m: 4, r: 2, l: 2, w: 11, t1: 2, t2: 11 },
      { p: 5, m: 5, r: 2, l: 4, w: 10, t1: 4, t2: 10 },
      { p: 1, m: 6, r: 3, l: 9, w: 11, t1: 9, t2: 11 },
      { p: 3, m: 7, r: 3, l: 5, w: 2, t1: 5, t2: 2 },
    ];
    const mapping = makeMapping([2, 4, 5, 9, 10, 11]);
    const { toiletBowlChampionFranchiseId, franchiseResults } =
      derivePlayoffResults([], losers, mapping);
    expect(toiletBowlChampionFranchiseId).toBe("f11");
    // Both finalists still carry the toilet_bowl playoff_result: unchanged.
    expect(franchiseResults.get("f11")).toBe("toilet_bowl");
    expect(franchiseResults.get("f9")).toBe("toilet_bowl");
  });

  it("crowns nobody when the p=1 final is seeded but unplayed", () => {
    const losers: SleeperBracketMatch[] = [
      { m: 1, r: 1, t1: 7, t2: 8, w: 7, l: 8 },
      { m: 2, r: 2, p: 1, t1: 8, t2: 10, w: null, l: null },
    ];
    const mapping = makeMapping([7, 8, 10]);
    const { toiletBowlChampionFranchiseId } = derivePlayoffResults(
      [],
      losers,
      mapping
    );
    expect(toiletBowlChampionFranchiseId).toBeNull();
  });

  it("crowns nobody with no losers bracket at all", () => {
    const mapping = makeMapping([1, 2, 3, 4, 5, 6]);
    const { toiletBowlChampionFranchiseId } = derivePlayoffResults(
      winners6,
      [],
      mapping
    );
    expect(toiletBowlChampionFranchiseId).toBeNull();
  });
});
