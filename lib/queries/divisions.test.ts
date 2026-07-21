import { describe, it, expect } from "vitest";
import { seedTeams, buildDivisionalField, type SeededTeam } from "@/lib/queries/divisions";

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

describe("seedTeams", () => {
  it("orders by win% when no ties exist", () => {
    const teams = [
      team({ franchiseId: "a", wins: 5, losses: 5 }),
      team({ franchiseId: "b", wins: 9, losses: 1 }),
      team({ franchiseId: "c", wins: 3, losses: 7 }),
    ];
    const ranked = seedTeams(teams, new Map(), new Map());
    expect(ranked.map((t) => t.franchiseId)).toEqual(["b", "a", "c"]);
  });

  it("breaks a record tie using head-to-head", () => {
    // a and b are tied at 8-2; a beat b twice head-to-head.
    const teams = [
      team({ franchiseId: "a", wins: 8, losses: 2, pointsScored: 1000 }),
      team({ franchiseId: "b", wins: 8, losses: 2, pointsScored: 1200 }), // more PF, but loses H2H
    ];
    const h2hLookup = new Map([
      ["a|b", { wins: 2, losses: 0, ties: 0 }],
      ["b|a", { wins: 0, losses: 2, ties: 0 }],
    ]);
    const ranked = seedTeams(teams, h2hLookup, new Map());
    expect(ranked.map((t) => t.franchiseId)).toEqual(["a", "b"]);
  });

  it("breaks an H2H-neutral tie using division record", () => {
    // a and b tied at 8-2, split their single head-to-head meeting 1-1 (neutral).
    // b has a better in-division record, so b should rank ahead.
    const teams = [
      team({ franchiseId: "a", wins: 8, losses: 2, pointsScored: 1000, division: 1 }),
      team({ franchiseId: "b", wins: 8, losses: 2, pointsScored: 1000, division: 1 }),
    ];
    const h2hLookup = new Map([
      ["a|b", { wins: 1, losses: 1, ties: 0 }],
      ["b|a", { wins: 1, losses: 1, ties: 0 }],
    ]);
    const divisionRecord = new Map([
      ["a", { wins: 2, losses: 4, ties: 0 }],
      ["b", { wins: 5, losses: 1, ties: 0 }],
    ]);
    const ranked = seedTeams(teams, h2hLookup, divisionRecord);
    expect(ranked.map((t) => t.franchiseId)).toEqual(["b", "a"]);
  });

  it("falls back to points for when every other tiebreaker is neutral", () => {
    const teams = [
      team({ franchiseId: "a", wins: 8, losses: 2, pointsScored: 1000 }),
      team({ franchiseId: "b", wins: 8, losses: 2, pointsScored: 1300 }),
    ];
    // No H2H games played, no division record data at all.
    const ranked = seedTeams(teams, new Map(), new Map());
    expect(ranked.map((t) => t.franchiseId)).toEqual(["b", "a"]);
  });

  it("supports the null-division fallback: straight top-N by record", () => {
    // No division on any team (legacy season) — seedTeams still works purely
    // on record/PF, which is exactly what the RISK-B fallback in
    // getPlayoffProjection relies on.
    const teams = [
      team({ franchiseId: "a", wins: 10, losses: 0, division: null }),
      team({ franchiseId: "b", wins: 8, losses: 2, division: null }),
      team({ franchiseId: "c", wins: 6, losses: 4, division: null }),
      team({ franchiseId: "d", wins: 4, losses: 6, division: null }),
    ];
    const ranked = seedTeams(teams, new Map(), new Map());
    const top3 = ranked.slice(0, 3).map((t) => t.franchiseId);
    expect(top3).toEqual(["a", "b", "c"]);
  });

  it("resolves a 3-way record tie deterministically via aggregate intra-group H2H (no cycle)", () => {
    // a, b, c all 8-2. Pairwise H2H forms a rock-paper-scissors CYCLE:
    // a beat b, b beat c, c beat a — non-transitive, so a naive pairwise
    // comparator inside sort would be order-dependent. With aggregate
    // intra-group differential every team is +0 (1 win, 1 loss within the
    // group), so the tie falls through to points for: a(1200) > b(1100) >
    // c(1000). The result must be stable no matter the input order.
    const base = [
      team({ franchiseId: "a", wins: 8, losses: 2, pointsScored: 1200 }),
      team({ franchiseId: "b", wins: 8, losses: 2, pointsScored: 1100 }),
      team({ franchiseId: "c", wins: 8, losses: 2, pointsScored: 1000 }),
    ];
    const h2hLookup = new Map([
      ["a|b", { wins: 1, losses: 0, ties: 0 }],
      ["b|a", { wins: 0, losses: 1, ties: 0 }],
      ["b|c", { wins: 1, losses: 0, ties: 0 }],
      ["c|b", { wins: 0, losses: 1, ties: 0 }],
      ["c|a", { wins: 1, losses: 0, ties: 0 }],
      ["a|c", { wins: 0, losses: 1, ties: 0 }],
    ]);

    const expected = ["a", "b", "c"];
    // Every permutation of the input must produce the same total order.
    const permutations = [
      [base[0], base[1], base[2]],
      [base[2], base[1], base[0]],
      [base[1], base[2], base[0]],
      [base[2], base[0], base[1]],
    ];
    for (const perm of permutations) {
      const ranked = seedTeams(perm, h2hLookup, new Map());
      expect(ranked.map((t) => t.franchiseId)).toEqual(expected);
    }
  });

  it("breaks a 3-way tie by aggregate intra-group H2H when one team swept the group", () => {
    // a, b, c all 8-2. a beat BOTH b and c (diff +2); b and c split with each
    // other (diff 0 each, resolved by PF). a must seed first purely on the
    // aggregate H2H differential, ahead of higher-PF teams.
    const teams = [
      team({ franchiseId: "a", wins: 8, losses: 2, pointsScored: 900 }),
      team({ franchiseId: "b", wins: 8, losses: 2, pointsScored: 1300 }),
      team({ franchiseId: "c", wins: 8, losses: 2, pointsScored: 1200 }),
    ];
    const h2hLookup = new Map([
      ["a|b", { wins: 1, losses: 0, ties: 0 }],
      ["b|a", { wins: 0, losses: 1, ties: 0 }],
      ["a|c", { wins: 1, losses: 0, ties: 0 }],
      ["c|a", { wins: 0, losses: 1, ties: 0 }],
      ["b|c", { wins: 1, losses: 0, ties: 0 }],
      ["c|b", { wins: 0, losses: 1, ties: 0 }],
    ]);
    const ranked = seedTeams(teams, h2hLookup, new Map());
    // a swept (+2), then b beat c (+0 vs c's -0... b has diff 0 from a-loss
    // +c-win = 0, c has diff -0... both 0) -> PF: b(1300) > c(1200).
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

    const { field, firstOut } = buildDivisionalField(teamsByDivision, new Map(), new Map());

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
    const h2hLookup = new Map([
      ["bubble-a|bubble-b", { wins: 1, losses: 0, ties: 0 }],
      ["bubble-b|bubble-a", { wins: 0, losses: 1, ties: 0 }],
    ]);

    const { field } = buildDivisionalField(teamsByDivision, h2hLookup, new Map());
    const seedA = field.find((t) => t.franchiseId === "bubble-a")?.seed;
    const seedB = field.find((t) => t.franchiseId === "bubble-b")?.seed;
    expect(seedA).toBeDefined();
    expect(seedB).toBeDefined();
    expect(seedA!).toBeLessThan(seedB!);
  });
});
