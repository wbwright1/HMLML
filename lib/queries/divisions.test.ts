import { describe, it, expect } from "vitest";
import type { TiebreakGame } from "@/lib/nfl-tiebreakers";
import {
  seedTeams,
  buildDivisionalField,
  pairRowsToGames,
  type SeededTeam,
} from "@/lib/queries/divisions";

function team(overrides: Partial<SeededTeam> & { franchiseId: string }): SeededTeam {
  return {
    slug: overrides.franchiseId,
    name: overrides.franchiseId,
    abbreviation: null,
    brandingColor: null,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsScored: 0,
    division: null,
    divisionName: null,
    ...overrides,
  };
}


/** A completed game the first team won. */
function beat(winner: string, loser: string, pw = 120, pl = 100): TiebreakGame {
  return { teamA: winner, teamB: loser, pointsA: pw, pointsB: pl, winner: "A" };
}
const lk = (games: TiebreakGame[] = []) => ({ games });

// Real 2026 results, weeks 1-11 (Sleeper, pulled 2026-11-24).
const TEAMS_2026: [string, number, number, number][] = [
  ["TTT", 9, 2, 1],
  ["VV", 2, 9, 3],
  ["OMM", 3, 8, 2],
  ["MCC", 10, 1, 3],
  ["BCH", 3, 8, 3],
  ["FOO", 4, 7, 2],
  ["TB", 4, 7, 1],
  ["KWO", 5, 6, 3],
  ["BGS", 5, 6, 1],
  ["BCM", 6, 5, 2],
  ["ROG", 9, 2, 2],
  ["LDL", 6, 5, 1],
];
const GAMES_2026: [string, string, number, number][] = [
  ["TTT", "BGS", 124.66, 117.9], // wk 1
  ["VV", "ROG", 176.8, 179.26], // wk 1
  ["OMM", "KWO", 82.48, 168.88], // wk 1
  ["MCC", "BCM", 184.96, 106.72], // wk 1
  ["BCH", "FOO", 134.02, 115.76], // wk 1
  ["TB", "LDL", 145.12, 148.74], // wk 1
  ["TTT", "TB", 204.94, 140.78], // wk 2
  ["VV", "FOO", 118.4, 93.22], // wk 2
  ["OMM", "MCC", 114.54, 163.9], // wk 2
  ["BCH", "LDL", 95.56, 127.18], // wk 2
  ["KWO", "BGS", 103.6, 128.36], // wk 2
  ["BCM", "ROG", 127.4, 152.1], // wk 2
  ["TTT", "KWO", 150.88, 133.02], // wk 3
  ["VV", "LDL", 122.44, 163.66], // wk 3
  ["OMM", "ROG", 121.1, 166.54], // wk 3
  ["MCC", "BGS", 183.26, 100.16], // wk 3
  ["BCH", "TB", 130.32, 140.48], // wk 3
  ["FOO", "BCM", 113.34, 118.94], // wk 3
  ["TTT", "BCH", 138.1, 113.84], // wk 4
  ["VV", "TB", 101.58, 147.48], // wk 4
  ["OMM", "FOO", 178.66, 133.88], // wk 4
  ["MCC", "KWO", 187.0, 114.32], // wk 4
  ["BGS", "ROG", 103.84, 137.52], // wk 4
  ["BCM", "LDL", 150.98, 130.24], // wk 4
  ["TTT", "MCC", 139.68, 224.62], // wk 5
  ["VV", "BCH", 137.92, 105.48], // wk 5
  ["OMM", "LDL", 112.9, 167.52], // wk 5
  ["FOO", "BGS", 113.92, 110.76], // wk 5
  ["TB", "BCM", 156.66, 179.52], // wk 5
  ["KWO", "ROG", 85.76, 133.38], // wk 5
  ["TTT", "TB", 126.6, 104.08], // wk 6
  ["VV", "MCC", 92.94, 152.58], // wk 6
  ["OMM", "FOO", 119.14, 121.1], // wk 6
  ["BCH", "KWO", 107.9, 95.86], // wk 6
  ["BGS", "LDL", 92.66, 135.98], // wk 6
  ["BCM", "ROG", 133.26, 161.9], // wk 6
  ["TTT", "ROG", 145.18, 166.12], // wk 7
  ["VV", "BCM", 81.64, 133.56], // wk 7
  ["OMM", "BCH", 130.32, 118.92], // wk 7
  ["MCC", "FOO", 142.38, 145.46], // wk 7
  ["TB", "BGS", 83.2, 109.04], // wk 7
  ["KWO", "LDL", 98.24, 155.54], // wk 7
  ["TTT", "VV", 199.64, 101.14], // wk 8
  ["OMM", "TB", 113.86, 122.98], // wk 8
  ["MCC", "ROG", 176.44, 140.58], // wk 8
  ["BCH", "BCM", 129.9, 97.36], // wk 8
  ["FOO", "KWO", 106.8, 108.98], // wk 8
  ["BGS", "LDL", 129.38, 110.24], // wk 8
  ["TTT", "BCM", 153.78, 119.74], // wk 9
  ["VV", "OMM", 102.5, 159.74], // wk 9
  ["MCC", "LDL", 144.88, 112.02], // wk 9
  ["BCH", "BGS", 92.48, 111.06], // wk 9
  ["FOO", "ROG", 140.18, 116.14], // wk 9
  ["TB", "KWO", 103.44, 141.48], // wk 9
  ["TTT", "LDL", 224.84, 155.24], // wk 10
  ["VV", "KWO", 61.72, 121.3], // wk 10
  ["OMM", "ROG", 93.72, 169.24], // wk 10
  ["MCC", "BCH", 203.5, 88.26], // wk 10
  ["FOO", "BCM", 88.1, 117.28], // wk 10
  ["TB", "BGS", 140.54, 104.26], // wk 10
  ["TTT", "FOO", 160.76, 105.0], // wk 11
  ["VV", "BGS", 77.2, 139.98], // wk 11
  ["OMM", "BCM", 106.44, 111.6], // wk 11
  ["MCC", "TB", 167.04, 117.24], // wk 11
  ["BCH", "KWO", 92.6, 103.26], // wk 11
  ["ROG", "LDL", 142.4, 123.5], // wk 11
];

