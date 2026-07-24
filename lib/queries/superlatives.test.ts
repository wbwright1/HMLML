import { describe, it, expect } from "vitest";
import {
  assignBackfillAwards,
  dedupeToSix,
  MAX_SUPERLATIVE_CARDS,
  type CoverageAwardDef,
  type CoverageProfile,
  type SeasonSuperlative,
} from "./superlatives";

interface TestProfile extends CoverageProfile {
  pf: number;
  pa: number;
  neverWonTitle: boolean;
}

function profile(
  id: string,
  pf: number,
  opts: { pa?: number; neverWonTitle?: boolean; games?: number } = {},
): TestProfile {
  return {
    franchiseId: id,
    franchiseName: `Team ${id}`,
    franchiseSlug: `team-${id}`,
    games: opts.games ?? 14,
    pf,
    pa: opts.pa ?? 0,
    neverWonTitle: opts.neverWonTitle ?? true,
  };
}

const PF_NO_RING_DEF: CoverageAwardDef<TestProfile> = {
  key: "EMPTY_CALORIES",
  score: (p) => (p.neverWonTitle && p.pf > 0 ? p.pf : null),
  stat: (p) => `${p.pf.toFixed(1)} PF`,
  context: () => "Most points ever banked. Still zero rings.",
};

const PA_DEF: CoverageAwardDef<TestProfile> = {
  key: "PUNCHING_BAG",
  score: (p) => (p.pa > 0 ? p.pa : null),
  stat: (p) => `${p.pa.toFixed(1)} PA`,
  context: () => "Most points ever conceded. Favorite target.",
};

function eligible(...ids: string[]): Set<string> {
  return new Set(ids.map((id) => `team-${id}`));
}

describe("assignBackfillAwards (truthful, no participation trophies)", () => {
  it("assigns an award to its genuine league-wide leader", () => {
    const result = assignBackfillAwards(
      [profile("a", 9114.1), profile("b", 9966.2), profile("c", 8000)],
      [PF_NO_RING_DEF],
      eligible("a", "b", "c"),
    );
    expect(result).toHaveLength(1);
    expect(result[0].franchiseSlug).toBe("team-b");
    expect(result[0].labelKey).toBe("EMPTY_CALORIES");
    expect(result[0].stat).toBe("9966.2 PF");
  });

  it("skips the def entirely when the true leader is not eligible (covered elsewhere)", () => {
    // b is the true PF-no-ring leader but already holds a primary award:
    // the def must NOT fall back to runner-up a.
    const result = assignBackfillAwards(
      [profile("a", 9114.1), profile("b", 9966.2)],
      [PF_NO_RING_DEF],
      eligible("a"),
    );
    expect(result).toHaveLength(0);
  });

  it("computes the leader over ALL profiles, including ineligible ones", () => {
    // Champion c leads raw PF but is filtered by the def's own gate; among
    // never-champions, b leads. b eligible: b wins even though a is also
    // eligible with a lower total.
    const result = assignBackfillAwards(
      [
        profile("a", 9114.1),
        profile("b", 9966.2),
        profile("c", 12000, { neverWonTitle: false }),
      ],
      [PF_NO_RING_DEF],
      eligible("a", "b"),
    );
    expect(result).toHaveLength(1);
    expect(result[0].franchiseSlug).toBe("team-b");
  });

  it("never gives one franchise two awards; later defs skip an assigned leader", () => {
    // b leads both PF-no-ring and PA. It gets the first (higher-priority)
    // award; the second def's true leader is now assigned, so it sits out
    // rather than passing to a.
    const result = assignBackfillAwards(
      [profile("a", 9000, { pa: 9000 }), profile("b", 9966.2, { pa: 9576.8 })],
      [PF_NO_RING_DEF, PA_DEF],
      eligible("a", "b"),
    );
    expect(result).toHaveLength(1);
    expect(result[0].labelKey).toBe("EMPTY_CALORIES");
    expect(result[0].franchiseSlug).toBe("team-b");
  });

  it("assigns independent defs to their distinct leaders", () => {
    const result = assignBackfillAwards(
      [profile("a", 9000, { pa: 9800 }), profile("b", 9966.2, { pa: 9000 })],
      [PF_NO_RING_DEF, PA_DEF],
      eligible("a", "b"),
    );
    expect(result.map((r) => [r.labelKey, r.franchiseSlug])).toEqual([
      ["EMPTY_CALORIES", "team-b"],
      ["PUNCHING_BAG", "team-a"],
    ]);
  });

  it("breaks exact ties deterministically by franchiseId order", () => {
    const result = assignBackfillAwards(
      [profile("b", 9500), profile("a", 9500)],
      [PF_NO_RING_DEF],
      eligible("a", "b"),
    );
    expect(result).toHaveLength(1);
    expect(result[0].franchiseSlug).toBe("team-a");
  });

  it("returns nothing when every candidate is ineligible for the def", () => {
    const result = assignBackfillAwards(
      [profile("a", 0), profile("b", 9000, { neverWonTitle: false })],
      [PF_NO_RING_DEF],
      eligible("a", "b"),
    );
    expect(result).toHaveLength(0);
  });

  it("returns nothing for an empty eligible set or empty profiles", () => {
    expect(
      assignBackfillAwards([profile("a", 9000)], [PF_NO_RING_DEF], new Set()),
    ).toHaveLength(0);
    expect(assignBackfillAwards([], [PF_NO_RING_DEF], eligible("a"))).toHaveLength(0);
  });
});

function card(slug: string, labelKey: string): SeasonSuperlative {
  return {
    labelKey,
    displayText: labelKey,
    franchiseName: slug,
    franchiseSlug: slug,
    stat: "1",
    context: "ctx",
    tone: "neutral",
  };
}

describe("dedupeToSix", () => {
  it("caps output at MAX_SUPERLATIVE_CARDS (6)", () => {
    const source = Array.from({ length: 10 }, (_, i) => card(`f${i}`, `K${i}`));
    const result = dedupeToSix([source]);
    expect(MAX_SUPERLATIVE_CARDS).toBe(6);
    expect(result).toHaveLength(6);
    expect(result.map((r) => r.franchiseSlug)).toEqual([
      "f0",
      "f1",
      "f2",
      "f3",
      "f4",
      "f5",
    ]);
  });

  it("dedupes by franchise across sources in priority order", () => {
    const primary = [card("f1", "A"), card("f2", "B")];
    const backfill = [card("f1", "C"), card("f3", "D")];
    const result = dedupeToSix([primary, backfill]);
    expect(result.map((r) => [r.franchiseSlug, r.labelKey])).toEqual([
      ["f1", "A"],
      ["f2", "B"],
      ["f3", "D"],
    ]);
  });

  it("returns fewer than 6 when sources run dry; no padding", () => {
    const result = dedupeToSix([[card("f1", "A")]]);
    expect(result).toHaveLength(1);
  });
});
