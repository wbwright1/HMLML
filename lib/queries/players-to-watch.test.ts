import { describe, it, expect } from "vitest";
import {
  selectPlayersToWatch,
  sumProjectedByFranchise,
  formatBaselineLabel,
  type PoolRow,
  type BaselineMeta,
} from "./players-to-watch";

function row(overrides: Partial<PoolRow> & Pick<PoolRow, "playerId" | "franchiseId">): PoolRow {
  return {
    name: overrides.name ?? `Player ${overrides.playerId}`,
    position: overrides.position ?? "WR",
    team: overrides.team ?? "KC",
    franchiseName: overrides.franchiseName ?? `Franchise ${overrides.franchiseId}`,
    franchiseSlug: overrides.franchiseSlug ?? overrides.franchiseId,
    matchupId: overrides.matchupId ?? null,
    projectedPoints: overrides.projectedPoints ?? null,
    ...overrides,
  };
}

const priorSeasonMeta: BaselineMeta = { kind: "priorSeason", seasonYear: 2025 };
const currentSeasonMeta: BaselineMeta = { kind: "currentSeason", throughWeek: 4 };

describe("selectPlayersToWatch", () => {
  it("returns [] for an empty pool", () => {
    expect(selectPlayersToWatch([], new Map(), priorSeasonMeta, { featuredMatchupId: null })).toEqual([]);
  });

  it("returns [] when nothing carries a projection", () => {
    const pool = [
      row({ playerId: "p1", franchiseId: "f1", projectedPoints: null }),
      row({ playerId: "p2", franchiseId: "f2", projectedPoints: 0 }),
    ];
    expect(
      selectPlayersToWatch(pool, new Map(), priorSeasonMeta, { featuredMatchupId: null })
    ).toEqual([]);
  });

  it("picks at most one player per franchise", () => {
    const pool = [
      row({ playerId: "p1", franchiseId: "f1", projectedPoints: 20 }),
      row({ playerId: "p2", franchiseId: "f1", projectedPoints: 18 }),
      row({ playerId: "p3", franchiseId: "f2", projectedPoints: 15 }),
    ];
    const picked = selectPlayersToWatch(pool, new Map(), priorSeasonMeta, {
      featuredMatchupId: null,
    });
    const franchiseIds = picked.map((p) => p.franchiseSlug);
    expect(new Set(franchiseIds).size).toBe(franchiseIds.length);
    // p1 outranks p2 within f1 on higher projection.
    expect(picked.find((p) => p.franchiseSlug === "f1")?.playerId).toBe("p1");
  });

  it("caps the result at the limit (default 3)", () => {
    const pool = Array.from({ length: 5 }, (_, i) =>
      row({ playerId: `p${i}`, franchiseId: `f${i}`, projectedPoints: 10 + i })
    );
    const picked = selectPlayersToWatch(pool, new Map(), priorSeasonMeta, {
      featuredMatchupId: null,
    });
    expect(picked.length).toBe(3);
  });

  it("boosts players in the featured matchup ahead of a higher raw projection elsewhere", () => {
    const pool = [
      // Featured matchup: two evenly matched teams.
      row({ playerId: "featured-a", franchiseId: "fa", matchupId: 1, projectedPoints: 10 }),
      row({ playerId: "featured-b", franchiseId: "fb", matchupId: 1, projectedPoints: 9 }),
      // Non-featured, lopsided matchup (beyond the swing margin), slightly
      // higher raw projection for its top player.
      row({ playerId: "other-a", franchiseId: "fc", matchupId: 2, projectedPoints: 10.2 }),
      row({ playerId: "other-b", franchiseId: "fd", matchupId: 2, projectedPoints: 0 }),
    ];
    const picked = selectPlayersToWatch(pool, new Map(), priorSeasonMeta, {
      featuredMatchupId: 1,
      limit: 1,
    });
    expect(picked[0].playerId).toBe("featured-a");
    expect(picked[0].inFeaturedMatchup).toBe(true);
  });

  it("treats close projected totals as a swing matchup even when not featured", () => {
    const pool = [
      // Swing matchup: totals within the 10.0 margin.
      row({ playerId: "swing-a", franchiseId: "fa", matchupId: 5, projectedPoints: 12 }),
      row({ playerId: "swing-b", franchiseId: "fb", matchupId: 5, projectedPoints: 10 }),
      // Lopsided matchup, higher raw projection for the top player.
      row({ playerId: "lopsided-a", franchiseId: "fc", matchupId: 6, projectedPoints: 12.4 }),
      row({ playerId: "lopsided-b", franchiseId: "fd", matchupId: 6, projectedPoints: 1 }),
    ];
    const picked = selectPlayersToWatch(pool, new Map(), priorSeasonMeta, {
      featuredMatchupId: null,
      limit: 1,
    });
    expect(picked[0].playerId).toBe("swing-a");
    expect(picked[0].inFeaturedMatchup).toBe(true);
  });

  it("ranks a player with no baseline on projection alone, with an honest label", () => {
    const pool = [
      row({ playerId: "rookie", franchiseId: "f1", projectedPoints: 14 }),
      row({ playerId: "vet", franchiseId: "f2", projectedPoints: 14 }),
    ];
    const baselineByPlayer = new Map([["vet", { ppg: 20, games: 10 }]]);
    const picked = selectPlayersToWatch(pool, baselineByPlayer, priorSeasonMeta, {
      featuredMatchupId: null,
    });
    const rookie = picked.find((p) => p.playerId === "rookie");
    expect(rookie).toBeTruthy();
    expect(rookie?.baselinePpg).toBeNull();
    expect(rookie?.baselineLabel).toBe("First real look");
  });

  it("breaks ties deterministically on playerId", () => {
    const pool = [
      row({ playerId: "zzz", franchiseId: "f1", projectedPoints: 10 }),
      row({ playerId: "aaa", franchiseId: "f2", projectedPoints: 10 }),
    ];
    const picked = selectPlayersToWatch(pool, new Map(), priorSeasonMeta, {
      featuredMatchupId: null,
      limit: 1,
    });
    expect(picked[0].playerId).toBe("aaa");
  });

  it("resolves opponentName from the shared matchupId pairing", () => {
    const pool = [
      row({
        playerId: "p1",
        franchiseId: "f1",
        franchiseName: "McCarthyism",
        matchupId: 9,
        projectedPoints: 20,
      }),
      row({
        playerId: "p2",
        franchiseId: "f2",
        franchiseName: "Vanilla Vick",
        matchupId: 9,
        projectedPoints: 5,
      }),
    ];
    const picked = selectPlayersToWatch(pool, new Map(), priorSeasonMeta, {
      featuredMatchupId: null,
      limit: 1,
    });
    expect(picked[0].opponentName).toBe("Vanilla Vick");
  });
});

describe("sumProjectedByFranchise", () => {
  it("sums projected points per franchise, treating missing projections as 0", () => {
    const pool = [
      row({ playerId: "p1", franchiseId: "f1", projectedPoints: 10 }),
      row({ playerId: "p2", franchiseId: "f1", projectedPoints: 5 }),
      row({ playerId: "p3", franchiseId: "f2", projectedPoints: null }),
    ];
    const totals = sumProjectedByFranchise(pool);
    expect(totals.get("f1")).toBe(15);
    expect(totals.get("f2")).toBe(0);
  });
});

describe("formatBaselineLabel", () => {
  it("labels a prior-season baseline", () => {
    expect(formatBaselineLabel(18.4, 15, { kind: "priorSeason", seasonYear: 2025 })).toBe(
      "18.4 ppg in 2025"
    );
  });

  it("labels a current-season baseline", () => {
    expect(formatBaselineLabel(21.1, 4, currentSeasonMeta)).toBe(
      "21.1 ppg through Week 4"
    );
  });

  it("falls back to an honest label with no invented number", () => {
    expect(formatBaselineLabel(null, 0, priorSeasonMeta)).toBe("First real look");
  });
});
