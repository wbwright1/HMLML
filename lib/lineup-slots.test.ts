import { describe, it, expect } from "vitest";
import {
  deriveStartingSlots,
  alignStarterSlots,
  computeProjectedPoints,
} from "./lineup-slots";

const ROSTER_POSITIONS = [
  "QB",
  "RB",
  "RB",
  "WR",
  "WR",
  "TE",
  "FLEX",
  "SUPER_FLEX",
  "K",
  "DEF",
  "BN",
  "BN",
  "BN",
  "IR",
];

describe("deriveStartingSlots", () => {
  it("drops bench, IR, and taxi slots", () => {
    expect(deriveStartingSlots(ROSTER_POSITIONS)).toEqual([
      "QB",
      "RB",
      "RB",
      "WR",
      "WR",
      "TE",
      "FLEX",
      "SUPER_FLEX",
      "K",
      "DEF",
    ]);
  });

  it("handles null/undefined defensively", () => {
    expect(deriveStartingSlots(null)).toEqual([]);
    expect(deriveStartingSlots(undefined)).toEqual([]);
  });
});

describe("alignStarterSlots", () => {
  it("aligns starters to slot labels in order, preserving duplicates", () => {
    const starters = [
      "qb1",
      "rb1",
      "rb2",
      "wr1",
      "wr2",
      "te1",
      "flex1",
      "sf1",
      "k1",
      "def1",
    ];
    expect(alignStarterSlots(ROSTER_POSITIONS, starters)).toEqual([
      { playerId: "qb1", slot: "QB" },
      { playerId: "rb1", slot: "RB" },
      { playerId: "rb2", slot: "RB" },
      { playerId: "wr1", slot: "WR" },
      { playerId: "wr2", slot: "WR" },
      { playerId: "te1", slot: "TE" },
      { playerId: "flex1", slot: "FLEX" },
      { playerId: "sf1", slot: "SUPER_FLEX" },
      { playerId: "k1", slot: "K" },
      { playerId: "def1", slot: "DEF" },
    ]);
  });

  it("skips empty '0' slots but keeps later alignment intact", () => {
    const starters = ["qb1", "0", "rb2", "wr1"];
    // index 1 is empty, so rb2 (index 2) must still map to slot RB (index 2)
    expect(alignStarterSlots(ROSTER_POSITIONS, starters)).toEqual([
      { playerId: "qb1", slot: "QB" },
      { playerId: "rb2", slot: "RB" },
      { playerId: "wr1", slot: "WR" },
    ]);
  });

  it("falls back to FLEX when starters overflow the derived slots", () => {
    const starters = ["qb1", "extra"];
    expect(alignStarterSlots(["QB", "BN"], starters)).toEqual([
      { playerId: "qb1", slot: "QB" },
      { playerId: "extra", slot: "FLEX" },
    ]);
  });

  it("returns [] for empty or null starters", () => {
    expect(alignStarterSlots(ROSTER_POSITIONS, null)).toEqual([]);
    expect(alignStarterSlots(ROSTER_POSITIONS, [])).toEqual([]);
  });

  it("maps each starter to its positional slot when starters run shorter than the slot list", () => {
    // ["QB","RB","WR"] starting slots, but only two starters provided: each
    // aligns to its index slot and the trailing slot is simply left unfilled.
    const starters = ["qb1", "rb1"];
    expect(alignStarterSlots(["QB", "RB", "WR", "BN"], starters)).toEqual([
      { playerId: "qb1", slot: "QB" },
      { playerId: "rb1", slot: "RB" },
    ]);
  });
});

describe("computeProjectedPoints", () => {
  const scoring = {
    pass_yd: 0.04,
    pass_td: 4,
    rush_yd: 0.1,
    rush_td: 6,
    rec: 1,
    rec_yd: 0.1,
  };

  it("dot-products scoring settings with projection stats", () => {
    const proj = {
      pass_yd: 300, // 12
      pass_td: 2, // 8
      rush_yd: 20, // 2
      rec: 0, // 0
      pts_ppr: 999, // ignored (aggregate)
    };
    // 12 + 8 + 2 = 22
    expect(computeProjectedPoints(scoring, proj)).toBe(22);
  });

  it("ignores aggregate pts_* keys even if present in scoring", () => {
    const proj = { pass_yd: 100, pts_ppr: 50 };
    // only pass_yd contributes: 100 * 0.04 = 4
    expect(computeProjectedPoints({ ...scoring, pts_ppr: 1 }, proj)).toBe(4);
  });

  it("falls back to pts_ppr for full-PPR leagues when no stat overlaps", () => {
    const proj = { pts_ppr: 15.4, pts_half_ppr: 13.2, pts_std: 11 };
    expect(computeProjectedPoints({ rec: 1 }, proj)).toBe(15.4);
  });

  it("falls back to pts_half_ppr for half-PPR leagues", () => {
    const proj = { pts_ppr: 15.4, pts_half_ppr: 13.2, pts_std: 11 };
    expect(computeProjectedPoints({ rec: 0.5 }, proj)).toBe(13.2);
  });

  it("falls back to pts_std for standard leagues", () => {
    const proj = { pts_ppr: 15.4, pts_half_ppr: 13.2, pts_std: 11 };
    expect(computeProjectedPoints({ rec: 0 }, proj)).toBe(11);
  });

  it("returns null when projection is missing entirely", () => {
    expect(computeProjectedPoints(scoring, null)).toBeNull();
    expect(computeProjectedPoints(scoring, undefined)).toBeNull();
  });

  it("returns null when only non-scoring meta stats exist", () => {
    // adp is not a scoring stat and no pts_* total to fall back to
    expect(computeProjectedPoints({ rec: 1 }, { adp_dd_ppr: 1000 })).toBeNull();
  });

  it("scores a season-projection stat map by league weights, diverging from raw pts_ppr", () => {
    // Simulates a raw season-projection row: full stat line plus Sleeper's
    // full-PPR aggregate. A half-PPR league (rec = 0.5) must score the raw
    // reception count itself, yielding a total below the pts_ppr aggregate.
    const seasonProjStats = {
      rec: 80, // 80 * 0.5 = 40 under half-PPR (vs 80 under full PPR)
      rec_yd: 1000, // 1000 * 0.1 = 100
      rec_td: 8, // 8 * 6 = 48
      pts_ppr: 268, // full-PPR aggregate Sleeper ships; must be ignored
    };
    const halfPprScoring = { rec: 0.5, rec_yd: 0.1, rec_td: 6 };
    // 40 + 100 + 48 = 188, which is NOT the raw pts_ppr (268).
    const result = computeProjectedPoints(halfPprScoring, seasonProjStats);
    expect(result).toBe(188);
    expect(result).not.toBe(seasonProjStats.pts_ppr);
  });
});
