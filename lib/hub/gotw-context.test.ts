import { describe, it, expect } from "vitest";
import {
  resolveFromSource,
  priorFeaturedSlugsFromRefKey,
  type GotwSource,
  type GotwStandingRow,
} from "./gotw-context";

// The real 2026 standings after week 2 and the real week-3 slate (live DB,
// 2026-09-22). Franchise ids are the abbreviations and slugs their
// lowercase, which is all the builder needs.
const ROWS: [string, number, number, number, number, string][] = [
  ["ROG", 2, 0, 331.36, 2, "Real Olave Garden"],
  ["OMM", 0, 2, 197.02, 2, "Of Mice and Mendoza"],
  ["BCM", 0, 2, 234.12, 2, "Better Call Myballs"],
  ["FOO", 0, 2, 208.98, 2, "Foopus"],
  ["TTT", 2, 0, 329.6, 1, "The Tokyo Thunderbirds"],
  ["LDL", 2, 0, 275.92, 1, "Latter Day Lamb Special"],
  ["BGS", 1, 1, 246.26, 1, "Bucky's General Store"],
  ["TB", 0, 2, 285.9, 1, "Taking Boutte"],
  ["MCC", 2, 0, 348.86, 3, "McCarthyism"],
  ["BCH", 1, 1, 229.58, 3, "Better Call Hall"],
  ["VV", 1, 1, 295.2, 3, "Vanilla Vick"],
  ["WLD", 1, 1, 272.48, 3, "Watson Love Diggs"],
];
const NAME = new Map(ROWS.map((r) => [r[0], r[5]]));
const standings: GotwStandingRow[] = ROWS.map(([id, w, l, pf, div]) => ({
  franchiseId: id,
  wins: w,
  losses: l,
  ties: 0,
  pointsScored: pf,
  division: div,
  divisionName: `Division ${div}`,
}));
const side = (id: string) => ({
  franchiseId: id,
  franchiseSlug: id.toLowerCase(),
  franchiseName: NAME.get(id)!,
});
const WEEK3: [number, string, string][] = [
  [1, "ROG", "OMM"],
  [2, "BCM", "FOO"],
  [3, "TTT", "WLD"],
  [4, "BCH", "TB"],
  [5, "MCC", "BGS"],
  [6, "LDL", "VV"],
];

function source(overrides: Partial<GotwSource> = {}): GotwSource {
  return {
    seasonYear: 2026,
    week: 3,
    matchups: WEEK3.map(([matchupId, a, b]) => ({
      matchupId,
      homeTeam: side(a),
      awayTeam: side(b),
    })),
    standings,
    seasonLookups: { h2hLookup: new Map(), divisionRecord: new Map() },
    h2hByMatchup: new Map(),
    historyByMatchup: new Map(),
    projectedByFranchise: new Map(),
    titlePair: null,
    mutualRivalKeys: new Set(),
    namedRivalryOf: null,
    bookSpreadByMatchup: new Map(),
    priorFeaturedSlugs: new Set(),
    raceTags: new Map(),
    ...overrides,
  };
}

describe("resolveFromSource on the real 2026 week 3", () => {
  it("does not feature Real Olave Garden v Of Mice and Mendoza on records alone", () => {
    const r = resolveFromSource(source());
    expect(r.pick!.matchupId).not.toBe(1);
    expect(r.kicker).not.toMatch(/division lead/i);
    expect(r.blurb).not.toMatch(/first place|receipts|thursday/i);
  });

  it("carries the featured pair's matchupPairKey for the stored blurb's ref_key", () => {
    const r = resolveFromSource(source());
    const [, a, b] = WEEK3.find(([id]) => id === r.pick!.matchupId)!;
    expect(r.pairKey).toBe([a.toLowerCase(), b.toLowerCase()].sort().join("__"));
  });

  it("says Cross-Division, not Rematch, for a cross-division pick", () => {
    const r = resolveFromSource(source());
    expect(r.kicker!.startsWith("Cross-Division · ")).toBe(true);
  });

  it("goes easy on a franchise featured last week (from the stored ref_key)", () => {
    const first = resolveFromSource(source()).pick!.matchupId;
    const [, a, b] = WEEK3.find(([id]) => id === first)!;
    const prior = priorFeaturedSlugsFromRefKey(`${a.toLowerCase()}__${b.toLowerCase()}`);
    const second = resolveFromSource(source({ priorFeaturedSlugs: prior })).pick!.matchupId;
    expect(second).not.toBe(first);
  });

  it("features the named rivalry once one exists, with its name as the stakes", () => {
    const r = resolveFromSource(
      source({
        namedRivalryOf: (x, y) =>
          [x, y].sort().join("|") === "OMM|ROG"
            ? { name: "The Custody Battle", tagline: "One team, two owners, one ugly split." }
            : null,
      })
    );
    expect(r.pick!.matchupId).toBe(1);
    expect(r.stakes).toBe("The Custody Battle");
    expect(r.blurb).toContain("The Custody Battle");
  });

  it("the 1st-in-division chip follows the seedTeams chain, not points-for", () => {
    // TTT and LDL are both 2-0; TTT has more points. A better division record
    // for LDL must put LDL first, as the playoff seeding would.
    const r = resolveFromSource(
      source({
        seasonLookups: {
          h2hLookup: new Map(),
          divisionRecord: new Map([
            ["LDL", { wins: 2, losses: 0, ties: 0 }],
            ["TTT", { wins: 1, losses: 1, ties: 0 }],
          ]),
        },
      })
    );
    expect(r.divisionLeaderStatus.get("LDL")).toBe("1st in Division 1");
    expect(r.divisionLeaderStatus.has("TTT")).toBe(false);
    expect(r.divisionLeaderStatus.get("ROG")).toBe("1st in Division 2");
    expect(r.divisionLeaderStatus.get("MCC")).toBe("1st in Division 3");
    expect(r.divisionLeaderStatus.size).toBe(3);
  });

  it("claims no division leader before a game is played", () => {
    const zeroed = standings.map((s) => ({ ...s, wins: 0, losses: 0, pointsScored: 0 }));
    const r = resolveFromSource(source({ standings: zeroed, week: 1 }));
    expect(r.divisionLeaderStatus.size).toBe(0);
    expect(r.reasons).toEqual(["season-opener"]);
    expect(r.kicker).toMatch(/Season openers$/);
  });

  it("week 1: the title rematch wins and names the bowl", () => {
    const zeroed = standings.map((s) => ({ ...s, wins: 0, losses: 0, pointsScored: 0 }));
    const r = resolveFromSource(
      source({
        standings: zeroed,
        week: 1,
        titlePair: { seasonYear: 2025, championFranchiseId: "OMM", runnerUpFranchiseId: "ROG" },
      })
    );
    expect(r.pick!.matchupId).toBe(1);
    expect(r.isTitleRematch).toBe(true);
    expect(r.kicker).toBe(`${r.bowlName} Rematch · Season openers`);
  });

  it("returns no pick for an empty slate", () => {
    const r = resolveFromSource(source({ matchups: [] }));
    expect(r.pick).toBeNull();
    expect(r.blurb).toBeNull();
  });
});

describe("priorFeaturedSlugsFromRefKey", () => {
  it("splits a matchupPairKey, and a null ref_key means no penalty", () => {
    expect([...priorFeaturedSlugsFromRefKey("foopus__real-olave-garden")]).toEqual([
      "foopus",
      "real-olave-garden",
    ]);
    expect(priorFeaturedSlugsFromRefKey(null).size).toBe(0);
  });
});
