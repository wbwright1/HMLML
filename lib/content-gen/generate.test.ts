import { describe, it, expect } from "vitest";
import { fillMissingKinds } from "./generate";
import { kindsForSeason } from "./templates";
import type { HubContentInsert } from "@/lib/queries/hub-content";
import type { StatsContext } from "./stats-context";

// A compact preseason context with enough real names/slugs for the template
// generator to produce every preseason kind.
function preseasonContext(): StatsContext {
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
