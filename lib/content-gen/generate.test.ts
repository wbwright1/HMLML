import { describe, it, expect } from "vitest";
import { applyDiversityLayer, fillMissingKinds, topUpShortKinds } from "./generate";
import { kindsForSeason } from "./templates";
import type { HubContentInsert } from "@/lib/queries/hub-content";
import type { StatsContext } from "./stats-context";

// A compact preseason context with enough real names/slugs for the template
// generator to produce every preseason kind.
function preseasonContext(overrides: Partial<StatsContext> = {}): StatsContext {
  const team = (name: string, slug: string, record: string, pf: number) => ({
    name,
    slug,
    record,
    pointsFor: pf,
  });
  return {
    seasonYear: 2026,
    week: 1,
    seasonType: "pre",
    hasDivisions: true,
    divisions: [
      {
        name: "Division 1",
        leader: team("Foopus", "foopus", "0-0", 0),
        teams: [team("Foopus", "foopus", "0-0", 0), team("Olave Garden", "olave-garden", "0-0", 0)],
      },
      {
        name: "Division 2",
        leader: team("McCarthyism", "mccarthyism", "0-0", 0),
        teams: [team("McCarthyism", "mccarthyism", "0-0", 0), team("Better Call Hall", "better-call-hall", "0-0", 0)],
      },
      {
        name: "Division 3",
        leader: team("Team C", "team-c", "0-0", 0),
        teams: [team("Team C", "team-c", "0-0", 0)],
      },
    ],
    leagueStandings: [
      team("Foopus", "foopus", "0-0", 0),
      team("Olave Garden", "olave-garden", "0-0", 0),
      team("McCarthyism", "mccarthyism", "0-0", 0),
      team("Better Call Hall", "better-call-hall", "0-0", 0),
      team("Team C", "team-c", "0-0", 0),
    ],
    lastSeason: {
      year: 2025,
      champion: team("Team C", "team-c", "11-3", 1800),
      doormat: team("Better Call Hall", "better-call-hall", "3-11", 1200),
      pointMachine: team("Foopus", "foopus", "10-4", 1950),
    },
    currentMatchups: [],
    gameOfWeekPairKey: null,
    weekInBooks: null,
    recentTransactions: [],
    franchiseHistory: [],
    rosterProjections: [],
    projectionSeason: null,
    offseasonMoves: [],
    ...overrides,
  };
}

