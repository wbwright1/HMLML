import { describe, it, expect } from "vitest";
import { validateRow, findHallucinatedNames, noEmDash, BODY_MAX } from "./validate";
import type { StatsContext } from "./stats-context";

function ctx(overrides: Partial<StatsContext> = {}): StatsContext {
  return {
    seasonYear: 2026,
    week: 1,
    seasonType: "pre",
    hasDivisions: true,
    divisions: [
      {
        name: "Division 1",
        leader: { name: "Foopus", slug: "foopus", record: "0-0", pointsFor: 0 },
        teams: [{ name: "Foopus", slug: "foopus", record: "0-0", pointsFor: 0 }],
      },
    ],
    leagueStandings: [
      { name: "Foopus", slug: "foopus", record: "0-0", pointsFor: 0 },
      { name: "Olave Garden", slug: "olave-garden", record: "0-0", pointsFor: 0 },
    ],
    lastSeason: null,
    currentMatchups: [
      {
        pairKey: "foopus__olave-garden",
        home: { name: "Foopus", slug: "foopus", record: "0-0", pointsFor: 0 },
        away: { name: "Olave Garden", slug: "olave-garden", record: "0-0", pointsFor: 0 },
        h2h: null,
      },
    ],
    gameOfWeekPairKey: null,
    weekInBooks: null,
    recentTransactions: [],
    franchiseHistory: [],
    rosterProjections: [
      {
        slug: "foopus",
        name: "Foopus",
        projectedStartingPoints: 1500,
        leagueRank: 1,
        topProjectedPlayer: { name: "Josh Allen", position: "QB", points: 380 },
      },
    ],
    projectionSeason: 2026,
    offseasonMoves: [],
    ...overrides,
  };
}

describe("noEmDash", () => {
  it("replaces em and en dashes with a comma", () => {
    expect(noEmDash("A—B")).toBe("A, B");
    expect(noEmDash("A–B")).toBe("A, B");
  });
});

describe("findHallucinatedNames", () => {
  it("does not flag a known franchise name", () => {
    expect(findHallucinatedNames("Foopus looks scary this year.", ctx())).toEqual([]);
  });

  it("does not flag a known player name", () => {
    expect(findHallucinatedNames("Josh Allen anchors this roster.", ctx())).toEqual([]);
  });

  it("does not flag common capitalized non-name phrases (allowlist)", () => {
    expect(
      findHallucinatedNames("Rewired the roster before Labor Day arrived.", ctx()),
    ).toEqual([]);
  });

  it("does not reject a sentence with no multi-word capitalized sequence at all", () => {
    expect(findHallucinatedNames("This team is going to disappoint everyone.", ctx())).toEqual([]);
  });

  it("flags a plausible-looking but unknown two-word capitalized name", () => {
    expect(findHallucinatedNames("Bobby Newcombe leads the way this year.", ctx())).toEqual([
      "Bobby Newcombe",
    ]);
  });

  it("does not flag a division name present in ctx", () => {
    expect(findHallucinatedNames("Division 1 is a bloodbath this year.", ctx())).toEqual([]);
  });
});

describe("validateRow", () => {
  const validBurningQuestion = {
    kind: "burning_question" as const,
    refKey: null,
    body: "Is Foopus really as good as their preseason hype suggests this year?",
    extras: null,
  };

  it("accepts a well-formed row", () => {
    expect(validateRow(validBurningQuestion, ctx()).valid).toBe(true);
  });

  it("rejects a kind not valid for the season type", () => {
    const row = { ...validBurningQuestion, kind: "matchup_angle" as const, refKey: "foopus__olave-garden" };
    expect(validateRow(row, ctx({ seasonType: "pre" })).valid).toBe(false);
  });

  it("rejects a refKey that doesn't resolve to a real division", () => {
    const row = {
      kind: "division_note" as const,
      refKey: "Not A Real Division",
      body: "Some division vibe check that is long enough to pass length.",
      extras: { characterization: "chaos" },
    };
    expect(validateRow(row, ctx()).valid).toBe(false);
  });

  it("rejects a refKey that doesn't resolve to a real franchise slug", () => {
    const row = {
      kind: "offseason_receipt" as const,
      refKey: "not-a-real-franchise",
      body: "This franchise made a real move that we are describing here.",
      extras: { category: "DRAFT" },
    };
    expect(validateRow(row, ctx()).valid).toBe(false);
  });

  it("rejects a bold_prediction with a bad verdict enum", () => {
    const row = {
      kind: "bold_prediction" as const,
      refKey: null,
      body: "Foopus is going to win it all this year, book it now.",
      extras: { kicker: "Title Run", verdict: "MAYBE" },
    };
    expect(validateRow(row, ctx()).valid).toBe(false);
  });

  it("rejects an offseason_receipt with a bad category enum", () => {
    const row = {
      kind: "offseason_receipt" as const,
      refKey: "foopus",
      body: "Foopus made a real move that we are describing right here.",
      extras: { category: "TAMPERING" },
    };
    expect(validateRow(row, ctx()).valid).toBe(false);
  });

  it("rejects an empty kicker on bold_prediction", () => {
    const row = {
      kind: "bold_prediction" as const,
      refKey: null,
      body: "Foopus is going to win it all this year, book it now.",
      extras: { kicker: "  ", verdict: "LOCK" },
    };
    expect(validateRow(row, ctx()).valid).toBe(false);
  });

  it("rejects a body shorter than the minimum length", () => {
    const row = { ...validBurningQuestion, body: "Too short." };
    expect(validateRow(row, ctx()).valid).toBe(false);
  });

  it("rejects a body longer than BODY_MAX", () => {
    const row = { ...validBurningQuestion, body: "x".repeat(BODY_MAX + 1) };
    expect(validateRow(row, ctx()).valid).toBe(false);
  });

  it("rejects a body containing an em dash", () => {
    const row = { ...validBurningQuestion, body: "Foopus is good—no, great, this season for real." };
    expect(validateRow(row, ctx()).valid).toBe(false);
  });

  it("rejects a body with a hallucinated name not present in ctx", () => {
    const row = {
      ...validBurningQuestion,
      body: "Is Bobby Newcombe going to save this roster this season?",
    };
    expect(validateRow(row, ctx()).valid).toBe(false);
  });

  it("accepts a matchup_angle with a valid pairKey in regular season", () => {
    const row = {
      kind: "matchup_angle" as const,
      refKey: "foopus__olave-garden",
      body: "Foopus hosts Olave Garden in a matchup that should decide first place.",
      extras: null,
    };
    expect(validateRow(row, ctx({ seasonType: "regular" })).valid).toBe(true);
  });
});
