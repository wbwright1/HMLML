import { describe, it, expect } from "vitest";
import { resolveSeasonPhase, phaseGuidance, type SeasonPhase } from "./season-phase";
import type { StatsContext } from "./stats-context";

function minimalContext(overrides: Partial<StatsContext> = {}): StatsContext {
  return {
    seasonYear: 2026,
    week: 1,
    seasonType: "pre",
    hasDivisions: true,
    divisions: [],
    leagueStandings: [],
    lastSeason: {
      year: 2025,
      champion: { name: "Team C", slug: "team-c", record: "11-3", pointsFor: 1800 },
      doormat: { name: "Better Call Hall", slug: "better-call-hall", record: "3-11", pointsFor: 1200 },
      pointMachine: { name: "Foopus", slug: "foopus", record: "10-4", pointsFor: 1950 },
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

describe("resolveSeasonPhase", () => {
  it("maps seasonType pre to preseason regardless of week", () => {
    expect(resolveSeasonPhase("pre", 1)).toBe("preseason");
    expect(resolveSeasonPhase("pre", 3)).toBe("preseason");
  });

  it("maps post and off to offseason", () => {
    expect(resolveSeasonPhase("post", 18)).toBe("offseason");
    expect(resolveSeasonPhase("off", 1)).toBe("offseason");
  });

  it("subdivides the regular season at the week boundaries", () => {
    expect(resolveSeasonPhase("regular", 1)).toBe("early_season");
    expect(resolveSeasonPhase("regular", 4)).toBe("early_season");
    expect(resolveSeasonPhase("regular", 5)).toBe("mid_season");
    expect(resolveSeasonPhase("regular", 8)).toBe("mid_season");
    expect(resolveSeasonPhase("regular", 9)).toBe("late_season");
    expect(resolveSeasonPhase("regular", 14)).toBe("late_season");
    expect(resolveSeasonPhase("regular", 15)).toBe("playoffs");
    expect(resolveSeasonPhase("regular", 17)).toBe("playoffs");
  });
});

describe("phaseGuidance", () => {
  const ALL_PHASES: SeasonPhase[] = [
    "preseason",
    "early_season",
    "mid_season",
    "late_season",
    "playoffs",
    "offseason",
  ];

  it("names the reigning champion as the only allowed title-defense subject, in every phase", () => {
    const ctx = minimalContext();
    for (const phase of ALL_PHASES) {
      const text = phaseGuidance(phase, ctx);
      expect(text).toContain("reigning champion is Team C");
      expect(text).toContain("ONLY Team C");
    }
  });

  it("bans title-defense framing entirely when no champion is on file", () => {
    const ctx = minimalContext({ lastSeason: null });
    for (const phase of ALL_PHASES) {
      const text = phaseGuidance(phase, ctx);
      expect(text).toContain("names no reigning champion");
      expect(text).not.toContain("reigning champion is ");
    }
  });

  it("preseason guidance bans claimed results and division winners", () => {
    const text = phaseGuidance("preseason", minimalContext());
    expect(text).toContain("SEASON PHASE: PRESEASON");
    expect(text).toContain("Every team is 0-0");
    expect(text).toMatch(/NEVER claim a team has won, currently leads, or has clinched/);
  });

  it("early season guidance bans declaring division winners or playoff locks", () => {
    const text = phaseGuidance("early_season", minimalContext({ seasonType: "regular", week: 2 }));
    expect(text).toContain("SEASON PHASE: EARLY SEASON");
    expect(text).toMatch(/NEVER declare a division winner, a playoff lock/);
  });

  it("playoffs guidance declares the regular season over and the field set", () => {
    const text = phaseGuidance("playoffs", minimalContext({ seasonType: "regular", week: 16 }));
    expect(text).toContain("regular season is OVER");
    expect(text).toContain("toilet bowl");
  });

  it("offseason guidance bans upcoming-matchup content", () => {
    const text = phaseGuidance("offseason", minimalContext({ seasonType: "off" }));
    expect(text).toContain("Do not write about upcoming weekly matchups");
  });
});
