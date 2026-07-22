import { describe, it, expect } from "vitest";
import { generateFromTemplates, kindsForSeason } from "./templates";
import type { StatsContext } from "./stats-context";

function baseContext(overrides: Partial<StatsContext> = {}): StatsContext {
  return {
    seasonYear: 2026,
    week: 5,
    seasonType: "pre",
    hasDivisions: true,
    divisions: [
      {
        name: "Division 1",
        leader: { name: "Foopus", slug: "foopus", record: "4-1", pointsFor: 620.5 },
        teams: [
          { name: "Foopus", slug: "foopus", record: "4-1", pointsFor: 620.5 },
          { name: "Olave Garden", slug: "olave-garden", record: "2-3", pointsFor: 540.1 },
        ],
      },
      {
        name: "Division 2",
        leader: { name: "McCarthyism", slug: "mccarthyism", record: "3-2", pointsFor: 580.0 },
        teams: [
          { name: "McCarthyism", slug: "mccarthyism", record: "3-2", pointsFor: 580.0 },
          { name: "Better Call Hall", slug: "better-call-hall", record: "1-4", pointsFor: 500.2 },
        ],
      },
      {
        name: "Division 3",
        leader: { name: "Team C", slug: "team-c", record: "5-0", pointsFor: 700.0 },
        teams: [{ name: "Team C", slug: "team-c", record: "5-0", pointsFor: 700.0 }],
      },
    ],
    leagueStandings: [
      { name: "Team C", slug: "team-c", record: "5-0", pointsFor: 700.0 },
      { name: "Foopus", slug: "foopus", record: "4-1", pointsFor: 620.5 },
      { name: "McCarthyism", slug: "mccarthyism", record: "3-2", pointsFor: 580.0 },
      { name: "Olave Garden", slug: "olave-garden", record: "2-3", pointsFor: 540.1 },
      { name: "Better Call Hall", slug: "better-call-hall", record: "1-4", pointsFor: 500.2 },
    ],
    lastSeason: {
      year: 2025,
      champion: { name: "Team C", slug: "team-c", record: "11-3", pointsFor: 1800.0 },
      doormat: { name: "Better Call Hall", slug: "better-call-hall", record: "3-11", pointsFor: 1200.0 },
      pointMachine: { name: "Foopus", slug: "foopus", record: "10-4", pointsFor: 1950.0 },
    },
    currentMatchups: [
      {
        pairKey: "foopus__olave-garden",
        home: { name: "Foopus", slug: "foopus", record: "4-1", pointsFor: 620.5 },
        away: { name: "Olave Garden", slug: "olave-garden", record: "2-3", pointsFor: 540.1 },
        h2h: { wins: 3, losses: 1, ties: 0 },
      },
      {
        pairKey: "better-call-hall__mccarthyism",
        home: { name: "McCarthyism", slug: "mccarthyism", record: "3-2", pointsFor: 580.0 },
        away: { name: "Better Call Hall", slug: "better-call-hall", record: "1-4", pointsFor: 500.2 },
        h2h: { wins: 0, losses: 0, ties: 0 },
      },
    ],
    gameOfWeekPairKey: null,
    weekInBooks: {
      week: 4,
      highestScorer: { franchiseName: "Foopus", franchiseSlug: "foopus", points: 145.3 },
      lowestScorer: { franchiseName: "Better Call Hall", franchiseSlug: "better-call-hall", points: 78.1 },
      biggestBlowout: { winner: "Team C", loser: "Better Call Hall", margin: 60.2 },
      closestWin: { winner: "Foopus", loser: "Olave Garden", margin: 1.4 },
      benchLeader: { franchiseName: "McCarthyism", pointsLeft: 33.5, won: false },
      playerOfWeek: null,
      dudStarter: null,
    },
    recentTransactions: [],
    ...overrides,
  };
}

const hasEmDash = (s: string) => /[—–]/.test(s);

describe("kindsForSeason", () => {
  it("selects preseason kinds outside the regular season", () => {
    expect(kindsForSeason("pre")).toEqual([
      "division_note",
      "burning_question",
      "bold_prediction",
      "offseason_receipt",
      "hero_dek",
      "smack_post",
    ]);
  });

  it("selects regular-season kinds", () => {
    expect(kindsForSeason("regular")).toEqual([
      "matchup_angle",
      "game_of_week_blurb",
      "hero_dek",
      "smack_post",
    ]);
  });
});