describe("seedTeams", () => {
  it("orders by win% when no ties exist", () => {
    const teams = [
      team({ franchiseId: "a", wins: 5, losses: 5 }),
      team({ franchiseId: "b", wins: 9, losses: 1 }),
      team({ franchiseId: "c", wins: 3, losses: 7 }),
    ];
    const ranked = seedTeams(teams, lk());
    expect(ranked.map((t) => t.franchiseId)).toEqual(["b", "a", "c"]);
  });

  it("breaks a record tie using head-to-head", () => {
    // a and b are tied at 8-2; a beat b twice head-to-head.
    const teams = [
      team({ franchiseId: "a", wins: 8, losses: 2, pointsScored: 1000 }),
      team({ franchiseId: "b", wins: 8, losses: 2, pointsScored: 1200 }), // more PF, but loses H2H
    ];
    const ranked = seedTeams(teams, lk([beat("a", "b"), beat("a", "b")]));
    expect(ranked.map((t) => t.franchiseId)).toEqual(["a", "b"]);
  });

  it("breaks an H2H-neutral tie using division record", () => {
    // a and b tied at 8-2 and split their two meetings (neutral). b went 1-0
    // against division-mate x and a lost to x, so b has the better division
    // record (NFL step 2).
    const teams = [
      team({ franchiseId: "a", wins: 8, losses: 2, pointsScored: 1000, division: 1 }),
      team({ franchiseId: "b", wins: 8, losses: 2, pointsScored: 1000, division: 1 }),
      team({ franchiseId: "x", wins: 2, losses: 8, division: 1 }),
    ];
    const ranked = seedTeams(
      teams,
      lk([beat("a", "b"), beat("b", "a"), beat("b", "x"), beat("x", "a")]),
    ).filter((t) => t.franchiseId !== "x");
    expect(ranked.map((t) => t.franchiseId)).toEqual(["b", "a"]);
  });

  it("falls back to the points steps when every record step is neutral", () => {
    const teams = [
      team({ franchiseId: "a", wins: 8, losses: 2 }),
      team({ franchiseId: "b", wins: 8, losses: 2 }),
      team({ franchiseId: "c", wins: 2, losses: 8 }),
    ];
    // a and b never met; both beat c, b by more. Combined ranking decides.
    const ranked = seedTeams(teams, lk([beat("a", "c", 110, 100), beat("b", "c", 150, 100)]));
    expect(ranked.map((t) => t.franchiseId)).toEqual(["b", "a", "c"]);
  });

  it("supports the null-division fallback: straight top-N by record", () => {
    // No division on any team (legacy season): seedTeams still works, with the
    // division-based steps skipping themselves, which is what the RISK-B fallback in
    // getPlayoffProjection relies on.
    const teams = [
      team({ franchiseId: "a", wins: 10, losses: 0, division: null }),
      team({ franchiseId: "b", wins: 8, losses: 2, division: null }),
      team({ franchiseId: "c", wins: 6, losses: 4, division: null }),
      team({ franchiseId: "d", wins: 4, losses: 6, division: null }),
    ];
    const ranked = seedTeams(teams, lk());
    const top3 = ranked.slice(0, 3).map((t) => t.franchiseId);
    expect(top3).toEqual(["a", "b", "c"]);
  });

  it("3-way tie with a head-to-head cycle is stable across input orders", () => {
    // a beat b, b beat c, c beat a: no sweep, no division, so the tie falls
    // to the points steps. Every input order must produce the same result.
    const base = [
      team({ franchiseId: "a", wins: 8, losses: 2 }),
      team({ franchiseId: "b", wins: 8, losses: 2 }),
      team({ franchiseId: "c", wins: 8, losses: 2 }),
    ];
    const games = [beat("a", "b", 130, 100), beat("b", "c", 125, 100), beat("c", "a", 120, 100)];
    const expected = seedTeams(base, lk(games)).map((t) => t.franchiseId);
    for (const perm of [
      [base[2], base[1], base[0]],
      [base[1], base[2], base[0]],
      [base[2], base[0], base[1]],
    ]) {
      expect(seedTeams(perm, lk(games)).map((t) => t.franchiseId)).toEqual(expected);
    }
  });

  it("3-way tie: a head-to-head sweep seeds first despite fewer points", () => {
    const teams = [
      team({ franchiseId: "a", wins: 8, losses: 2, pointsScored: 900 }),
      team({ franchiseId: "b", wins: 8, losses: 2, pointsScored: 1300 }),
      team({ franchiseId: "c", wins: 8, losses: 2, pointsScored: 1200 }),
    ];
    const ranked = seedTeams(teams, lk([beat("a", "b"), beat("a", "c"), beat("b", "c")]));
    expect(ranked.map((t) => t.franchiseId)).toEqual(["a", "b", "c"]);
  });
});

