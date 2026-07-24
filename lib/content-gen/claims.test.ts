import { describe, it, expect } from "vitest";
import {
  rankingFor,
  verifyClaim,
  verifyClaims,
  numberMatches,
  extractStatTokens,
  findUnverifiedNumbers,
  findSuperlativeMarkers,
  type Claim,
} from "./claims";
import type { StatsContext } from "./stats-context";

// A context whose franchiseHistory reproduces the #110 shape: Of Mice and
// Mendoza sits at 0.414 (second-worst), Bucky's General Store is the true
// league-worst at 0.343. leagueStandings carries a real thousands-decimal
// pointsFor (2459.9) and a record (12-4) for the numeric tests.
function ctx(overrides: Partial<StatsContext> = {}): StatsContext {
  const fh = (slug: string, pct: number, champs = 0, playoffs = 0, seasons = 5) => ({
    slug,
    allTimeWinPct: pct,
    allTimeWinPctRank: 0, // verifier recomputes; value here is irrelevant
    championships: champs,
    playoffAppearances: playoffs,
    seasonsPlayed: seasons,
    lastThreeFinishes: [] as (number | null)[],
    sustainedDoormat: false,
    sustainedContender: false,
  });
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
    divisions: [],
    leagueStandings: [
      team("Team C", "team-c", "12-4", 2459.9),
      team("Foopus", "foopus", "8-8", 2100.5),
      team("Of Mice and Mendoza", "of-mice-and-mendoza", "5-11", 1800.2),
      team("Bucky's General Store", "buckys-general-store", "3-13", 1500.0),
    ],
    lastSeason: null,
    currentMatchups: [],
    gameOfWeekPairKey: null,
    weekInBooks: null,
    recentTransactions: [],
    franchiseHistory: [
      fh("team-c", 0.68, 2, 5),
      fh("foopus", 0.52, 0, 3),
      fh("of-mice-and-mendoza", 0.414, 0, 1),
      fh("buckys-general-store", 0.343, 0, 0),
    ],
    rosterProjections: [
      { slug: "team-c", name: "Team C", projectedStartingPoints: 1420.3, leagueRank: 1, topProjectedPlayer: { name: "Star QB", position: "QB", points: 380.1 } },
      { slug: "foopus", name: "Foopus", projectedStartingPoints: 1310.7, leagueRank: 2, topProjectedPlayer: null },
    ],
    projectionSeason: 2026,
    offseasonMoves: [],
    recentTrades: [],
    ...overrides,
  };
}

describe("rankingFor", () => {
  it("orders allTimeWinPct best-first", () => {
    const order = rankingFor("allTimeWinPct", ctx()).map((e) => e.slug);
    expect(order).toEqual(["team-c", "foopus", "of-mice-and-mendoza", "buckys-general-store"]);
  });

  it("parses wins from records and orders best-first", () => {
    const order = rankingFor("wins", ctx()).map((e) => e.slug);
    expect(order).toEqual(["team-c", "foopus", "of-mice-and-mendoza", "buckys-general-store"]);
  });

  it("returns [] when the source array is empty", () => {
    expect(rankingFor("allTimeWinPct", ctx({ franchiseHistory: [] }))).toEqual([]);
    expect(rankingFor("projectedStartingPoints", ctx({ rosterProjections: [] }))).toEqual([]);
  });
});

describe("verifyClaim", () => {
  it("accepts a true extreme (Bucky is genuinely league-worst)", () => {
    const claim: Claim = { metric: "allTimeWinPct", subject: "buckys-general-store", extreme: "worst" };
    expect(verifyClaim(claim, ctx())).toBe(true);
  });

  it("rejects the #110 bug: second-worst claimed as league-worst", () => {
    const claim: Claim = { metric: "allTimeWinPct", subject: "of-mice-and-mendoza", extreme: "worst" };
    expect(verifyClaim(claim, ctx())).toBe(false);
  });

  it("accepts a true best", () => {
    expect(verifyClaim({ metric: "allTimeWinPct", subject: "team-c", extreme: "best" }, ctx())).toBe(true);
  });

  it("rejects an off-by-one rank claim", () => {
    // Foopus is actually rank 2, not rank 1.
    expect(verifyClaim({ metric: "allTimeWinPct", subject: "foopus", rank: 1 }, ctx())).toBe(false);
    expect(verifyClaim({ metric: "allTimeWinPct", subject: "foopus", rank: 2 }, ctx())).toBe(true);
  });

  it("rejects an extreme when there is a tie at that extreme", () => {
    const tied = ctx({
      franchiseHistory: [
        { slug: "a", allTimeWinPct: 0.4, allTimeWinPctRank: 0, championships: 0, playoffAppearances: 0, seasonsPlayed: 5, lastThreeFinishes: [], sustainedDoormat: false, sustainedContender: false },
        { slug: "b", allTimeWinPct: 0.4, allTimeWinPctRank: 0, championships: 0, playoffAppearances: 0, seasonsPlayed: 5, lastThreeFinishes: [], sustainedDoormat: false, sustainedContender: false },
        { slug: "c", allTimeWinPct: 0.6, allTimeWinPctRank: 0, championships: 0, playoffAppearances: 0, seasonsPlayed: 5, lastThreeFinishes: [], sustainedDoormat: false, sustainedContender: false },
      ],
    });
    expect(verifyClaim({ metric: "allTimeWinPct", subject: "a", extreme: "worst" }, tied)).toBe(false);
    expect(verifyClaim({ metric: "allTimeWinPct", subject: "b", extreme: "worst" }, tied)).toBe(false);
  });

  it("rejects an unresolvable subject", () => {
    expect(verifyClaim({ metric: "allTimeWinPct", subject: "nonexistent", extreme: "worst" }, ctx())).toBe(false);
  });

  it("checks a cited value against the subject's actual value", () => {
    expect(verifyClaim({ metric: "allTimeWinPct", subject: "of-mice-and-mendoza", value: 0.414 }, ctx())).toBe(true);
    expect(verifyClaim({ metric: "allTimeWinPct", subject: "of-mice-and-mendoza", value: 0.5 }, ctx())).toBe(false);
    // percent form of the same fraction
    expect(verifyClaim({ metric: "allTimeWinPct", subject: "of-mice-and-mendoza", value: 41.4 }, ctx())).toBe(true);
  });

  it("fails closed when the ranking source is empty", () => {
    expect(verifyClaim({ metric: "allTimeWinPct", subject: "team-c", extreme: "best" }, ctx({ franchiseHistory: [] }))).toBe(false);
  });
});

