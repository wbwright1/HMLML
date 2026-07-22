import { describe, it, expect } from "vitest";
import { buildProjectionPools, type ProjectionPoolRow } from "./roster-projections";

function row(
  franchiseId: string,
  playerId: string,
  position: string,
  projPointsPpr: number | null,
  projSeason: number | null,
): ProjectionPoolRow {
  return {
    franchiseId,
    playerId,
    playerName: playerId.toUpperCase(),
    position,
    projPointsPpr,
    projSeason,
  };
}

describe("buildProjectionPools", () => {
  it("counts projections whose projSeason matches the target season", () => {
    const pools = buildProjectionPools(
      [row("f1", "qb1", "QB", 361.5, 2027), row("f1", "rb1", "RB", 210, 2027)],
      2027,
    );
    const pool = pools.get("f1")!;
    expect(pool.find((p) => p.playerId === "qb1")?.points).toBe(361.5);
    expect(pool.find((p) => p.playerId === "rb1")?.points).toBe(210);
  });

  it("zeroes a stale prior-year projection (projSeason != target)", () => {
    // A player projected in 2026 but absent from the 2027 feed keeps
    // projSeason=2026 and the old points on their row; those points must
    // never count toward the 2027 rankings.
    const pools = buildProjectionPools(
      [
        row("f1", "qb1", "QB", 361.5, 2027), // current
        row("f1", "wr1", "WR", 250.0, 2026), // stale leftover
      ],
      2027,
    );
    const pool = pools.get("f1")!;
    expect(pool.find((p) => p.playerId === "qb1")?.points).toBe(361.5);
    expect(pool.find((p) => p.playerId === "wr1")?.points).toBe(0);
  });

  it("zeroes rows with a null projSeason (never projected)", () => {
    const pools = buildProjectionPools([row("f1", "te1", "TE", 120, null)], 2027);
    expect(pools.get("f1")![0].points).toBe(0);
  });

  it("yields all-zero pools when every projection is stale (the degrade-to-empty gate upstream)", () => {
    const pools = buildProjectionPools(
      [row("f1", "qb1", "QB", 300, 2026), row("f2", "rb1", "RB", 200, 2026)],
      2027,
    );
    const anyProjected = [...pools.values()].some((pool) =>
      pool.some((p) => p.points > 0),
    );
    expect(anyProjected).toBe(false);
  });

  it("groups rows by franchise", () => {
    const pools = buildProjectionPools(
      [
        row("f1", "qb1", "QB", 300, 2027),
        row("f2", "qb2", "QB", 280, 2027),
        row("f1", "rb1", "RB", 150, 2027),
      ],
      2027,
    );
    expect(pools.get("f1")).toHaveLength(2);
    expect(pools.get("f2")).toHaveLength(1);
  });
});
