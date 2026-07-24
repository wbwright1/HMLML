import { describe, it, expect } from "vitest";
import {
  pickLatestAcquisition,
  isDisqualifiedByLaterDrop,
  computeBlockbuster,
  selectCornerstones,
  computeTenureAnchor,
  resolveVia,
  type RosterEvent,
  type ScoredCandidate,
} from "./franchise-players";

describe("pickLatestAcquisition", () => {
  it("picks the most recent event by season/week/timestamp", () => {
    const draft2021: RosterEvent = { type: "draft", seasonYear: 2021, week: -1, sleeperMs: -Infinity };
    const trade2023: RosterEvent = { type: "trade", seasonYear: 2023, week: 4, sleeperMs: 1000 };
    expect(pickLatestAcquisition([draft2021, trade2023])).toEqual(trade2023);
  });
});

describe("computeTenureAnchor", () => {
  it("anchors to 2021 for continuous presence across a 2023 startup re-draft (Mahomes/Tokyo case)", () => {
    const presenceYears = new Set([2021, 2022, 2023, 2024, 2025, 2026]);
    expect(computeTenureAnchor(presenceYears, 2026)).toBe(2021);
  });

  it("anchors to the year after a presence gap, not the original draft year (CeeDee Lamb case)", () => {
    const presenceYears = new Set([2021, 2022, 2024, 2025, 2026]);
    expect(computeTenureAnchor(presenceYears, 2026)).toBe(2024);
  });

  it("anchors to 2023 when presence starts after an early gap (Burrow case)", () => {
    const presenceYears = new Set([2021, 2023, 2024, 2025, 2026]);
    expect(computeTenureAnchor(presenceYears, 2026)).toBe(2023);
  });

  it("anchors to 2023 for a genuine 2023-only startup arrival", () => {
    const presenceYears = new Set([2023, 2024, 2025, 2026]);
    expect(computeTenureAnchor(presenceYears, 2026)).toBe(2023);
  });
});

describe("resolveVia", () => {
  it("resolves to draft when the franchise drafted the player in the anchor year", () => {
    const draftYears = new Set([2021, 2023]);
    const tradeYears = new Set<number>();
    expect(resolveVia(2021, draftYears, tradeYears)).toBe("draft");
  });

  it("resolves to trade when a trade (not a draft) moved the player in the anchor year", () => {
    const draftYears = new Set<number>();
    const tradeYears = new Set([2024]);
    expect(resolveVia(2024, draftYears, tradeYears)).toBe("trade");
  });

  it("falls back to draft for the 2021 base year with no logged event", () => {
    const draftYears = new Set<number>();
    const tradeYears = new Set<number>();
    expect(resolveVia(2021, draftYears, tradeYears)).toBe("draft");
  });
});

describe("isDisqualifiedByLaterDrop", () => {
  it("disqualifies continuous tenure when a drop follows the latest acquisition (Watson's 2021 OBJ case)", () => {
    const draft2021: RosterEvent = { type: "draft", seasonYear: 2021, week: -1, sleeperMs: -Infinity };
    const laterDrop: RosterEvent = { type: "drop", seasonYear: 2022, week: 3, sleeperMs: 500 };
    expect(isDisqualifiedByLaterDrop(draft2021, [laterDrop])).toBe(true);
  });

  it("does not disqualify when the only drop predates the acquisition", () => {
    const trade2023: RosterEvent = { type: "trade", seasonYear: 2023, week: 4, sleeperMs: 1000 };
    const earlierDrop: RosterEvent = { type: "drop", seasonYear: 2022, week: 10, sleeperMs: 5 };
    expect(isDisqualifiedByLaterDrop(trade2023, [earlierDrop])).toBe(false);
  });

  it("does not disqualify when there are no drops at all", () => {
    const draft2021: RosterEvent = { type: "draft", seasonYear: 2021, week: -1, sleeperMs: -Infinity };
    expect(isDisqualifiedByLaterDrop(draft2021, [])).toBe(false);
  });
});

