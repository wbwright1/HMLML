import { describe, it, expect } from "vitest";
import { bestPossibleLineup, type RosterPlayerPoints } from "./lineup-efficiency";

// This league's roster_positions (no DEF/K), mirroring the real season
// settings shape: fixed slots, one FLEX, one bench slot.
const STANDARD_POSITIONS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "BN", "BN"];
const SUPER_FLEX_POSITIONS = ["QB", "QB", "RB", "WR", "TE", "SUPER_FLEX", "FLEX", "BN"];

function p(playerId: string, position: string, points: number): RosterPlayerPoints {
  return { playerId, position, points };
}

describe("bestPossibleLineup", () => {
  it("fills a standard lineup with the highest scorer at each fixed slot", () => {
    const roster = [
      p("qb1", "QB", 20),
      p("rb1", "RB", 15),
      p("rb2", "RB", 10),
      p("wr1", "WR", 18),
      p("wr2", "WR", 12),
      p("te1", "TE", 8),
      // Bench filler, should not count.
      p("wr3", "WR", 30),
    ];

    // QB(20) + RB(15) + RB(10) + WR(18) + WR(12) + TE(8) + FLEX(best remaining WR = 30)
    const total = bestPossibleLineup(STANDARD_POSITIONS, roster);
    expect(total).toBeCloseTo(20 + 15 + 10 + 18 + 12 + 8 + 30, 5);
  });

  it("resolves FLEX contention by giving fixed slots priority, FLEX getting the leftover", () => {
    // Two elite WRs and one elite RB: fixed WR/WR slots should take the two
    // best WRs, fixed RB/RB slots take the two best RBs, and FLEX should go
    // to whichever remaining RB/WR/TE scores highest.
    const roster = [
      p("qb1", "QB", 10),
      p("rb1", "RB", 25),
      p("rb2", "RB", 20),
      p("rb3", "RB", 19), // best remaining RB/WR/TE candidate for FLEX
      p("wr1", "WR", 24),
      p("wr2", "WR", 22),
      p("te1", "TE", 5),
    ];

    const total = bestPossibleLineup(STANDARD_POSITIONS, roster);
    // QB(10) + RB(25) + RB(20) + WR(24) + WR(22) + TE(5) + FLEX(rb3=19)
    expect(total).toBeCloseTo(10 + 25 + 20 + 24 + 22 + 5 + 19, 5);
  });

  it("fills SUPER_FLEX from any startable position, after fixed and FLEX slots", () => {
    const roster = [
      p("qb1", "QB", 30),
      p("qb2", "QB", 28), // extra QB should be eligible for SUPER_FLEX
      p("rb1", "RB", 15),
      p("wr1", "WR", 14),
      p("te1", "TE", 10),
      p("rb2", "RB", 12), // best remaining for FLEX
    ];

    const total = bestPossibleLineup(SUPER_FLEX_POSITIONS, roster);
    // QB(30) + QB(28, fills second QB slot via layout order? no: layout has
    // one QB, one RB, one WR, one TE, one SUPER_FLEX, one FLEX)
    // Fixed: QB=30, RB=15, WR=14, TE=10
    // Remaining pool: qb2(28), rb2(12)
    // SUPER_FLEX (widest eligibility after FLEX) should still get evaluated
    // in ascending eligible-set-size order: FLEX (RB/WR/TE, size 3) before
    // SUPER_FLEX (QB/RB/WR/TE, size 4). FLEX takes best of remaining RB/WR/TE
    // (rb2=12); SUPER_FLEX takes best of remaining any position (qb2=28).
    expect(total).toBeCloseTo(30 + 15 + 14 + 10 + 12 + 28, 5);
  });

  it("handles the real league roster shape (two FLEX + one SUPER_FLEX)", () => {
    // The actual HMLML starting lineup: QB, two RB, two WR, TE, two FLEX,
    // one SUPER_FLEX. Verify the greedy solver fills fixed slots first, then
    // both FLEX (RB/WR/TE), then SUPER_FLEX (any of QB/RB/WR/TE) with the
    // best remaining scorers.
    const REAL_POSITIONS = [
      "QB",
      "RB",
      "RB",
      "WR",
      "WR",
      "TE",
      "FLEX",
      "FLEX",
      "SUPER_FLEX",
      "BN",
      "BN",
      "BN",
    ];
    const roster = [
      p("qb1", "QB", 28),
      p("qb2", "QB", 24), // second-best any-position, should land in SUPER_FLEX
      p("rb1", "RB", 22),
      p("rb2", "RB", 18),
      p("rb3", "RB", 16), // FLEX candidate
      p("wr1", "WR", 21),
      p("wr2", "WR", 19),
      p("wr3", "WR", 17), // FLEX candidate
      p("te1", "TE", 12),
      p("te2", "TE", 5), // bench filler, lowest, unused
    ];

    // Fixed: QB(28) + RB(22) + RB(18) + WR(21) + WR(19) + TE(12) = 120
    // Remaining pool after fixed: qb2(24), rb3(16), wr3(17), te2(5)
    // Two FLEX (RB/WR/TE) take the two best of {rb3,wr3,te2} = wr3(17)+rb3(16)
    // SUPER_FLEX (any) takes best remaining = qb2(24)
    // Total = 120 + 17 + 16 + 24 = 177
    const total = bestPossibleLineup(REAL_POSITIONS, roster);
    expect(total).toBeCloseTo(177, 5);
  });

  it("returns 0 for an empty roster", () => {
    expect(bestPossibleLineup(STANDARD_POSITIONS, [])).toBe(0);
  });

  it("returns 0 when roster_positions is null or undefined", () => {
    expect(bestPossibleLineup(null, [p("qb1", "QB", 20)])).toBe(0);
    expect(bestPossibleLineup(undefined, [p("qb1", "QB", 20)])).toBe(0);
  });

  it("handles a short roster by leaving unfillable slots empty", () => {
    // Only a QB and one RB available; RB2, WR, WR, TE, FLEX slots go unfilled.
    const roster = [p("qb1", "QB", 20), p("rb1", "RB", 10)];
    const total = bestPossibleLineup(STANDARD_POSITIONS, roster);
    expect(total).toBeCloseTo(30, 5);
  });

  it("ignores non-startable slots (BN, IR, TAXI) when deriving starting slots", () => {
    const positionsWithIrTaxi = ["QB", "BN", "IR", "TAXI"];
    const roster = [p("qb1", "QB", 20), p("qb2", "QB", 15)];
    // Only one startable slot (QB); best QB (20) should be chosen, and the
    // second QB should not leak into a bench/IR/taxi "slot".
    const total = bestPossibleLineup(positionsWithIrTaxi, roster);
    expect(total).toBe(20);
  });

  it("computes gap = optimal - actual for an under-optimized actual lineup", () => {
    const roster = [
      p("qb1", "QB", 20),
      p("rb1", "RB", 15),
      p("rb2", "RB", 10),
      p("wr1", "WR", 18),
      p("wr2", "WR", 12),
      p("te1", "TE", 8),
      p("wr3", "WR", 30), // should have started over a lower scorer
    ];
    const optimal = bestPossibleLineup(STANDARD_POSITIONS, roster);

    // Simulate an actual (suboptimal) started lineup that benched wr3.
    const actualStarted = [
      p("qb1", "QB", 20),
      p("rb1", "RB", 15),
      p("rb2", "RB", 10),
      p("wr1", "WR", 18),
      p("wr2", "WR", 12),
      p("te1", "TE", 8),
      p("wr2b", "WR", 4), // weaker FLEX choice actually started
    ];
    const actual = actualStarted.reduce((sum, r) => sum + r.points, 0);
    const gap = optimal - actual;

    expect(optimal).toBeCloseTo(20 + 15 + 10 + 18 + 12 + 8 + 30, 5);
    expect(gap).toBeCloseTo(30 - 4, 5);
  });

  it("works identically over a season-projection pool (roster-projections.ts reuses the same solver)", () => {
    // Projected-points pool shaped exactly like getRosterProjections builds it:
    // { playerId, position, points: projPointsPpr }.
    const projectionPool = [
      p("qb1", "QB", 361.5), // e.g. Josh Allen's 2026 season projection
      p("rb1", "RB", 210.0),
      p("rb2", "RB", 180.0),
      p("wr1", "WR", 240.0),
      p("wr2", "WR", 190.0),
      p("te1", "TE", 120.0),
      p("rb3", "RB", 150.0), // best remaining RB/WR/TE, should land in FLEX
    ];
    const optimal = bestPossibleLineup(STANDARD_POSITIONS, projectionPool);
    expect(optimal).toBeCloseTo(361.5 + 210 + 180 + 240 + 190 + 120 + 150, 5);
  });
});