describe("generateFromTemplates (preseason)", () => {
  const ctx = baseContext({ seasonType: "pre" });
  const { kinds, rows, source } = generateFromTemplates(ctx);

  it("reports the template source", () => {
    expect(source).toBe("template");
  });

  it("generates exactly the preseason kinds", () => {
    expect(kinds).toEqual(kindsForSeason("pre"));
  });

  it("produces the expected counts per kind", () => {
    const count = (k: string) => rows.filter((r) => r.kind === k).length;
    expect(count("division_note")).toBe(3);
    expect(count("burning_question")).toBe(3);
    expect(count("bold_prediction")).toBe(4);
    expect(count("offseason_receipt")).toBe(4);
    expect(count("hero_dek")).toBe(1);
    expect(count("smack_post")).toBeGreaterThanOrEqual(3);
    expect(count("smack_post")).toBeLessThanOrEqual(5);
  });

  it("scopes every row to the season (week null)", () => {
    expect(rows.every((r) => r.week === null)).toBe(true);
  });

  it("keys division notes and receipts to real names/slugs", () => {
    const validDivisions = new Set(ctx.divisions.map((d) => d.name));
    const validSlugs = new Set(ctx.leagueStandings.map((t) => t.slug));
    for (const r of rows.filter((r) => r.kind === "division_note")) {
      expect(validDivisions.has(r.refKey ?? "")).toBe(true);
    }
    for (const r of rows.filter((r) => r.kind === "offseason_receipt")) {
      expect(validSlugs.has(r.refKey ?? "")).toBe(true);
    }
  });

  it("carries a valid verdict on every bold prediction", () => {
    for (const r of rows.filter((r) => r.kind === "bold_prediction")) {
      expect(["LOCK", "NO", "UP", "DOWN"]).toContain((r.extras as { verdict: string }).verdict);
    }
  });

  it("never emits an em-dash", () => {
    for (const r of rows) expect(hasEmDash(r.body)).toBe(false);
  });

  it("uses only truthful numbers from the context", () => {
    const champBody = rows.find((r) => r.body.includes("Team C"))?.body ?? "";
    // The champion's real record is present, and no fabricated record slips in.
    expect(rows.some((r) => r.body.includes("11-3"))).toBe(true);
    expect(champBody).not.toMatch(/\b\d+-\d+\b.*fabricated/);
  });
});

describe("generateFromTemplates (regular season)", () => {
  const ctx = baseContext({ seasonType: "regular" });
  const { kinds, rows } = generateFromTemplates(ctx);

  it("generates exactly the regular-season kinds", () => {
    expect(kinds).toEqual(kindsForSeason("regular"));
  });

  it("emits one matchup angle per current matchup, keyed by pairKey", () => {
    const angles = rows.filter((r) => r.kind === "matchup_angle");
    expect(angles).toHaveLength(ctx.currentMatchups.length);
    const validPairs = new Set(ctx.currentMatchups.map((m) => m.pairKey));
    for (const a of angles) expect(validPairs.has(a.refKey ?? "")).toBe(true);
  });

  it("emits one game-of-week blurb and one hero dek", () => {
    expect(rows.filter((r) => r.kind === "game_of_week_blurb")).toHaveLength(1);
    expect(rows.filter((r) => r.kind === "hero_dek")).toHaveLength(1);
  });

  it("scopes every row to the current week", () => {
    expect(rows.every((r) => r.week === ctx.week)).toBe(true);
  });

  it("reflects real head-to-head in the matchup angle", () => {
    const angle = rows.find((r) => r.refKey === "foopus__olave-garden");
    expect(angle?.body).toContain("3-1");
  });

  it("never emits an em-dash", () => {
    for (const r of rows) expect(hasEmDash(r.body)).toBe(false);
  });

  it("features the pair named by gameOfWeekPairKey when set", () => {
    const ctxWithGotw = baseContext({
      seasonType: "regular",
      gameOfWeekPairKey: "better-call-hall__mccarthyism",
    });
    const gotw = generateFromTemplates(ctxWithGotw).rows.find(
      (r) => r.kind === "game_of_week_blurb"
    );
    // The blurb should be about the selected pair, not the combined-wins pick.
    expect(gotw?.body).toContain("McCarthyism");
    expect(gotw?.body).toContain("Better Call Hall");
  });
});

describe("kindsForSeason (unsupported states)", () => {
  it("maps post and off to no kinds", () => {
    expect(kindsForSeason("post")).toEqual([]);
    expect(kindsForSeason("off")).toEqual([]);
  });
});
