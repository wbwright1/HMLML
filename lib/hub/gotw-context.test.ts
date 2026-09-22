import { describe, it, expect } from "vitest";
import {
  resolveFromSource,
  priorFeaturedSlugsFromRefKey,
  namedRivalryLookupFrom,
  type GotwSource,
  type GotwStandingRow,
} from "./gotw-context";
import { gameOfWeekBlurb } from "./between-weeks";
import { heroHeadline } from "./hero-headline";

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

  const custodyOf = (x: string, y: string) =>
    [x, y].sort().join("|") === "OMM|ROG"
      ? { name: "The Custody Battle", tagline: "One team, two owners, one ugly split." }
      : null;

  it("a named 2-0 v 0-2 rivalry stays off the top card (weight 12)", () => {
    const r = resolveFromSource(source({ namedRivalryOf: custodyOf }));
    expect(r.pick!.matchupId).not.toBe(1);
    expect(r.namedRivalry).toBeNull();
    // The candidate still carries the name, so its slate card can print it.
    expect(r.candidates.find((c) => c.matchupId === 1)!.namedRivalry?.name).toBe(
      "The Custody Battle"
    );
  });

  it("features a named rivalry that is also a real game, with its name leading the kicker", () => {
    // Give ROG v OMM two even records: 1-1 v 1-1 plus the name beats 2-0 v 1-1
    // (and with every other Division 2 team 0-2, the winner leads it).
    const even = standings.map((s) =>
      s.franchiseId === "ROG" || s.franchiseId === "OMM" ? { ...s, wins: 1, losses: 1 } : s
    );
    const r = resolveFromSource(source({ namedRivalryOf: custodyOf, standings: even }));
    expect(r.pick!.matchupId).toBe(1);
    expect(r.stakes).toBe("The Custody Battle");
    expect(r.blurb).toContain("The Custody Battle");
    expect(r.kicker).toBe("The Custody Battle · Division lead on the line");
    expect(r.namedRivalry).toEqual({
      name: "The Custody Battle",
      tagline: "One team, two owners, one ugly split.",
    });
  });

  it("namedRivalryLookupFrom finds a pair in either order and nothing else", () => {
    const lookup = namedRivalryLookupFrom([
      { franchiseAId: "OMM", franchiseBId: "ROG", name: "The Custody Battle", tagline: null },
    ])!;
    expect(lookup("ROG", "OMM")?.name).toBe("The Custody Battle");
    expect(lookup("OMM", "ROG")?.name).toBe("The Custody Battle");
    expect(lookup("ROG", "TTT")).toBeNull();
    expect(lookup("ROG", "ROG")).toBeNull();
    expect(namedRivalryLookupFrom([])).toBeNull();
    // Wired through to the candidates (whether or not the name wins the card).
    const r = resolveFromSource(source({ namedRivalryOf: lookup }));
    expect(r.candidates.find((c) => c.matchupId === 1)!.namedRivalry?.name).toBe(
      "The Custody Battle"
    );
    expect(r.candidates.filter((c) => c.namedRivalry).map((c) => c.matchupId)).toEqual([1]);
  });

  it("carries no rivalry when the pick is not a named rivalry", () => {
    const r = resolveFromSource(source());
    expect(r.namedRivalry).toBeNull();
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

// The real week-2 finals (live DB), in getWeekRecap's shape.
const W2: [string, number, string, number][] = [
  ["TTT", 204.94, "TB", 140.78],
  ["MCC", 163.9, "OMM", 114.54],
  ["LDL", 127.18, "BCH", 95.56],
  ["VV", 118.4, "FOO", 93.22],
  ["BGS", 128.36, "WLD", 103.6],
  ["ROG", 152.1, "BCM", 127.4],
];
const W2_FINALS = W2.map(([w, wp, l, lp]) => ({
  winner: { franchiseId: w, name: NAME.get(w)!, points: wp },
  loser: { franchiseId: l, name: NAME.get(l)!, points: lp },
  margin: Math.round((wp - lp) * 10) / 10,
}));

describe("resolveFromSource: last week's form", () => {
  it("opens the blurb with both featured teams' week-2 results", () => {
    const r = resolveFromSource(source({ priorFinals: W2_FINALS }));
    const [, a, b] = WEEK3.find(([id]) => id === r.pick!.matchupId)!;
    const fa = r.form.a!;
    const fb = r.form.b!;
    expect(fa).not.toBeNull();
    expect(fb).not.toBeNull();
    // Every number is the team's own final.
    const own = (id: string) => W2.find((g) => g[0] === id || g[2] === id)!;
    expect(fa.points).toBe(own(a)[0] === a ? own(a)[1] : own(a)[3]);
    expect(fb.points).toBe(own(b)[0] === b ? own(b)[1] : own(b)[3]);
    const [first, second] = r.blurb!.split(". ");
    expect(first.startsWith(NAME.get(a)!) || first.startsWith(NAME.get(b)!)).toBe(true);
    expect(second.startsWith(NAME.get(a)!) || second.startsWith(NAME.get(b)!)).toBe(true);
  });

  it("the TTT v WLD blurb leads with the 64.2-point win", () => {
    // Pin the pick to TTT v WLD by going easy on the other two 2-0 v 1-1 games.
    const r = resolveFromSource(
      source({
        priorFinals: W2_FINALS,
        priorFeaturedSlugs: new Set(["ldl", "vv", "mcc", "bgs"]),
      })
    );
    expect(r.pick!.matchupId).toBe(3);
    expect(r.blurb!.startsWith(
      "The Tokyo Thunderbirds just ran Taking Boutte off the field by 64.2. " +
        "Watson Love Diggs lost to Bucky's General Store by 24.8. "
    )).toBe(true);
  });

  it("hero = Taking Boutte lost by 64.2: the blurb states TTT's other true fact, never 64.2", () => {
    const r = resolveFromSource(
      source({
        priorFinals: W2_FINALS,
        priorFeaturedSlugs: new Set(["ldl", "vv", "mcc", "bgs"]),
      })
    );
    const hero = heroHeadline({
      recapShown: true,
      priorFinals: W2_FINALS,
      slate: [],
      standings: [],
    });
    expect(hero.text).toBe("Taking Boutte lost by 64.2. It was not that close.");
    const blurb = gameOfWeekBlurb({ ...r.blurbInput!, heroClaim: hero.claim });
    expect(blurb.startsWith(
      "The Tokyo Thunderbirds just hung 204.9 on Taking Boutte. " +
        "Watson Love Diggs lost to Bucky's General Store by 24.8. "
    )).toBe(true);
    // Only the claimed sentence changed; the rest is the resolver's own copy.
    expect(blurb.split(". ").slice(1)).toEqual(r.blurb!.split(". ").slice(1));
    expect(blurb).not.toContain("64.2");
    // Without the claim it is the resolver's own blurb, unchanged.
    expect(gameOfWeekBlurb(r.blurbInput!)).toBe(r.blurb);
  });

  it("without finals there is no form and the blurb opens with the reason", () => {
    const r = resolveFromSource(source());
    expect(r.form).toEqual({ a: null, b: null });
    expect(r.priorFinals).toEqual([]);
    expect(r.blurb).not.toMatch(/last week|just (ran|hung|escaped)|lost by/);
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
