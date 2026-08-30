import { describe, it, expect } from "vitest";
import {
  awardsAreGradable,
  buildPlayerMarket,
  buildTeamMarket,
  candidateCountFor,
  FUTURES_MARKET_IDS,
  FUTURES_MARKETS,
  isFuturesMarket,
  regularSeasonWeeksRemaining,
  retainedSubjects,
  candidateScore,
  FIELD_SUBJECT_ID,
  futureResult,
  futuresLockWeek,
  futuresOdds,
  MIN_FUTURES_FAVORITE_ODDS,
  mulberry32,
  PLAYER_MARKETS,
  playoffFieldFrom,
  simulateBracketWinner,
  simulateTeamMarkets,
  softmaxProbabilities,
  TEAM_MARKETS,
  topScorer,
  WEEK_FUTURES_PLAYER_LOCK,
  type FuturesGame,
  type FuturesTeam,
} from "./futures";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A 12-team league where roster 1 is the best and roster 12 the worst, by a
 * clean, monotone projection gradient. Every assertion about "stronger" and
 * "weaker" below reads off this ordering.
 */
function ladderTeams(divisions = true): FuturesTeam[] {
  return Array.from({ length: 12 }, (_, i) => {
    const rosterId = String(i + 1);
    return {
      franchiseId: `f${i + 1}`,
      rosterId,
      wins: 12 - i,
      losses: i,
      ties: 0,
      pointsFor: 1400 - i * 40,
      projectedPerWeek: 130 - i * 4,
      division: divisions ? (i % 3) + 1 : null,
    };
  });
}

/** A round of head-to-head games among all twelve, six pairings. */
function oneWeekOfGames(): FuturesGame[] {
  return [
    { rosterA: "1", rosterB: "12" },
    { rosterA: "2", rosterB: "11" },
    { rosterA: "3", rosterB: "10" },
    { rosterA: "4", rosterB: "9" },
    { rosterA: "5", rosterB: "8" },
    { rosterA: "6", rosterB: "7" },
  ];
}

// ---------------------------------------------------------------------------
// futuresOdds
// ---------------------------------------------------------------------------

