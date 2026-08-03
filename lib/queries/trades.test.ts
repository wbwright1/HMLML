import { describe, it, expect } from "vitest";
import {
  resolvePickAsset,
  findPickFlip,
  pickMovementKey,
  type FranchiseInfo,
  type PickResolutionMaps,
  type PickMovement,
} from "./trades";
import { isVoidedPick } from "@/lib/voided-picks";

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

  it("resolves a 'came home' pick, where the original slot owner and the drafter are the same franchise", () => {
    // Roster 5's franchise in the pick's own season (2026) is Team B, and the
    // draft_picks row for that slot ALSO carries originalFranchiseId "fb"
    // (post-fix, daily.ts's syncDrafts always stores the slot owner, even
    // when the drafter never traded the pick away). Proves resolvePickAsset
    // still resolves `became` in this no-longer-null-filtered case.
    const maps = baseMaps();
    maps.franchiseBySeasonRoster.set("20:5", FRANCHISE_B);
    maps.draftPickByKey.set("20:1:fb", { playerId: "p42", playerName: "Homegrown Rookie" });
    const result = resolvePickAsset(
      { season: "2026", round: 1, roster_id: 5 },
      10,
      maps
    );
    expect(result.originalFranchise).toEqual(FRANCHISE_B);
    expect(result.became).toEqual({ id: "p42", name: "Homegrown Rookie" });
  });
});

describe("voided pick identification (2023 startup redraft)", () => {
  // getTrades() itself touches the database and is exercised end-to-end by
  // e2e/voided-picks.spec.ts; this documents the boundary the query layer
  // relies on to decide which picks it must never resolve or flip-credit.
  it("flags a pre-redraft trade naming a redraft-era pick as voided", () => {
    expect(isVoidedPick(2022, "2023")).toBe(true);
  });

  it("does not flag an in-draft 2023 trade (league year 2023) as voided", () => {
    expect(isVoidedPick(2023, "2023")).toBe(false);
  });

  it("does not flag a same-era pre-redraft trade as voided", () => {
    expect(isVoidedPick(2022, "2022")).toBe(false);
  });
});

describe("pickMovementKey", () => {
  it("keys a pick by draft season, round, and original slot owner", () => {
    expect(pickMovementKey({ season: "2026", round: 1, roster_id: 3 })).toBe(
      "2026:1:3"
    );
  });
});

describe("findPickFlip", () => {
  const KEY = "2026:1:3";

  function movements(list: PickMovement[]): Map<string, PickMovement[]> {
    return new Map([[KEY, list]]);
  }

  // Team A (franchise "fa", roster 5) received the pick in trade 100 at t=1000.
  const RECEIVED = {
    pickKey: KEY,
    tradeId: 100,
    timestamp: 1000,
    franchiseId: "fa",
    rosterId: 5,
  };

  it("finds the trade where the receiver sent the same pick onward", () => {
    const result = findPickFlip(
      movements([
        { tradeId: 100, timestamp: 1000, fromFranchiseId: "fb", fromRosterId: 2 },
        { tradeId: 200, timestamp: 2000, fromFranchiseId: "fa", fromRosterId: 5 },
      ]),
      RECEIVED
    );
    expect(result).toBe(200);
  });

  it("returns the EARLIEST later flip when the pick moved multiple times", () => {
    const result = findPickFlip(
      movements([
        { tradeId: 300, timestamp: 3000, fromFranchiseId: "fa", fromRosterId: 5 },
        { tradeId: 200, timestamp: 2000, fromFranchiseId: "fa", fromRosterId: 5 },
      ]),
      RECEIVED
    );
    expect(result).toBe(200);
  });

  it("ignores later movements of the pick sent by a DIFFERENT team", () => {
    const result = findPickFlip(
      movements([
        { tradeId: 200, timestamp: 2000, fromFranchiseId: "fc", fromRosterId: 7 },
      ]),
      RECEIVED
    );
    expect(result).toBeNull();
  });

  it("ignores movements at or before the receiving trade's timestamp", () => {
    const result = findPickFlip(
      movements([
        { tradeId: 50, timestamp: 500, fromFranchiseId: "fa", fromRosterId: 5 },
        { tradeId: 60, timestamp: 1000, fromFranchiseId: "fa", fromRosterId: 5 },
      ]),
      RECEIVED
    );
    expect(result).toBeNull();
  });

  it("falls back to roster-id matching when franchises are unresolved", () => {
    const result = findPickFlip(
      movements([
        { tradeId: 200, timestamp: 2000, fromFranchiseId: null, fromRosterId: 5 },
      ]),
      { ...RECEIVED, franchiseId: null }
    );
    expect(result).toBe(200);
  });

  it("prefers franchise identity over roster ids when both resolve", () => {
    // Same roster number, different franchise (roster ids reused across years)
    const result = findPickFlip(
      movements([
        { tradeId: 200, timestamp: 2000, fromFranchiseId: "fz", fromRosterId: 5 },
      ]),
      RECEIVED
    );
    expect(result).toBeNull();
  });

  it("returns null when the receiving trade has no timestamp", () => {
    const result = findPickFlip(
      movements([
        { tradeId: 200, timestamp: 2000, fromFranchiseId: "fa", fromRosterId: 5 },
      ]),
      { ...RECEIVED, timestamp: null }
    );
    expect(result).toBeNull();
  });

  it("returns null for a pick with no recorded movements", () => {
    expect(findPickFlip(new Map(), RECEIVED)).toBeNull();
  });
});