describe("fillMissingKinds", () => {
  const kinds = kindsForSeason("pre");
  const ctx = preseasonContext();

  const smack: HubContentInsert = {
    week: null,
    kind: "smack_post",
    refKey: null,
    body: "LLM smack post.",
    extras: null,
  };

  it("adds nothing when the LLM covered every kind", () => {
    const llmRows: HubContentInsert[] = kinds.map((kind) => ({
      week: null,
      kind,
      refKey: kind === "division_note" ? "Division 1" : null,
      body: "LLM row.",
      extras: null,
    }));
    const { rows, templateFilledKinds } = fillMissingKinds(kinds, llmRows, ctx);
    expect(templateFilledKinds).toEqual([]);
    expect(rows).toBe(llmRows);
  });

  it("backfills only the omitted kinds from the templates", () => {
    // LLM produced ONLY smack posts; every other preseason kind is missing.
    const { rows, templateFilledKinds } = fillMissingKinds(kinds, [smack], ctx);

    // The one produced kind is not refilled.
    expect(templateFilledKinds).not.toContain("smack_post");
    // Every other kind fell back.
    for (const k of kinds) {
      if (k === "smack_post") continue;
      expect(templateFilledKinds).toContain(k);
      expect(rows.some((r) => r.kind === k)).toBe(true);
    }
    // The original LLM smack post survives untouched.
    expect(rows).toContainEqual(smack);
    // No smack posts were added by the fill (the LLM already covered that kind).
    expect(rows.filter((r) => r.kind === "smack_post")).toEqual([smack]);
  });

  it("backfills every kind when the LLM produced nothing", () => {
    const { rows, templateFilledKinds } = fillMissingKinds(kinds, [], ctx);
    expect(templateFilledKinds).toEqual(kinds);
    for (const k of kinds) {
      expect(rows.some((r) => r.kind === k)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// applyDiversityLayer
// ---------------------------------------------------------------------------

describe("applyDiversityLayer", () => {
  it("keeps every matchup_angle with zero drops and no relaxation despite boilerplate-similar bodies", () => {
    const ctx = preseasonContext({
      seasonType: "regular",
      week: 5,
      currentMatchups: [
        {
          pairKey: "foopus__olave-garden",
          home: { name: "Foopus", slug: "foopus", record: "4-0", pointsFor: 500 },
          away: { name: "Olave Garden", slug: "olave-garden", record: "3-1", pointsFor: 480 },
          h2h: null,
        },
        {
          pairKey: "mccarthyism__team-c",
          home: { name: "McCarthyism", slug: "mccarthyism", record: "2-2", pointsFor: 450 },
          away: { name: "Team C", slug: "team-c", record: "4-0", pointsFor: 510 },
          h2h: null,
        },
      ],
    });
    // Boilerplate skeletons: trigram similarity between these is well above
    // the 0.5 threshold, which used to cause drop-then-relax noise.
    const rows: HubContentInsert[] = [
      {
        week: 5,
        kind: "matchup_angle",
        refKey: "foopus__olave-garden",
        body: "Foopus (4-0) hosts Olave Garden (3-1). First-ever meeting between these two.",
        extras: null,
      },
      {
        week: 5,
        kind: "matchup_angle",
        refKey: "mccarthyism__team-c",
        body: "McCarthyism (2-2) hosts Team C (4-0). First-ever meeting between these two.",
        extras: null,
      },
    ];
    const result = applyDiversityLayer(ctx, rows);
    expect(result.rows.filter((r) => r.kind === "matchup_angle")).toHaveLength(2);
    expect(result.diversityStats.droppedCount).toBe(0);
    expect(result.diversityStats.relaxedKinds).toEqual([]);
  });

  it("drops invalid rows and counts them in droppedCount", () => {
    const ctx = preseasonContext();
    const rows: HubContentInsert[] = [
      {
        week: null,
        kind: "burning_question",
        refKey: null,
        body: "Is Foopus actually good this year, or is the group chat lying to itself again?",
        extras: null,
      },
      {
        week: null,
        kind: "offseason_receipt",
        refKey: "not-a-real-franchise", // invalid refKey: fails validateRow
        body: "A receipt about a franchise that does not exist in this league at all.",
        extras: { category: "DRAFT" },
      },
    ];
    const result = applyDiversityLayer(ctx, rows);
    expect(result.invalidCount).toBe(1);
    expect(result.diversityStats.droppedCount).toBe(1);
    expect(result.rows.some((r) => r.refKey === "not-a-real-franchise")).toBe(false);
    expect(result.rows.some((r) => r.kind === "burning_question")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// topUpShortKinds
// ---------------------------------------------------------------------------

describe("topUpShortKinds", () => {
  const kinds = kindsForSeason("pre");

  it("never produces duplicate refKeys within a kind when substituting template rows", () => {
    const ctx = preseasonContext();
    // The templates' first fallback DRAFT receipt cites teams[0] (foopus);
    // the kept LLM row already covers foopus, so the top-up must not add a
    // second foopus receipt.
    const kept: HubContentInsert[] = [
      {
        week: null,
        kind: "offseason_receipt",
        refKey: "foopus",
        body: "Foopus rebuilt the entire receiver room in one weekend and called it maintenance.",
        extras: { category: "TRADE" },
      },
    ];
    const result = topUpShortKinds(kinds, { offseason_receipt: 4 }, kept, ctx);
    const receipts = result.filter((r) => r.kind === "offseason_receipt");
    const refKeys = receipts.map((r) => r.refKey);
    expect(new Set(refKeys).size).toBe(refKeys.length);
    expect(receipts.length).toBeGreaterThan(1); // it did top up
    expect(receipts.length).toBeLessThanOrEqual(4);
  });

  it("rejects a padded template row that shares a kept row's franchise+number hook", () => {
    const ctx = preseasonContext({
      rosterProjections: [
        {
          slug: "team-c",
          name: "Team C",
          projectedStartingPoints: 1420.3,
          leagueRank: 1,
          topProjectedPlayer: { name: "Star QB", position: "QB", points: 380.1 },
        },
      ],
      projectionSeason: 2026,
    });
    // Kept LLM smack already owns the "Team C projects No. 1" hook
    // (franchise team-c + number 1). The template smack pool contains
    // "Team C projects No. 1 in the league before a single snap...", which
    // restates that exact hook and must be skipped by the top-up.
    const kept: HubContentInsert[] = [
      {
        week: null,
        kind: "smack_post",
        refKey: null,
        body: "Team C projects No. 1 and the group chat has already ordered the banner.",
        extras: null,
      },
    ];
    const result = topUpShortKinds(kinds, { smack_post: 5 }, kept, ctx);
    const smacks = result.filter((r) => r.kind === "smack_post");
    expect(smacks.length).toBeGreaterThan(1); // it did top up
    const hookRows = smacks.filter(
      (r) => r.body.includes("Team C") && r.body.includes("No. 1"),
    );
    expect(hookRows).toEqual([kept[0]]); // only the kept row carries that hook
  });

  it("leaves a kind alone when it already meets its target", () => {
    const ctx = preseasonContext();
    const kept: HubContentInsert[] = [
      {
        week: null,
        kind: "hero_dek",
        refKey: null,
        body: "One trophy, twelve delusions, and a schedule that does not care about any of them.",
        extras: null,
      },
    ];
    const result = topUpShortKinds(kinds, { hero_dek: 1 }, kept, ctx);
    expect(result.filter((r) => r.kind === "hero_dek")).toEqual(kept);
  });

  it("does not touch kinds with zero rows (fillMissingKinds owns those)", () => {
    const ctx = preseasonContext();
    const kept: HubContentInsert[] = [];
    const result = topUpShortKinds(kinds, { smack_post: 5 }, kept, ctx);
    expect(result).toEqual([]);
  });
});
