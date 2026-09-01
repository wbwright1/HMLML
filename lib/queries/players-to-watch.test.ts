import { describe, it, expect } from "vitest";
import {
  selectPlayersToWatch,
  sumProjectedByFranchise,
  formatBaselineLabel,
  PLAYER_STORY_LABELS,
  type PoolRow,
  type BaselineMeta,
  type BaselineEntry,
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

describe("selectPlayersToWatch story slots", () => {
  /** Four evenly projected franchises; the headliner is always the top score. */
  function storyPool(): PoolRow[] {
    return [
      row({ playerId: "star", franchiseId: "f1", projectedPoints: 30 }),
      row({ playerId: "rookie", franchiseId: "f2", projectedPoints: 20 }),
      row({ playerId: "traded", franchiseId: "f3", projectedPoints: 18 }),
      row({ playerId: "filler", franchiseId: "f4", projectedPoints: 17 }),
    ];
  }

  it("labels slot 1 The Headliner with no story detail", () => {
    const picked = selectPlayersToWatch(storyPool(), new Map(), priorSeasonMeta, {
      featuredMatchupId: null,
      limit: 1,
    });
    expect(picked[0].playerId).toBe("star");
    expect(picked[0].storyKey).toBe("headliner");
    expect(picked[0].storyLabel).toBe(PLAYER_STORY_LABELS.headliner);
    expect(picked[0].storyDetail).toBeNull();
  });

  it("takes a Debut only when the projection clears the pool median", () => {
    // Median of 30/20/18/17 is 19: the rookie at 20 clears it, the dart throw
    // at 3 does not.
    const pool = [
      ...storyPool(),
      row({ playerId: "dart", franchiseId: "f5", projectedPoints: 3 }),
    ];
    const baselines = new Map<string, BaselineEntry>([
      ["star", { ppg: 20, games: 15 }],
      ["traded", { ppg: 12, games: 12 }],
      ["filler", { ppg: 11, games: 12 }],
    ]);
    const picked = selectPlayersToWatch(pool, baselines, priorSeasonMeta, {
      featuredMatchupId: null,
    });
    const debut = picked.find((p) => p.storyKey === "debut");
    expect(debut?.playerId).toBe("rookie");
    expect(debut?.storyLabel).toBe(PLAYER_STORY_LABELS.debut);
    expect(debut?.storyDetail).toBe("No starts in 2025, in the lineup anyway");
    expect(picked.some((p) => p.playerId === "dart")).toBe(false);
  });

  it("claims a Revenge Game only when the former franchise is this week's opponent", () => {
    const pool = [
      row({
        playerId: "star",
        franchiseId: "f1",
        franchiseName: "McCarthyism",
        matchupId: 1,
        projectedPoints: 30,
      }),
      row({
        playerId: "exile",
        franchiseId: "f2",
        franchiseName: "Vanilla Vick",
        matchupId: 1,
        projectedPoints: 20,
      }),
    ];
    const baselines = new Map<string, BaselineEntry>([
      ["star", { ppg: 22, games: 15 }],
      [
        "exile",
        { ppg: 14, games: 12, gamesByFranchise: new Map([["f1", 12]]) },
      ],
    ]);
    const picked = selectPlayersToWatch(pool, baselines, priorSeasonMeta, {
      featuredMatchupId: null,
    });
    const revenge = picked.find((p) => p.storyKey === "revenge");
    expect(revenge?.playerId).toBe("exile");
    expect(revenge?.storyDetail).toBe("Started 12 games for McCarthyism in 2025");
  });

  it("does not claim revenge when the former franchise is not the opponent", () => {
    const pool = [
      row({ playerId: "star", franchiseId: "f1", matchupId: 1, projectedPoints: 30 }),
      row({ playerId: "exile", franchiseId: "f2", matchupId: 1, projectedPoints: 20 }),
      row({ playerId: "other", franchiseId: "f3", matchupId: 2, projectedPoints: 19 }),
      row({ playerId: "rival", franchiseId: "f4", matchupId: 2, projectedPoints: 18 }),
    ];
    // exile started for f3, who is playing someone else this week.
    const baselines = new Map<string, BaselineEntry>([
      ["star", { ppg: 20, games: 15 }],
      ["exile", { ppg: 8, games: 9, gamesByFranchise: new Map([["f3", 9]]) }],
    ]);
    const picked = selectPlayersToWatch(pool, baselines, priorSeasonMeta, {
      featuredMatchupId: null,
    });
    expect(picked.some((p) => p.storyKey === "revenge")).toBe(false);
    // The same player is still an honest New Face.
    const newFace = picked.find((p) => p.storyKey === "newFace");
    expect(newFace?.playerId).toBe("exile");
    expect(newFace?.storyDetail).toBe("Started 9 games for Franchise f3 in 2025");
  });

  it("takes The Leap on a 30%-plus jump off a real baseline", () => {
    const pool = [
      row({ playerId: "star", franchiseId: "f1", projectedPoints: 30 }),
      row({ playerId: "leaper", franchiseId: "f2", projectedPoints: 20 }),
      row({ playerId: "steady", franchiseId: "f3", projectedPoints: 18 }),
    ];
    const baselines = new Map<string, BaselineEntry>([
      ["star", { ppg: 24, games: 15 }],
      // 20 projected off 14.0 ppg is a 43% jump over 12 games.
      ["leaper", { ppg: 14, games: 12 }],
      // 18 projected off 17.0 ppg is not a leap.
      ["steady", { ppg: 17, games: 12 }],
    ]);
    const picked = selectPlayersToWatch(pool, baselines, priorSeasonMeta, {
      featuredMatchupId: null,
    });
    const leap = picked.find((p) => p.storyKey === "leap");
    expect(leap?.playerId).toBe("leaper");
    expect(leap?.storyDetail).toBe("Projected 20.0 off 14.0 ppg in 2025");
  });

  it("refuses The Leap on a baseline of fewer than 6 started games", () => {
    const pool = [
      row({ playerId: "star", franchiseId: "f1", projectedPoints: 30 }),
      row({ playerId: "smallsample", franchiseId: "f2", projectedPoints: 20 }),
    ];
    const baselines = new Map<string, BaselineEntry>([
      ["star", { ppg: 24, games: 15 }],
      ["smallsample", { ppg: 10, games: 3 }],
    ]);
    const picked = selectPlayersToWatch(pool, baselines, priorSeasonMeta, {
      featuredMatchupId: null,
    });
    expect(picked.some((p) => p.storyKey === "leap")).toBe(false);
    // The slot falls back to a headliner rather than shrinking the rail.
    expect(picked.length).toBe(2);
    expect(picked[1].storyKey).toBe("headliner");
  });

  it("fills every slot with headliners when no archetype has a candidate", () => {
    const pool = storyPool();
    const baselines = new Map<string, BaselineEntry>(
      pool.map((r) => [r.playerId, { ppg: 25, games: 15 } as BaselineEntry])
    );
    const picked = selectPlayersToWatch(pool, baselines, priorSeasonMeta, {
      featuredMatchupId: null,
    });
    expect(picked.length).toBe(3);
    expect(picked.every((p) => p.storyKey === "headliner")).toBe(true);
    expect(picked.map((p) => p.playerId)).toEqual(["star", "rookie", "traded"]);
  });

  it("takes at most one player per archetype and never repeats a franchise", () => {
    const pool = [
      row({ playerId: "star", franchiseId: "f1", projectedPoints: 30 }),
      row({ playerId: "rookieA", franchiseId: "f2", projectedPoints: 25 }),
      row({ playerId: "rookieB", franchiseId: "f3", projectedPoints: 24 }),
      row({ playerId: "rookieC", franchiseId: "f4", projectedPoints: 23 }),
    ];
    const picked = selectPlayersToWatch(pool, new Map(), priorSeasonMeta, {
      featuredMatchupId: null,
    });
    expect(picked.filter((p) => p.storyKey === "debut").length).toBe(1);
    expect(new Set(picked.map((p) => p.franchiseSlug)).size).toBe(picked.length);
  });

  it("phrases a current-season window as 'earlier this season'", () => {
    const pool = [
      row({
        playerId: "star",
        franchiseId: "f1",
        franchiseName: "McCarthyism",
        matchupId: 1,
        projectedPoints: 30,
      }),
      row({ playerId: "exile", franchiseId: "f2", matchupId: 1, projectedPoints: 20 }),
    ];
    const baselines = new Map<string, BaselineEntry>([
      ["star", { ppg: 20, games: 15 }],
      ["exile", { ppg: 12, games: 1, gamesByFranchise: new Map([["f1", 1]]) }],
    ]);
    const picked = selectPlayersToWatch(pool, baselines, currentSeasonMeta, {
      featuredMatchupId: null,
    });
    expect(picked.find((p) => p.storyKey === "revenge")?.storyDetail).toBe(
      "Started 1 game for McCarthyism earlier this season"
    );
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