describe("buildDivisionalField", () => {
  it("seats every division winner ahead of a better-record wildcard", () => {
    // Each division has 4 teams (the league's real shape). Division 1's
    // winner is weak (6-8, the best of a bad division) but still a division
    // winner. Division 2's non-winner (d2-wildcard-star, 11-3) has a far
    // better record than division 1's winner but plays behind an even
    // stronger division-mate (d2-champ, 12-2), so it is NOT its division's
    // winner. It must still qualify as a wildcard without bumping any
    // division winner out of the field.
    const teamsByDivision = new Map<number, SeededTeam[]>([
      [
        1,
        [
          team({ franchiseId: "d1-winner", wins: 6, losses: 8, division: 1 }),
          team({ franchiseId: "d1-second", wins: 5, losses: 9, division: 1 }),
          team({ franchiseId: "d1-third", wins: 4, losses: 10, division: 1 }),
          team({ franchiseId: "d1-fourth", wins: 2, losses: 12, division: 1 }),
        ],
      ],
      [
        2,
        [
          team({ franchiseId: "d2-champ", wins: 12, losses: 2, division: 2 }),
          team({ franchiseId: "d2-wildcard-star", wins: 11, losses: 3, division: 2 }),
          team({ franchiseId: "d2-third", wins: 6, losses: 8, division: 2 }),
          team({ franchiseId: "d2-fourth", wins: 3, losses: 11, division: 2 }),
        ],
      ],
      [
        3,
        [
          team({ franchiseId: "d3-winner", wins: 9, losses: 5, division: 3 }),
          team({ franchiseId: "d3-second", wins: 7, losses: 7, division: 3 }),
          team({ franchiseId: "d3-third", wins: 5, losses: 9, division: 3 }),
          team({ franchiseId: "d3-fourth", wins: 1, losses: 13, division: 3 }),
        ],
      ],
    ]);

    const { field, firstOut } = buildDivisionalField(teamsByDivision, lk());

    const inField = new Set(field.map((t) => t.franchiseId));
    // All three division winners qualify, even the weak one.
    expect(inField.has("d1-winner")).toBe(true);
    expect(inField.has("d2-champ")).toBe(true);
    expect(inField.has("d3-winner")).toBe(true);

    // The wildcard-caliber non-winner qualifies too (best remaining record).
    expect(inField.has("d2-wildcard-star")).toBe(true);
    expect(field.find((t) => t.franchiseId === "d2-wildcard-star")?.isWildcard).toBe(true);

    // The weaker non-winners in divisions 1 and 3 fill out the wildcard race;
    // the worst of the pool with a losing record is the first team out.
    expect(field.length).toBe(6);
    expect(firstOut).not.toBeNull();
    expect(firstOut?.isIn).toBe(false);

    // Division winners are flagged correctly and never marked as wildcards.
    for (const winnerId of ["d1-winner", "d2-champ", "d3-winner"]) {
      const entry = field.find((t) => t.franchiseId === winnerId);
      expect(entry?.isDivisionWinner).toBe(true);
      expect(entry?.isWildcard).toBe(false);
    }
  });

  it("uses H2H to decide the contested bubble seed", () => {
    const teamsByDivision = new Map<number, SeededTeam[]>([
      [1, [team({ franchiseId: "d1-winner", wins: 10, losses: 4, division: 1 })]],
      [2, [team({ franchiseId: "d2-winner", wins: 9, losses: 5, division: 2 })]],
      [
        3,
        [
          team({ franchiseId: "d3-winner", wins: 8, losses: 6, division: 3 }),
          team({ franchiseId: "bubble-a", wins: 7, losses: 7, division: 3, pointsScored: 1000 }),
          team({ franchiseId: "bubble-b", wins: 7, losses: 7, division: 3, pointsScored: 1200 }),
        ],
      ],
    ]);

    // bubble-a beat bubble-b head-to-head, despite fewer points for.
    const { field } = buildDivisionalField(teamsByDivision, lk([beat("bubble-a", "bubble-b")]));
    const seedA = field.find((t) => t.franchiseId === "bubble-a")?.seed;
    const seedB = field.find((t) => t.franchiseId === "bubble-b")?.seed;
    expect(seedA).toBeDefined();
    expect(seedB).toBeDefined();
    expect(seedA!).toBeLessThan(seedB!);
  });

  it("real 2026 standings after week 11 seed by NFL head-to-head", () => {
    const teams = TEAMS_2026.map(([id, w, l, div]) =>
      team({ franchiseId: id, wins: w, losses: l, division: div }),
    );
    const byDiv = new Map<number, SeededTeam[]>();
    for (const tm of teams) byDiv.set(tm.division!, [...(byDiv.get(tm.division!) ?? []), tm]);
    const games: TiebreakGame[] = GAMES_2026.map(([teamA, teamB, pointsA, pointsB]) => ({
      teamA,
      teamB,
      pointsA,
      pointsB,
      winner: pointsA > pointsB ? "A" : pointsB > pointsA ? "B" : null,
    }));
    const { field, firstOut } = buildDivisionalField(byDiv, lk(games));
    // ROG over TTT (9-2) for the 2 seed: ROG won week 7. BCM over LDL (6-5):
    // week 4. BGS over KWO (5-6) for the last spot: week 2. On points for
    // all three would flip.
    expect(field.map((t) => t.franchiseId)).toEqual(["MCC", "ROG", "TTT", "BCM", "LDL", "BGS"]);
    expect(firstOut?.franchiseId).toBe("KWO");
  });
});

describe("pairRowsToGames", () => {
  const row = (idA: string, idB: string, aWinner: boolean | null, bWinner: boolean | null, aPoints: number | null, bPoints: number | null, status = "complete") => ({
    idA,
    idB,
    aWinner,
    bWinner,
    status,
    aPoints,
    bPoints,
  });

  it("keeps each game once, counts completed ties, and drops unplayed games", () => {
    const games = pairRowsToGames([
      row("a", "b", true, false, 120, 100),
      row("b", "a", false, true, 100, 120),
      row("a", "c", null, null, 99, 99),
      row("c", "a", null, null, 99, 99),
      row("b", "c", null, null, 0, 0, "scheduled"),
      row("c", "b", null, null, 0, 0, "scheduled"),
    ]);
    expect(games).toEqual([
      { teamA: "a", teamB: "b", pointsA: 120, pointsB: 100, winner: "A" },
      { teamA: "a", teamB: "c", pointsA: 99, pointsB: 99, winner: null },
    ]);
  });
});
