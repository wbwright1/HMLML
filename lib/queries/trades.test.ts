import { describe, it, expect } from "vitest";
import {
  resolvePickAsset,
  type FranchiseInfo,
  type PickResolutionMaps,
} from "./trades";

const FRANCHISE_A: FranchiseInfo = {
  id: "fa",
  name: "Team A",
  slug: "team-a",
  abbreviation: "TA",
  brandingColor: "#111111",
  avatarUrl: null,
};
const FRANCHISE_B: FranchiseInfo = {
  id: "fb",
  name: "Team B",
  slug: "team-b",
  abbreviation: "TB",
  brandingColor: "#222222",
  avatarUrl: null,
};

// Base scenario: trade happened in season 2025 (seasonId 10), moving a 2026
// pick (seasonId 20) whose original slot owner is roster 3 = Team A.
function baseMaps(): PickResolutionMaps {
  return {
    seasonYearToId: new Map([
      [2025, 10],
      [2026, 20],
    ]),
    franchiseBySeasonRoster: new Map([
      ["20:3", FRANCHISE_A], // 2026, roster 3
      ["10:3", FRANCHISE_B], // 2025, roster 3 (different owner that year)
    ]),
    draftPickByKey: new Map([
      ["20:1:fa", { playerId: "p99", playerName: "Rookie McGee" }],
    ]),
  };
}

describe("resolvePickAsset", () => {
  it("resolves origin crest against the pick's own season, not the trade season", () => {
    const result = resolvePickAsset(
      { season: "2026", round: 1, roster_id: 3 },
      10,
      baseMaps()
    );
    expect(result.originalFranchise).toEqual(FRANCHISE_A);
  });

  it("resolves what the pick became for a completed draft", () => {
    const result = resolvePickAsset(
      { season: "2026", round: 1, roster_id: 3 },
      10,
      baseMaps()
    );
    expect(result.became).toEqual({ id: "p99", name: "Rookie McGee" });
  });

  it("falls back to the trade season for the crest when the pick season has no roster row", () => {
    const maps = baseMaps();
    maps.franchiseBySeasonRoster.delete("20:3"); // 2026 season not set up yet
    const result = resolvePickAsset(
      { season: "2026", round: 1, roster_id: 3 },
      10,
      maps
    );
    // fell back to 2025 (trade season) mapping
    expect(result.originalFranchise).toEqual(FRANCHISE_B);
    // no own-season franchise means no "became" resolution
    expect(result.became).toBeNull();
  });

  it("renders plain text (no became) when the draft is future/incomplete", () => {
    const maps = baseMaps();
    maps.draftPickByKey.clear();
    const result = resolvePickAsset(
      { season: "2026", round: 1, roster_id: 3 },
      10,
      maps
    );
    expect(result.originalFranchise).toEqual(FRANCHISE_A);
    expect(result.became).toBeNull();
  });

  it("falls back to the trade season (no became) when the pick season is unknown", () => {
    const result = resolvePickAsset(
      { season: "2099", round: 1, roster_id: 3 },
      10,
      baseMaps()
    );
    // pick season 2099 unresolved, so only the trade-season fallback applies
    expect(result.originalFranchise).toEqual(FRANCHISE_B);
    expect(result.became).toBeNull();
  });

  it("returns no crest when the roster slot is unknown in every season", () => {
    const result = resolvePickAsset(
      { season: "2026", round: 1, roster_id: 99 },
      10,
      baseMaps()
    );
    expect(result.originalFranchise).toBeNull();
    expect(result.became).toBeNull();
  });

  it("uses a fallback name when the matched draft pick has no player name", () => {
    const maps = baseMaps();
    maps.draftPickByKey.set("20:1:fa", { playerId: "p1", playerName: null });
    const result = resolvePickAsset(
      { season: "2026", round: 1, roster_id: 3 },
      10,
      maps
    );
    expect(result.became).toEqual({ id: "p1", name: "Unknown Player" });
  });

  it("does not match a became player from the wrong round", () => {
    const result = resolvePickAsset(
      { season: "2026", round: 2, roster_id: 3 },
      10,
      baseMaps()
    );
    expect(result.became).toBeNull();
  });

  it("preserves season and round on the returned asset", () => {
    const result = resolvePickAsset(
      { season: "2026", round: 4, roster_id: 3 },
      10,
      baseMaps()
    );
    expect(result.season).toBe("2026");
    expect(result.round).toBe(4);
  });
});