describe("numberMatches", () => {
  const c = ctx();
  it("matches thousands-comma against a stored plain decimal", () => {
    expect(numberMatches("2,459.9", c)).toBe(true);
    expect(numberMatches("2459.9", c)).toBe(true);
  });
  it("matches a win-rate decimal and its percent form", () => {
    expect(numberMatches("0.414", c)).toBe(true);
    expect(numberMatches("41.4%", c)).toBe(true);
  });
  it("matches an exact record string", () => {
    expect(numberMatches("12-4", c)).toBe(true);
    expect(numberMatches("9-7", c)).toBe(false);
  });
  it("rejects an invented number", () => {
    expect(numberMatches("999.9", c)).toBe(false);
  });
});

describe("extractStatTokens", () => {
  it("includes decimals, comma numbers, percentages, win rates, and records", () => {
    const tokens = extractStatTokens("posted 2,459.9 points on a 12-4 run at a .414 clip, 41.4% overall");
    expect(tokens).toContain("2,459.9");
    expect(tokens).toContain("12-4");
    expect(tokens).toContain(".414");
    expect(tokens).toContain("41.4%");
  });

  it("excludes bare integers 0-31, years, and No. N / ordinals", () => {
    const tokens = extractStatTokens("their 3 titles since 1998 rank No. 2, a 4th straight top finish");
    expect(tokens).not.toContain("3");
    expect(tokens).not.toContain("1998");
    expect(tokens).not.toContain("2");
    expect(tokens).not.toContain("4");
    expect(tokens).toEqual([]);
  });

  it("includes a bare integer outside the exempt ranges", () => {
    expect(extractStatTokens("dropped 45 spots")).toContain("45");
  });
});

describe("findUnverifiedNumbers", () => {
  it("flags a number absent from the context but passes a real one", () => {
    const c = ctx();
    expect(findUnverifiedNumbers("Mendoza's 0.414 clip", c)).toEqual([]);
    expect(findUnverifiedNumbers("Mendoza's 0.501 clip", c)).toEqual(["0.501"]);
  });
});

describe("findSuperlativeMarkers + tripwire", () => {
  it("collects distinct superlative markers", () => {
    const markers = findSuperlativeMarkers("the league-worst and dead last team, also the No. 1 seed");
    expect(markers).toContain("league-worst");
    expect(markers).toContain("dead last");
    expect(markers.some((m) => m.startsWith("no."))).toBe(true);
  });

  it("fails a superlative with zero attached claims", () => {
    const c = ctx();
    const res = verifyClaims("Mendoza owns the league-worst 0.414 win rate.", [], c);
    expect(res.ok).toBe(false);
  });

  it("passes when every marker is backed by a true claim", () => {
    const c = ctx();
    const res = verifyClaims("Bucky owns the league-worst 0.343 win rate.", [
      { metric: "allTimeWinPct", subject: "buckys-general-store", extreme: "worst" },
    ], c);
    expect(res.ok).toBe(true);
  });
});

describe("verifyClaims end-to-end (#110 Doormat Bounce)", () => {
  it("drops the reconstructed false-superlative body", () => {
    const c = ctx();
    const body = "Doormat Bounce: Of Mice and Mendoza escapes the league-worst 0.414 all-time win rate this year.";
    const claims: Claim[] = [{ metric: "allTimeWinPct", subject: "of-mice-and-mendoza", extreme: "worst" }];
    const res = verifyClaims(body, claims, c);
    expect(res.ok).toBe(false);
  });

  it("keeps the same body when the claim is corrected to rank (second-worst)", () => {
    const c = ctx();
    // "second-worst" framed as rank 3 of 4, no bare superlative marker.
    const body = "Of Mice and Mendoza sits at a 0.414 all-time win rate, third-from-top nobody envies.";
    const claims: Claim[] = [{ metric: "allTimeWinPct", subject: "of-mice-and-mendoza", rank: 3 }];
    const res = verifyClaims(body, claims, c);
    expect(res.ok).toBe(true);
  });
});
