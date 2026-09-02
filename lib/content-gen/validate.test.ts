import { describe, it, expect } from "vitest";
import {
  validateRow,
  findHallucinatedNames,
  findPositionMismatches,
  noEmDash,
  BODY_MAX,
  QUESTION_MAX,
} from "./validate";
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
        lastMeeting: null,
        playoffMeetingYears: [],
        isTitleRematch: false,
        topProjected: null,
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
    recentTrades: [],
    ...overrides,
  };
}

describe("noEmDash", () => {
  it("replaces em and en dashes with a comma", () => {
    expect(noEmDash("A—B")).toBe("A, B");
    expect(noEmDash("A–B")).toBe("A, B");
  });
});

describe("findPositionMismatches", () => {
  // Mirrors the real production slip: a "receiver haul" listing two WRs and
  // two RBs (Better call Myballs, July 2026).
  const draftCtx = () =>
    ctx({
      offseasonMoves: [
        {
          slug: "better-call-myballs",
          name: "Better call Myballs",
          draftedPlayers: [
            { playerName: "Jordyn Tyson", position: "WR", round: 1, pickNumber: 4, projectedPoints: 178.6 },
            { playerName: "Omar Cooper", position: "WR", round: 1, pickNumber: 11, projectedPoints: 127.1 },
            { playerName: "Nicholas Singleton", position: "RB", round: 2, pickNumber: 16, projectedPoints: 63.7 },
            { playerName: "Kaytron Allen", position: "RB", round: 3, pickNumber: 26, projectedPoints: 45.9 },
          ],
          trades: [],
        },
      ],
    });

  it("flags a collective position claim over a list containing mismatched players", () => {
    const body =
      "Better call Myballs' four-pick receiver haul (Jordyn Tyson, Omar Cooper, Nicholas Singleton, Kaytron Allen) doesn't lift them out of the bottom half.";
    const flags = findPositionMismatches(body, draftCtx());
    expect(flags.some((f) => f.includes("Nicholas Singleton"))).toBe(true);
    expect(flags.some((f) => f.includes("Kaytron Allen"))).toBe(true);
    expect(flags.some((f) => f.includes("Jordyn Tyson"))).toBe(false);
  });

  it("passes a collective claim where every listed player matches", () => {
    const body = "Two receivers arrived at once: Jordyn Tyson and Omar Cooper.";
    expect(findPositionMismatches(body, draftCtx())).toEqual([]);
  });

  it("flags a direct label attached to the wrong player", () => {
    expect(
      findPositionMismatches("They spent pick 16 on receiver Nicholas Singleton.", draftCtx()),
    ).toContainEqual(expect.stringContaining("Nicholas Singleton"));
    expect(
      findPositionMismatches("Nicholas Singleton (WR, pick 16) restocks the room.", draftCtx()),
    ).toContainEqual(expect.stringContaining("Nicholas Singleton"));
  });

  it("passes a direct label that matches the stored position", () => {
    expect(
      findPositionMismatches("They spent pick 16 on RB Nicholas Singleton.", draftCtx()),
    ).toEqual([]);
  });

  it("does not flag scattered players when the term attaches to a different clause", () => {
    // One position term, two known players, but NOT an adjacent list: the
    // term belongs to Tyson's clause only. Must not over-block.
    const body =
      "WR Jordyn Tyson landed at pick 4, and the second round brought Nicholas Singleton for depth.";
    expect(findPositionMismatches(body, draftCtx())).toEqual([]);
  });

  it("skips sentences with multiple position terms as ambiguous", () => {
    const body =
      "Receivers and running backs alike: Jordyn Tyson, Omar Cooper, Nicholas Singleton, Kaytron Allen all arrived in one weekend.";
    expect(findPositionMismatches(body, draftCtx())).toEqual([]);
  });

  it("ignores unknown players entirely", () => {
    expect(
      findPositionMismatches("Receiver Random Rookie is not in the stats context at all.", ctx()),
    ).toEqual([]);
  });

  it("is enforced by validateRow", () => {
    const result = validateRow(
      {
        kind: "bold_prediction",
        refKey: null,
        body: "A four-pick receiver haul (Jordyn Tyson, Omar Cooper, Nicholas Singleton, Kaytron Allen) fixes nothing.",
        extras: { kicker: "Myballs Ceiling", verdict: "NO" },
      },
      draftCtx(),
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("position mismatch");
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

  it("rejects a body longer than BODY_MAX for a kind on the generic length range", () => {
    // hero_dek has no per-kind override, so it uses the generic BODY_MAX.
    const row = { kind: "hero_dek" as const, refKey: null, body: "x".repeat(BODY_MAX + 1), extras: null };
    expect(validateRow(row, ctx()).valid).toBe(false);
  });

  it("rejects a burning_question longer than QUESTION_MAX even though it is under BODY_MAX", () => {
    // Regression: burning_question has its own tighter cap (mirrors
    // generate.ts's QUESTION_MAX), independent of the generic BODY_MAX other
    // kinds use. Length here is between QUESTION_MAX and BODY_MAX, so this
    // only fails if the per-kind override is actually applied.
    const row = { ...validBurningQuestion, body: "x".repeat(QUESTION_MAX + 1) };
    expect(row.body.length).toBeLessThanOrEqual(BODY_MAX);
    expect(validateRow(row, ctx()).valid).toBe(false);
  });

  it("accepts a burning_question right at QUESTION_MAX", () => {
    const row = { ...validBurningQuestion, body: "x".repeat(QUESTION_MAX) };
    expect(validateRow(row, ctx()).valid).toBe(true);
  });

  it("rejects a division_note whose characterization exceeds the kicker length cap", () => {
    const row = {
      kind: "division_note" as const,
      refKey: "Division 1",
      body: "Some division vibe check that is long enough to pass length.",
      extras: { characterization: "x".repeat(41) },
    };
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

  // Claim/superlative verification lives on the LLM-only path
  // (lib/content-gen/claims.ts, called from toRows*), NOT in validateRow:
  // template rows legitimately emit true superlatives and must still pass this
  // gate. These assert that separation so the #110 fix never accidentally
  // starts dropping vetted template rows.
  it("still passes a template-style row framed as 'projects No. 1'", () => {
    const row = {
      kind: "smack_post" as const,
      refKey: null,
      body: "Foopus projects No. 1 in the league before a single snap has been played.",
      extras: null,
    };
    expect(validateRow(row, ctx()).valid).toBe(true);
  });

  it("still passes a template-style row framed as 'dead last'", () => {
    const row = {
      kind: "smack_post" as const,
      refKey: null,
      body: "Olave Garden is stuck dead last in the projections, and the group chat noticed.",
      extras: null,
    };
    expect(validateRow(row, ctx()).valid).toBe(true);
  });
});

describe("validateRow: matchup angles never cite a 0-0 record", () => {
  const angle = (body: string) => ({
    kind: "matchup_angle" as const,
    refKey: "foopus__olave-garden",
    body,
    extras: null,
  });
  const regular = () => ctx({ seasonType: "regular", week: 1 });

  it("rejects the records placeholder the builder was written to eliminate", () => {
    const result = validateRow(
      angle("0-0 against 0-0. Somebody's number moves Wednesday."),
      regular(),
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("0-0");
  });

  it("rejects a 0-0 buried mid-sentence", () => {
    expect(
      validateRow(
        angle("Foopus sits at 0-0 and so does Olave Garden, which settles nothing."),
        regular(),
      ).valid,
    ).toBe(false);
  });

  it("accepts a head-to-head record that merely looks similar", () => {
    expect(
      validateRow(
        angle("Foopus leads this series 10-0 all time over Olave Garden, somehow."),
        regular(),
      ).valid,
    ).toBe(true);
  });

  it("leaves other kinds alone", () => {
    expect(
      validateRow(
        {
          kind: "smack_post" as const,
          refKey: null,
          body: "Everyone is 0-0 right now, which is the last honest day of the year.",
          extras: null,
        },
        regular(),
      ).valid,
    ).toBe(true);
  });
});
