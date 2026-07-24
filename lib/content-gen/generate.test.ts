import { describe, it, expect } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  applyDiversityLayer,
  buildUserPrompt,
  fillMissingKinds,
  PreseasonSchema,
  PreseasonWireSchema,
  promptStatsView,
  RegularSchema,
  RegularWireSchema,
  toRowsPreseason,
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
// Both the strict schemas (canonical shape, used for the prompt spec) and the
// wire schemas (what's actually sent to messages.parse) are checked, since
// they're built independently by preseasonSchemaShape/regularSchemaShape.
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

  it("builds a JSON schema format for PreseasonWireSchema", () => {
    expect(() => zodOutputFormat(PreseasonWireSchema)).not.toThrow();
    const format = zodOutputFormat(PreseasonWireSchema);
    expect(format.type).toBe("json_schema");
    expect(format.schema).toBeTruthy();
  });

  it("builds a JSON schema format for RegularWireSchema", () => {
    expect(() => zodOutputFormat(RegularWireSchema)).not.toThrow();
    const format = zodOutputFormat(RegularWireSchema);
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
// Lenient wire-schema parse + per-row drop (round 2 fix)
// ---------------------------------------------------------------------------
// Regression coverage for the prod failure: zodOutputFormat() strips .max()
// from the JSON Schema sent to the API, but messages.parse() still
// client-side re-validates the FULL parsed object against the Zod schema. On
// the strict schemas, one overlong field anywhere failed that whole-object
// validation and discarded every other row in the same response. The fix
// parses against the relaxed PreseasonWireSchema/RegularWireSchema (no
// string .max()) and instead enforces per-field length downstream, one row
// at a time, via validateRow (called from applyDiversityLayer).

describe("lenient wire schema + per-row drop", () => {
  it("the strict schema rejects a payload with one overlong burning_question, but the wire schema parses it", () => {
    const payload = {
      division_notes: [],
      // 250 chars: over generate.ts's QUESTION_MAX (200, enforced via the
      // strict PreseasonSchema's per-item .max(QUESTION_MAX)) but comfortably
      // under BODY_MAX (400), so this specifically exercises the tighter
      // burning_question-only cap, not just the generic body cap.
      burning_questions: [{ text: "x".repeat(250), claims: [] }],
      bold_predictions: [],
      offseason_receipts: [],
      hero_dek: "",
      smack_posts: [],
    };
    expect(PreseasonSchema.safeParse(payload).success).toBe(false);
    expect(() => PreseasonWireSchema.parse(payload)).not.toThrow();
  });

  it("an overlong burning_question costs only that one row through toRowsPreseason + applyDiversityLayer, not the whole response", () => {
    const ctx = preseasonContext();
    // Parsed exactly the way callOnce does in generateContent: through the
    // relaxed wire schema, so the overlong item survives parsing.
    const parsed = PreseasonWireSchema.parse({
      division_notes: [],
      burning_questions: [
        { text: "Is Foopus actually good this year, or is the group chat lying to itself again?", claims: [] }, // valid length
        { text: "x".repeat(250), claims: [] }, // over QUESTION_MAX; parses fine under the wire schema
      ],
      bold_predictions: [],
      offseason_receipts: [],
      hero_dek: "",
      smack_posts: [],
    });
    const rawRows = toRowsPreseason(parsed, ctx);
    expect(rawRows.filter((r) => r.kind === "burning_question")).toHaveLength(2);

    const { rows, invalidCount } = applyDiversityLayer(ctx, rawRows);
    const survivors = rows.filter((r) => r.kind === "burning_question");
    // Exactly the overlong row was dropped by validateRow's per-kind length
    // check; the valid row shipped. A pre-fix strict-schema parse would have
    // thrown before either row ever reached this point.
    expect(survivors).toHaveLength(1);
    expect(survivors[0].body).toContain("Foopus actually good");
    expect(invalidCount).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Claim verification on the LLM row path (issue #110)
// ---------------------------------------------------------------------------

describe("toRowsPreseason claim gating", () => {
  const fh = (slug: string, pct: number) => ({
    slug,
    allTimeWinPct: pct,
    allTimeWinPctRank: 0,
    championships: 0,
    playoffAppearances: 0,
    seasonsPlayed: 5,
    lastThreeFinishes: [] as (number | null)[],
    sustainedDoormat: false,
    sustainedContender: false,
  });
  // team-c best (0.68), better-call-hall worst (0.30). foopus mid.
  const ctx = preseasonContext({
    franchiseHistory: [fh("team-c", 0.68), fh("foopus", 0.5), fh("better-call-hall", 0.3)],
  });

  it("drops a bold_prediction whose superlative claim is false, keeps the true one", () => {
    const parsed = PreseasonWireSchema.parse({
      division_notes: [],
      burning_questions: [],
      bold_predictions: [
        {
          kicker: "Cellar dweller",
          verdict: "DOWN",
          // FALSE: foopus is not the league-worst win rate; better-call-hall is.
          body: "Foopus and its league-worst 0.500 all-time win rate stay buried in the basement again.",
          claims: [{ metric: "allTimeWinPct", subject: "foopus", extreme: "worst" }],
        },
        {
          kicker: "Rock bottom",
          verdict: "DOWN",
          // TRUE: better-call-hall genuinely holds the worst win rate (0.300).
          body: "Better Call Hall and its league-worst 0.300 win rate are going nowhere fast.",
          claims: [{ metric: "allTimeWinPct", subject: "better-call-hall", extreme: "worst" }],
        },
      ],
      offseason_receipts: [],
      hero_dek: "",
      smack_posts: [],
    });
    const rows = toRowsPreseason(parsed, ctx);
    const preds = rows.filter((r) => r.kind === "bold_prediction");
    expect(preds).toHaveLength(1);
    expect(preds[0].body).toContain("Better Call Hall");
  });

  it("drops a row citing a number absent from the context, keeps a clean row", () => {
    const parsed = PreseasonWireSchema.parse({
      division_notes: [],
      burning_questions: [
        // Cites 0.917, which appears nowhere in the context -> dropped.
        { text: "Can Foopus really sustain a 0.917 pace after last year's collapse?", claims: [] },
        // No numbers, no superlatives -> clean.
        { text: "Is Foopus actually good this year, or is the group chat coping again?", claims: [] },
      ],
      bold_predictions: [],
      offseason_receipts: [],
      hero_dek: "",
      smack_posts: [],
    });
    const rows = toRowsPreseason(parsed, ctx);
    const questions = rows.filter((r) => r.kind === "burning_question");
    expect(questions).toHaveLength(1);
    expect(questions[0].body).toContain("group chat coping");
  });

  it("reads smack_posts from .text and drops an unbacked superlative", () => {
    const parsed = PreseasonWireSchema.parse({
      division_notes: [],
      burning_questions: [],
      bold_predictions: [],
      offseason_receipts: [],
      hero_dek: "",
      smack_posts: [
        // Unbacked "highest" superlative, zero claims -> dropped by tripwire.
        { text: "Team C has the highest ceiling in a league that keeps proving it wrong.", claims: [] },
        // Plain color, no superlative or number -> kept.
        { text: "Somewhere in the group chat, a rebuild is quietly being rebranded as a plan.", claims: [] },
      ],
    });
    const rows = toRowsPreseason(parsed, ctx);
    const smacks = rows.filter((r) => r.kind === "smack_post");
    expect(smacks).toHaveLength(1);
    expect(smacks[0].body).toContain("quietly being rebranded");
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

  it("carries the CLAIMS CONTRACT with the six allowed metrics", () => {
    const prompt = buildUserPrompt(preseasonContext());
    expect(prompt).toContain("CLAIMS CONTRACT");
    for (const metric of [
      "allTimeWinPct",
      "championships",
      "playoffAppearances",
      "projectedStartingPoints",
      "pointsFor",
      "wins",
    ]) {
      expect(prompt).toContain(metric);
    }
    // The two converted kinds now carry {text, claims} in the shape example.
    expect(prompt).toContain('"text"');
    expect(prompt).toContain('"claims"');
  });

  it("carries the CLAIMS CONTRACT for regular-season prompts too", () => {
    const prompt = buildUserPrompt(preseasonContext({ seasonType: "regular", week: 6 }));
    expect(prompt).toContain("CLAIMS CONTRACT");
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
