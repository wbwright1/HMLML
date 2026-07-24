import { describe, it, expect } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  applyDiversityLayer,
  buildUserPrompt,
  fillMissingKinds,
  PreseasonSchema,
  promptStatsView,
  RegularSchema,
  topUpShortKinds,
} from "./generate";
import { kindsForSeason } from "./templates";
import type { HubContentInsert } from "@/lib/queries/hub-content";
import type { StatsContext } from "./stats-context";

// ---------------------------------------------------------------------------
// zodOutputFormat build check
// ---------------------------------------------------------------------------
// Structured-outputs risk flagged in the plan: the project pins zod ^4.3.6
// against @anthropic-ai/sdk 0.113.0. zodOutputFormat() internally calls
// z.toJSONSchema(), a zod v4 API; if the installed zod/SDK pairing doesn't
// line up, this throws at build time rather than at request time. Runs first
// (before any network-touching code) so a version mismatch fails loud here
// instead of surfacing as an opaque "no JSON object in response" in prod.
describe("zodOutputFormat builds without throwing", () => {
  it("builds a JSON schema format for PreseasonSchema", () => {
    expect(() => zodOutputFormat(PreseasonSchema)).not.toThrow();
    const format = zodOutputFormat(PreseasonSchema);
    expect(format.type).toBe("json_schema");
    expect(format.schema).toBeTruthy();
  });

  it("builds a JSON schema format for RegularSchema", () => {
    expect(() => zodOutputFormat(RegularSchema)).not.toThrow();
    const format = zodOutputFormat(RegularSchema);
    expect(format.type).toBe("json_schema");
    expect(format.schema).toBeTruthy();
  });
});

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
    recentTrades: [],
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

  it("caps offseason_receipt at one row per franchise, then topUpShortKinds backfills to 4 distinct franchises", () => {
    const ctx = preseasonContext();
    // LLM clustered on just 2 franchises, 2 receipts each; target is 4.
    const llmRows: HubContentInsert[] = [
      {
        week: null,
        kind: "offseason_receipt",
        refKey: "foopus",
        body: "Foopus reached for a punter in round 2, allegedly on purpose.",
        extras: { category: "DRAFT" },
      },
      {
        week: null,
        kind: "offseason_receipt",
        refKey: "foopus",
        body: "Foopus then flipped two firsts for a kicker rumor, somehow.",
        extras: { category: "TRADE" },
      },
      {
        week: null,
        kind: "offseason_receipt",
        refKey: "olave-garden",
        body: "Olave Garden torched the FAAB budget chasing upside on day one.",
        extras: { category: "WAIVERS" },
      },
      {
        week: null,
        kind: "offseason_receipt",
        refKey: "olave-garden",
        body: "Olave Garden kept spending well past the point of sense.",
        extras: { category: "WAIVERS" },
      },
    ];
    const diversityResult = applyDiversityLayer(ctx, llmRows);
    const clusteredReceipts = diversityResult.rows.filter((r) => r.kind === "offseason_receipt");
    const clusteredRefKeys = clusteredReceipts.map((r) => r.refKey);
    expect(new Set(clusteredRefKeys).size).toBe(clusteredRefKeys.length);

    const kinds = kindsForSeason("pre");
    const toppedUp = topUpShortKinds(kinds, { offseason_receipt: 4 }, diversityResult.rows, ctx);
    const receipts = toppedUp.filter((r) => r.kind === "offseason_receipt");
    const refKeys = receipts.map((r) => r.refKey);
    expect(receipts).toHaveLength(4);
    expect(new Set(refKeys).size).toBe(4);
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

// ---------------------------------------------------------------------------
// promptStatsView
// ---------------------------------------------------------------------------

describe("promptStatsView", () => {
  it("strips records, points, leaders, and standings noise when nothing has been played", () => {
    const view = promptStatsView(preseasonContext()) as Record<string, unknown>;
    // Live-season blocks carry only identity: no record, points, or leader.
    const liveJson = JSON.stringify({
      divisions: view.divisions,
      leagueStandings: view.leagueStandings,
      currentMatchups: view.currentMatchups,
    });
    expect(liveJson).not.toContain('"record"');
    expect(liveJson).not.toContain('"pointsFor"');
    expect(liveJson).not.toContain('"leader"');
    expect(view.statsNote).toContain("No games have been played");
    // Completed facts pass through untouched.
    expect(JSON.stringify(view.lastSeason)).toContain('"11-3"');
  });

  it("returns the context unchanged once any game has been played", () => {
    const ctx = preseasonContext({
      seasonType: "regular",
      week: 3,
      leagueStandings: [
        { name: "Foopus", slug: "foopus", record: "2-0", pointsFor: 250 },
        { name: "Team C", slug: "team-c", record: "0-2", pointsFor: 180 },
      ],
    });
    expect(promptStatsView(ctx)).toBe(ctx);
  });
});

// ---------------------------------------------------------------------------
// buildUserPrompt
// ---------------------------------------------------------------------------

describe("buildUserPrompt", () => {
  it("carries preseason phase guidance naming the only legitimate title defender", () => {
    const prompt = buildUserPrompt(preseasonContext());
    expect(prompt).toContain("SEASON PHASE: PRESEASON");
    expect(prompt).toContain("reigning champion is Team C");
    expect(prompt).toContain("PRESEASON/OFFSEASON content"); // the shape spec still follows
  });

  it("subdivides regular-season prompts by week", () => {
    const at = (week: number) =>
      buildUserPrompt(preseasonContext({ seasonType: "regular", week }));
    expect(at(2)).toContain("SEASON PHASE: EARLY SEASON");
    expect(at(6)).toContain("SEASON PHASE: MID SEASON");
    expect(at(11)).toContain("SEASON PHASE: LATE SEASON");
    expect(at(16)).toContain("SEASON PHASE: PLAYOFFS");
  });

  it("bans title-defense framing when the context has no champion", () => {
    const prompt = buildUserPrompt(preseasonContext({ lastSeason: null }));
    expect(prompt).toContain("names no reigning champion");
  });
});