describe("computeBlockbuster", () => {
  it("is null when via is draft", () => {
    const draft: RosterEvent = { type: "draft", seasonYear: 2021, week: -1, sleeperMs: -Infinity };
    expect(computeBlockbuster(draft)).toBeNull();
  });

  it("is null when the acquiring trade's adds is null (34/97 null-adds trades guard)", () => {
    const trade: RosterEvent = {
      type: "trade",
      seasonYear: 2023,
      week: 4,
      sleeperMs: 1000,
      tradeAdds: null,
    };
    expect(computeBlockbuster(trade)).toBeNull();
  });

  it("is true for a multi-player trade", () => {
    const trade: RosterEvent = {
      type: "trade",
      seasonYear: 2023,
      week: 4,
      sleeperMs: 1000,
      tradeAdds: { p1: 1, p2: 1, p3: 2 },
      tradePicksInvolved: 0,
    };
    expect(computeBlockbuster(trade)).toBe(true);
  });

  it("is false for a simple one-for-one trade", () => {
    const trade: RosterEvent = {
      type: "trade",
      seasonYear: 2023,
      week: 4,
      sleeperMs: 1000,
      tradeAdds: { p1: 1 },
      tradePicksInvolved: 0,
    };
    expect(computeBlockbuster(trade)).toBe(false);
  });
});

describe("selectCornerstones", () => {
  function candidate(overrides: Partial<ScoredCandidate>): ScoredCandidate {
    return {
      playerId: "p1",
      playerName: "Player One",
      position: "QB",
      via: "draft",
      acquiredYear: 2021,
      tenureSeasons: 5,
      franchisePoints: 1000,
      franchiseStarts: 80,
      blockbuster: null,
      ...overrides,
    };
  }

  it("includes a co-cornerstone at exactly 90.4% (Tokyo Thunderbirds Mahomes+Chase live case)", () => {
    const mahomes = candidate({ playerId: "mahomes", playerName: "Mahomes", franchisePoints: 1689 });
    const chase = candidate({ playerId: "chase", playerName: "Chase", franchisePoints: 1526.5 }); // 90.4% of 1689
    const result = selectCornerstones([mahomes, chase]);
    expect(result).toHaveLength(2);
    expect(result[0].playerId).toBe("mahomes");
    expect(result[1].playerId).toBe("chase");
  });

  it("returns a singular cornerstone when the runner-up is below the 90% threshold (Watson/Jordan Love case)", () => {
    const love = candidate({ playerId: "love", playerName: "Jordan Love", franchisePoints: 1500 });
    const other = candidate({ playerId: "other", playerName: "Someone Else", franchisePoints: 1000 }); // ~67%
    const result = selectCornerstones([love, other]);
    expect(result).toHaveLength(1);
    expect(result[0].playerId).toBe("love");
  });

  it("caps at 2 cornerstones even with 3+ eligible candidates", () => {
    const a = candidate({ playerId: "a", franchisePoints: 1000 });
    const b = candidate({ playerId: "b", franchisePoints: 950 });
    const c = candidate({ playerId: "c", franchisePoints: 920 });
    const result = selectCornerstones([a, b, c]);
    expect(result).toHaveLength(2);
  });

  it("returns an empty array for no candidates", () => {
    expect(selectCornerstones([])).toEqual([]);
  });

  it("breaks ties by starts, then earlier acquiredYear, then name", () => {
    const a = candidate({
      playerId: "a",
      playerName: "Zeta",
      franchisePoints: 1000,
      franchiseStarts: 80,
      acquiredYear: 2022,
    });
    const b = candidate({
      playerId: "b",
      playerName: "Alpha",
      franchisePoints: 1000,
      franchiseStarts: 85,
      acquiredYear: 2021,
    });
    const result = selectCornerstones([a, b]);
    expect(result[0].playerId).toBe("b"); // higher starts wins the tie
  });
});