describe("futuresOdds", () => {
  it("prices a longshot as a big plus number", () => {
    expect(futuresOdds(0.05)).toBeGreaterThan(1000);
  });

  it("never posts a favorite shorter than the house floor", () => {
    expect(futuresOdds(0.95)).toBe(MIN_FUTURES_FAVORITE_ODDS);
    expect(futuresOdds(0.99)).toBe(MIN_FUTURES_FAVORITE_ODDS);
  });

  it("carries the futures overround, so it is shorter than a fair price", () => {
    // Fair 25% is +300. With the 1.25 overround the book posts less.
    expect(futuresOdds(0.25)).toBeLessThan(300);
    expect(futuresOdds(0.25)).toBeGreaterThan(0);
  });

  it("moves monotonically: a likelier outcome never pays more", () => {
    const probs = [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.7];
    const payouts = probs.map((p) => {
      const odds = futuresOdds(p);
      return odds > 0 ? odds / 100 : 100 / -odds;
    });
    for (let i = 1; i < payouts.length; i++) {
      expect(payouts[i]).toBeLessThanOrEqual(payouts[i - 1]);
    }
  });

  it("rounds onto the same 5-point grid as the weekly board", () => {
    for (const p of [0.07, 0.13, 0.28, 0.44, 0.61]) {
      expect(Math.abs(futuresOdds(p) % 5)).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// mulberry32
// ---------------------------------------------------------------------------

describe("mulberry32", () => {
  it("is deterministic for a seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("differs across seeds and stays in [0, 1)", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

// ---------------------------------------------------------------------------
// playoffFieldFrom
// ---------------------------------------------------------------------------

describe("playoffFieldFrom", () => {
  const ranked = Array.from({ length: 12 }, (_, i) => ({
    rosterId: String(i + 1),
    wins: 12 - i,
    points: 1400 - i * 10,
  }));

  it("takes the top N when the season has no divisions", () => {
    const divisions = new Map<string, number | null>(
      ranked.map((t) => [t.rosterId, null]),
    );
    expect(playoffFieldFrom(ranked, divisions, 6)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
  });

  it("auto-qualifies each division winner even on a losing record", () => {
    // Rosters 1-4 share division 1, so 2, 3 and 4 are all better than the
    // winners of divisions 2 and 3 (rosters 5 and 9) but do not auto-qualify.
    const divisions = new Map<string, number | null>([
      ["1", 1], ["2", 1], ["3", 1], ["4", 1],
      ["5", 2], ["6", 2], ["7", 2], ["8", 2],
      ["9", 3], ["10", 3], ["11", 3], ["12", 3],
    ]);
    const field = playoffFieldFrom(ranked, divisions, 6);

    // Division winners take the top three seeds, in their own record order.
    expect(field.slice(0, 3)).toEqual(["1", "5", "9"]);
    // Then the best remaining records, wherever they came from.
    expect(field.slice(3)).toEqual(["2", "3", "4"]);
    // Roster 9 is in despite four teams having better records than it.
    expect(field).toContain("9");
  });

  it("never returns more teams than there are berths", () => {
    const divisions = new Map<string, number | null>(
      ranked.map((t, i) => [t.rosterId, (i % 3) + 1]),
    );
    expect(playoffFieldFrom(ranked, divisions, 6)).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// simulateBracketWinner
// ---------------------------------------------------------------------------

describe("simulateBracketWinner", () => {
  const proj = new Map<string, number>([
    ["1", 150],
    ["2", 140],
    ["3", 120],
    ["4", 118],
    ["5", 100],
    ["6", 95],
  ]);

  function winShare(
    field: string[],
    target: string,
    invert = false,
    runs = 4000,
  ): number {
    const rng = mulberry32(99);
    let hits = 0;
    for (let i = 0; i < runs; i++) {
      if (simulateBracketWinner(field, proj, rng, { invert }) === target) hits++;
    }
    return hits / runs;
  }

  it("returns null on an empty field and the lone team on a field of one", () => {
    expect(simulateBracketWinner([], proj, mulberry32(1))).toBeNull();
    expect(simulateBracketWinner(["3"], proj, mulberry32(1))).toBe("3");
  });

  it("always returns somebody who was in the field", () => {
    const field = ["1", "2", "3", "4", "5", "6"];
    const rng = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      expect(field).toContain(simulateBracketWinner(field, proj, rng));
    }
  });

  it("gives the top seed a bye, so it wins a 6-team bracket most often", () => {
    const field = ["1", "2", "3", "4", "5", "6"];
    const top = winShare(field, "1");
    const bottom = winShare(field, "6");
    expect(top).toBeGreaterThan(bottom);
    // Two rounds instead of three, against the best projection in the field.
    expect(top).toBeGreaterThan(0.3);
  });

  it("handles a power-of-two field with no byes at all", () => {
    const field = ["1", "2", "3", "4"];
    const shares = field.map((t) => winShare(field, t, false, 2000));
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2);
    expect(shares[0]).toBeGreaterThan(shares[3]);
  });

  it("INVERTS for the toilet bowl: the stronger team is likelier to escape", () => {
    // Seeded worst-first, the way the consolation bracket runs: roster 6 is the
    // worst team here and gets the bye.
    const field = ["6", "5", "4", "3"];
    const worst = winShare(field, "6", true, 4000);
    const best = winShare(field, "3", true, 4000);

    expect(worst).toBeGreaterThan(best);
    // The mirror is the whole point: without it, the strongest projection in
    // the consolation field would be the favorite to "win" the toilet bowl.
    const uninvertedBest = winShare(field, "3", false, 4000);
    expect(uninvertedBest).toBeGreaterThan(best);
  });
});

// ---------------------------------------------------------------------------
// simulateTeamMarkets
// ---------------------------------------------------------------------------

describe("simulateTeamMarkets", () => {
  const options = { playoffSpots: 6, simulations: 1500, seed: 1234 };

  it("produces two proper distributions that each sum to 1", () => {
    const result = simulateTeamMarkets(ladderTeams(), oneWeekOfGames(), options);

    const sum = (m: Map<string, number>) =>
      [...m.values()].reduce((a, b) => a + b, 0);

    expect(sum(result.champion)).toBeCloseTo(1, 6);
    expect(sum(result.toiletBowl)).toBeCloseTo(1, 6);
    expect(result.champion.size).toBe(12);
  });

  it("is deterministic: the same inputs price identically twice", () => {
    const a = simulateTeamMarkets(ladderTeams(), oneWeekOfGames(), options);
    const b = simulateTeamMarkets(ladderTeams(), oneWeekOfGames(), options);
    expect([...a.champion.entries()]).toEqual([...b.champion.entries()]);
    expect([...a.toiletBowl.entries()]).toEqual([...b.toiletBowl.entries()]);
  });

  it("makes the best team the title favorite and the worst team a longshot", () => {
    const { champion } = simulateTeamMarkets(
      ladderTeams(),
      oneWeekOfGames(),
      options,
    );
    expect(champion.get("1")!).toBeGreaterThan(champion.get("12")!);
    expect(champion.get("1")!).toBeGreaterThan(1 / 12);
  });

  it("ACCEPTANCE: a stronger projected team gets LONGER toilet bowl odds", () => {
    const { toiletBowl } = simulateTeamMarkets(
      ladderTeams(),
      oneWeekOfGames(),
      options,
    );

    // The league's worst team is the one most likely to bottom out.
    expect(toiletBowl.get("12")!).toBeGreaterThan(toiletBowl.get("7")!);
    // And a playoff-caliber team is essentially never in that bracket at all.
    expect(toiletBowl.get("1")!).toBeLessThan(toiletBowl.get("12")!);

    // Stated as the acceptance criterion states it: in posted odds, stronger
    // means a longer (bigger plus, or less negative) price.
    const payout = (p: number) => {
      const odds = futuresOdds(p);
      return odds > 0 ? odds / 100 : 100 / -odds;
    };
    expect(payout(toiletBowl.get("2")!)).toBeGreaterThan(
      payout(toiletBowl.get("12")!),
    );
  });

  it("keeps the two ends of the season apart: the champion is never the toilet bowl favorite", () => {
    const { champion, toiletBowl } = simulateTeamMarkets(
      ladderTeams(),
      oneWeekOfGames(),
      options,
    );
    const champFavorite = [...champion.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const toiletFavorite = [...toiletBowl.entries()].sort((a, b) => b[1] - a[1])[0][0];
    expect(champFavorite).not.toBe(toiletFavorite);
  });

  it("respects division auto-qualification in the playoff odds", () => {
    // Division 3 holds rosters 3, 6, 9, 12 here, so its winner is roster 3.
    const teams = ladderTeams();
    const { playoffs } = simulateTeamMarkets(teams, oneWeekOfGames(), options);
    // The top team in each division is guaranteed a berth in every sim where it
    // stays on top; the ladder makes that near-certain.
    expect(playoffs.get("1")!).toBeGreaterThan(0.9);
    expect(playoffs.get("12")!).toBeLessThan(0.2);
  });

  it("handles an empty league and a season with nothing left to play", () => {
    expect(simulateTeamMarkets([], [], options).champion.size).toBe(0);

    const finished = simulateTeamMarkets(ladderTeams(), [], options);
    expect([...finished.champion.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(
      1,
      6,
    );
  });
});

// ---------------------------------------------------------------------------
// Player markets
// ---------------------------------------------------------------------------

describe("softmaxProbabilities", () => {
  it("sums to 1 and ranks with the scores", () => {
    const probs = softmaxProbabilities([200, 170, 140], 30);
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(probs[0]).toBeGreaterThan(probs[1]);
    expect(probs[1]).toBeGreaterThan(probs[2]);
  });

  it("splits evenly when every candidate is level", () => {
    const probs = softmaxProbabilities([100, 100, 100, 100], 30);
    for (const p of probs) expect(p).toBeCloseTo(0.25, 10);
  });

  it("does not overflow on large scores", () => {
    const probs = softmaxProbabilities([100000, 99000, 98000], 30);
    expect(probs.every((p) => Number.isFinite(p))).toBe(true);
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("returns nothing for an empty pool", () => {
    expect(softmaxProbabilities([], 30)).toEqual([]);
  });
});

describe("candidateScore", () => {
  it("credits rest-of-season pace only to a current starter", () => {
    expect(candidateScore(120, 18, 6, true)).toBe(120 + 108);
    expect(candidateScore(120, 18, 6, false)).toBe(120);
  });

  it("is just banked points once the regular season is done", () => {
    expect(candidateScore(240, 20, 0, true)).toBe(240);
    expect(candidateScore(240, 20, -3, true)).toBe(240);
  });
});

describe("buildPlayerMarket", () => {
  const pool = Array.from({ length: 25 }, (_, i) => ({
    playerId: `p${String(i).padStart(2, "0")}`,
    score: 250 - i * 12,
  }));

  it("lists the top N and aggregates everybody else into The Field", () => {
    const rows = buildPlayerMarket(pool, 10);
    expect(rows).toHaveLength(11);
    expect(rows.slice(0, 10).every((r) => r.subjectType === "player")).toBe(true);

    const field = rows[rows.length - 1];
    expect(field.subjectId).toBe(FIELD_SUBJECT_ID);
    expect(field.subjectType).toBe("field");
  });

  it("gives The Field the real unlisted mass, not a leftover", () => {
    const rows = buildPlayerMarket(pool, 10);
    const total = rows.reduce((sum, r) => sum + r.prob, 0);
    // Listed probabilities plus the field are the whole pool, exactly.
    expect(total).toBeCloseTo(1, 10);

    // And it is a softmax over the WHOLE pool: trimming first would have
    // renormalized the listed ten to 1 and left the field at zero.
    expect(rows[rows.length - 1].prob).toBeGreaterThan(0);
  });

  it("posts no field row when nobody is unlisted", () => {
    const rows = buildPlayerMarket(pool.slice(0, 6), 10);
    expect(rows).toHaveLength(6);
    expect(rows.some((r) => r.subjectId === FIELD_SUBJECT_ID)).toBe(false);
  });

  it("orders by probability and prices every row", () => {
    const rows = buildPlayerMarket(pool, 5);
    const listed = rows.filter((r) => r.subjectType === "player");
    for (let i = 1; i < listed.length; i++) {
      expect(listed[i].prob).toBeLessThanOrEqual(listed[i - 1].prob);
    }
    expect(rows.every((r) => Number.isInteger(r.odds))).toBe(true);
  });

  it("is stable under a tie, so a reprice does not reshuffle the board", () => {
    const tied = [
      { playerId: "pB", score: 100 },
      { playerId: "pA", score: 100 },
      { playerId: "pC", score: 100 },
    ];
    expect(buildPlayerMarket(tied, 3).map((r) => r.subjectId)).toEqual([
      "pA",
      "pB",
      "pC",
    ]);
  });

  it("returns nothing for an empty pool", () => {
    expect(buildPlayerMarket([], 10)).toEqual([]);
  });

  it("keeps a candidate somebody bet on, even once he falls off the board", () => {
    const fallen = "p20";
    const plain = buildPlayerMarket(pool, 10);
    expect(plain.some((r) => r.subjectId === fallen)).toBe(false);

    const rows = buildPlayerMarket(pool, 10, undefined, [fallen]);
    const kept = rows.find((r) => r.subjectId === fallen);
    expect(kept).toBeDefined();
    expect(kept?.subjectType).toBe("player");
    // Priced at his real probability, not resurrected at a made-up number.
    expect(kept?.prob).toBeCloseTo(
      buildPlayerMarket(pool, 25).find((r) => r.subjectId === fallen)?.prob ?? -1,
      12,
    );
  });

  it("takes a kept candidate's mass OUT of The Field, so nothing is counted twice", () => {
    const rows = buildPlayerMarket(pool, 10, undefined, ["p20"]);
    const total = rows.reduce((sum, r) => sum + r.prob, 0);
    expect(total).toBeCloseTo(1, 10);

    const field = rows.find((r) => r.subjectId === FIELD_SUBJECT_ID);
    const plainField = buildPlayerMarket(pool, 10).find(
      (r) => r.subjectId === FIELD_SUBJECT_ID,
    );
    expect(field?.prob).toBeLessThan(plainField?.prob ?? 0);
  });

  it("does not duplicate a kept candidate who is already listed", () => {
    const rows = buildPlayerMarket(pool, 10, undefined, ["p00", "p01"]);
    expect(rows.filter((r) => r.subjectId === "p00")).toHaveLength(1);
    expect(rows).toHaveLength(11);
  });
});

// ---------------------------------------------------------------------------
// buildTeamMarket
// ---------------------------------------------------------------------------

describe("buildTeamMarket", () => {
  const franchiseByRoster = new Map([
    ["1", "f1"],
    ["2", "f2"],
    ["3", "f3"],
  ]);

  it("posts every franchise, translated out of roster ids, best price first", () => {
    const probs = new Map([
      ["2", 0.2],
      ["1", 0.5],
      ["3", 0.3],
    ]);
    const rows = buildTeamMarket(probs, franchiseByRoster);
    expect(rows.map((r) => r.subjectId)).toEqual(["f1", "f3", "f2"]);
    expect(rows.every((r) => r.subjectType === "franchise")).toBe(true);
    expect(rows.every((r) => Number.isInteger(r.odds))).toBe(true);
  });

  it("keeps a team the simulation never saw win, at the board's dog price", () => {
    const probs = new Map([
      ["1", 0.9],
      ["2", 0.1],
      ["3", 0],
    ]);
    const rows = buildTeamMarket(probs, franchiseByRoster);
    const hopeless = rows.find((r) => r.subjectId === "f3");
    expect(hopeless).toBeDefined();
    expect(hopeless?.odds).toBeGreaterThan(0);
  });

  it("drops a roster with no franchise rather than posting a nameless row", () => {
    const probs = new Map([
      ["1", 0.5],
      ["99", 0.5],
    ]);
    const rows = buildTeamMarket(probs, franchiseByRoster);
    expect(rows.map((r) => r.subjectId)).toEqual(["f1"]);
  });

  it("is stable under a tie, so a reprice that moved nothing reorders nothing", () => {
    const probs = new Map([
      ["3", 0.25],
      ["1", 0.25],
      ["2", 0.25],
    ]);
    expect(
      buildTeamMarket(probs, franchiseByRoster).map((r) => r.subjectId),
    ).toEqual(["f1", "f2", "f3"]);
  });
});

describe("candidateCountFor", () => {
  it("lists fewer rookies than MVPs", () => {
    expect(candidateCountFor("roty")).toBeLessThan(candidateCountFor("mvp"));
  });
});

// ---------------------------------------------------------------------------
// Locks
// ---------------------------------------------------------------------------

describe("futuresLockWeek", () => {
  it("locks team markets at the first playoff week", () => {
    expect(futuresLockWeek("champion", 15)).toBe(15);
    expect(futuresLockWeek("toilet_bowl", 15)).toBe(15);
  });

  it("locks player markets at the documented midpoint", () => {
    expect(futuresLockWeek("mvp", 15)).toBe(WEEK_FUTURES_PLAYER_LOCK);
    expect(futuresLockWeek("roty", 15)).toBe(WEEK_FUTURES_PLAYER_LOCK);
  });

  it("falls back to the player lock when a season has no playoff week set", () => {
    expect(futuresLockWeek("champion", null)).toBe(WEEK_FUTURES_PLAYER_LOCK);
  });
});

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

describe("topScorer", () => {
  it("takes the most points started", () => {
    expect(
      topScorer([
        { subjectId: "a", points: 210.4, weeksStarted: 13 },
        { subjectId: "b", points: 288.1, weeksStarted: 14 },
        { subjectId: "c", points: 240.0, weeksStarted: 14 },
      ]),
    ).toBe("b");
  });

  it("breaks a points tie on the higher per-started-week average", () => {
    expect(
      topScorer([
        { subjectId: "a", points: 200, weeksStarted: 14 },
        { subjectId: "b", points: 200, weeksStarted: 10 },
      ]),
    ).toBe("b");
  });

  it("breaks a points-and-average tie on fewer weeks started", () => {
    // Identical averages (both 0 starts) leave only the weeks-started rule.
    expect(
      topScorer([
        { subjectId: "a", points: 0, weeksStarted: 5 },
        { subjectId: "b", points: 0, weeksStarted: 2 },
      ]),
    ).toBe("b");
  });

  it("is never ambiguous: identical rows fall back to player id", () => {
    expect(
      topScorer([
        { subjectId: "z", points: 100, weeksStarted: 10 },
        { subjectId: "a", points: 100, weeksStarted: 10 },
      ]),
    ).toBe("a");
  });

  it("returns null when nobody scored a point in a start", () => {
    expect(topScorer([])).toBeNull();
  });
});

describe("futureResult", () => {
  const listed = ["p1", "p2", "p3"];

  it("pays the row that named the winner", () => {
    expect(futureResult({ subjectId: "p2" }, "p2", listed)).toBe("win");
    expect(futureResult({ subjectId: "p1" }, "p2", listed)).toBe("loss");
  });

  it("pays The Field when the award goes to somebody unlisted", () => {
    expect(futureResult({ subjectId: FIELD_SUBJECT_ID }, "p9", listed)).toBe(
      "win",
    );
  });

  it("does NOT pay The Field when a listed candidate wins", () => {
    expect(futureResult({ subjectId: FIELD_SUBJECT_ID }, "p3", listed)).toBe(
      "loss",
    );
  });

  it("grades everything a loss when there is no winner to grade against", () => {
    expect(futureResult({ subjectId: "p1" }, null, listed)).toBe("loss");
    expect(futureResult({ subjectId: FIELD_SUBJECT_ID }, null, listed)).toBe(
      "loss",
    );
  });

  it("grades team markets by franchise id the same way", () => {
    expect(futureResult({ subjectId: "f4" }, "f4", [])).toBe("win");
    expect(futureResult({ subjectId: "f4" }, "f7", [])).toBe("loss");
  });
});

// ---------------------------------------------------------------------------
// The market registry
// ---------------------------------------------------------------------------

describe("the market registry", () => {
  it("lists every market once, in board order", () => {
    expect(FUTURES_MARKET_IDS).toEqual(["champion", "toilet_bowl", "mvp", "roty"]);
    expect(new Set(FUTURES_MARKET_IDS).size).toBe(FUTURES_MARKET_IDS.length);
  });

  it("splits the same list into the team and player halves", () => {
    expect(TEAM_MARKETS).toEqual(["champion", "toilet_bowl"]);
    expect(PLAYER_MARKETS).toEqual(["mvp", "roty"]);
    expect([...TEAM_MARKETS, ...PLAYER_MARKETS].sort()).toEqual(
      [...FUTURES_MARKET_IDS].sort(),
    );
  });

  it("drives the lock rules and the listed counts, rather than restating them", () => {
    for (const id of FUTURES_MARKET_IDS) {
      const spec = FUTURES_MARKETS[id];
      const expected =
        spec.lock === "playoffs" ? 15 : WEEK_FUTURES_PLAYER_LOCK;
      expect(futuresLockWeek(id, 15)).toBe(expected);
      expect(candidateCountFor(id)).toBe(spec.listCount ?? 0);
    }
  });

  it("accepts only the markets it runs", () => {
    expect(isFuturesMarket("mvp")).toBe(true);
    expect(isFuturesMarket("toilet_bowl")).toBe(true);
    expect(isFuturesMarket("mvp2")).toBe(false);
    expect(isFuturesMarket("")).toBe(false);
    expect(isFuturesMarket(7)).toBe(false);
    // Not a market just because Object.prototype has heard of it.
    expect(isFuturesMarket("toString")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Season arithmetic
// ---------------------------------------------------------------------------

describe("regularSeasonWeeksRemaining", () => {
  it("does not count the week in progress twice", () => {
    // Week 5 is under way: its started points are already banked, so five
    // weeks have banked and nine are left. Counting COMPLETED weeks (four)
    // would say ten, handing every starter an extra projected week he has
    // already played.
    expect(regularSeasonWeeksRemaining(14, 5)).toBe(9);
    expect(regularSeasonWeeksRemaining(14, 5)).not.toBe(
      regularSeasonWeeksRemaining(14, 4),
    );
  });

  it("is zero once the regular season has banked every week", () => {
    expect(regularSeasonWeeksRemaining(14, 14)).toBe(0);
  });

  it("never goes negative on a season with extra banked weeks", () => {
    expect(regularSeasonWeeksRemaining(14, 17)).toBe(0);
  });

  it("is the whole season before anybody has played", () => {
    expect(regularSeasonWeeksRemaining(14, 0)).toBe(14);
  });
});

describe("awardsAreGradable", () => {
  it("refuses to settle a player award mid-season", () => {
    expect(awardsAreGradable(1, 14)).toBe(false);
    expect(awardsAreGradable(13, 14)).toBe(false);
  });

  it("settles once every regular-season week is in the books", () => {
    expect(awardsAreGradable(14, 14)).toBe(true);
    expect(awardsAreGradable(15, 14)).toBe(true);
  });

  it("refuses a season with no regular season to speak of", () => {
    expect(awardsAreGradable(0, 0)).toBe(false);
  });
});

describe("retainedSubjects", () => {
  it("keeps a held subject that no longer prices", () => {
    // The MVP who slid off the board in week 9. His row is where his ticket
    // gets graded, so deleting it would strand the bet.
    expect(retainedSubjects(["p1", "p2"], ["p9"])).toContain("p9");
  });

  it("keeps The Field when somebody is on it and it stops pricing", () => {
    expect(retainedSubjects(["p1"], [FIELD_SUBJECT_ID])).toContain(
      FIELD_SUBJECT_ID,
    );
  });

  it("never lists a subject twice", () => {
    const kept = retainedSubjects(["p1", "p2"], ["p1"]);
    expect(kept).toHaveLength(2);
    expect(new Set(kept).size).toBe(2);
  });

  it("is just the priced board when nobody has bet anything", () => {
    expect(retainedSubjects(["p1", "p2"], [])).toEqual(["p1", "p2"]);
  });
});
