import { describe, it, expect } from "vitest";
import { computeTradeGrade, type RealizedPointsRow } from "./trade-grades";
import type { Trade } from "./trades";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const TRADE_MS = 1_000_000_000_000;
const NOW_OLD = TRADE_MS + 2 * YEAR_MS; // trade is comfortably gradable
const NOW_FRESH = TRADE_MS + 30 * 24 * 60 * 60 * 1000; // 30 days old

function franchise(id: string, name: string) {
  return { id, name, slug: id };
}

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 1,
    seasonYear: 2024,
    date: "Oct 15, 2024",
    createdAtMs: TRADE_MS,
    week: 6,
    sides: [
      {
        franchise: franchise("fa", "Team A"),
        rosterId: "1",
        players: [{ id: "wr1", name: "Star Receiver", position: "WR", nflTeam: "KC" }],
        picks: [],
      },
      {
        franchise: franchise("fb", "Team B"),
        rosterId: "2",
        players: [{ id: "rb1", name: "Aging Runner", position: "RB", nflTeam: "SF" }],
        picks: [],
      },
    ],
    ...overrides,
  };
}

function row(overrides: Partial<RealizedPointsRow>): RealizedPointsRow {
  return {
    playerId: "wr1",
    franchiseId: "fa",
    seasonYear: 2024,
    week: 10,
    points: 20,
    started: true,
    ...overrides,
  };
}

describe("computeTradeGrade", () => {
  it("grades a lopsided realized outcome as Highway Robbery with A+/F letters", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => row({ week: 7 + i, points: 20 })), // fa: 200
      row({ playerId: "rb1", franchiseId: "fb", points: 30 }), // fb: 30
    ];
    const result = computeTradeGrade(makeTrade(), rows, NOW_OLD);

    expect(result.graded).toBe(true);
    expect(result.label).toBe("Highway Robbery");
    expect(result.labelTone).toBe("sting");
    expect(result.sides[0]).toMatchObject({ realizedPoints: 200, grade: "A+" });
    expect(result.sides[1]).toMatchObject({ realizedPoints: 30, grade: "F" });
  });

  it("labels a near-even, high-volume outcome Win-Win with B grades", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => row({ week: 7 + i, points: 25 })), // fa: 250
      ...Array.from({ length: 10 }, (_, i) =>
        row({ playerId: "rb1", franchiseId: "fb", week: 7 + i, points: 24 })
      ), // fb: 240
    ];
    const result = computeTradeGrade(makeTrade(), rows, NOW_OLD);

    expect(result.label).toBe("Win-Win");
    expect(result.labelTone).toBe("positive");
    expect(result.sides.map((s) => s.grade)).toEqual(["B", "B"]);
  });

  it("labels a near-even, low-volume outcome Mutual Mediocrity", () => {
    const rows = [
      row({ points: 60 }),
      row({ playerId: "rb1", franchiseId: "fb", points: 55 }),
    ];
    const result = computeTradeGrade(makeTrade(), rows, NOW_OLD);
    expect(result.label).toBe("Mutual Mediocrity");
    expect(result.labelTone).toBe("sting");
  });

  it("ignores points scored before the trade week in the trade season", () => {
    const rows = [
      row({ week: 3, points: 100 }), // pre-trade: excluded
      row({ week: 6, points: 40 }), // trade week onward: counted
      row({ seasonYear: 2025, week: 1, points: 10 }), // later season: counted
    ];
    const result = computeTradeGrade(makeTrade(), rows, NOW_OLD);
    expect(result.sides[0].realizedPoints).toBe(50);
  });

  it("counts the whole trade season for offseason trades (week null)", () => {
    const rows = [row({ week: 1, points: 15 })];
    const result = computeTradeGrade(makeTrade({ week: null }), rows, NOW_OLD);
    expect(result.sides[0].realizedPoints).toBe(15);
  });

  it("ignores points the player scored for a DIFFERENT franchise", () => {
    const rows = [row({ franchiseId: "fz", points: 150 })];
    const result = computeTradeGrade(makeTrade(), rows, NOW_OLD);
    expect(result.sides[0].realizedPoints).toBe(0);
  });

  it("separates started points from total realized points", () => {
    const rows = [
      row({ week: 7, points: 30, started: true }),
      row({ week: 8, points: 25, started: false }),
    ];
    const result = computeTradeGrade(makeTrade(), rows, NOW_OLD);
    expect(result.sides[0].realizedPoints).toBe(55);
    expect(result.sides[0].startedPoints).toBe(30);
  });

  it("credits a kept pick's drafted player, but not a flipped pick's", () => {
    const trade = makeTrade();
    trade.sides[0].players = [];
    trade.sides[0].picks = [
      {
        season: "2025",
        round: 1,
        originalFranchise: null,
        became: { id: "rook1", name: "Kept Rookie" },
        flippedToTradeId: null,
      },
      {
        season: "2025",
        round: 2,
        originalFranchise: null,
        became: { id: "rook2", name: "Flipped Rookie" },
        flippedToTradeId: 99,
      },
    ];
    const rows = [
      row({ playerId: "rook1", seasonYear: 2025, points: 80 }),
      row({ playerId: "rook2", seasonYear: 2025, points: 200 }),
      row({ playerId: "rb1", franchiseId: "fb", points: 40 }),
    ];
    const result = computeTradeGrade(trade, rows, NOW_OLD);
    expect(result.sides[0].realizedPoints).toBe(80);
  });

  it("withholds the grade on a fresh trade and reports early returns instead", () => {
    const rows = [row({ points: 45.5 })];
    const result = computeTradeGrade(makeTrade(), rows, NOW_FRESH);

    expect(result.graded).toBe(false);
    expect(result.sides.every((s) => s.grade === null)).toBe(true);
    expect(result.message).toContain("Too fresh to grade");
    expect(result.message).toContain("Team A 45.5 pts realized");
  });

  it("uses the no-numbers fresh message when nothing has been realized yet", () => {
    const result = computeTradeGrade(makeTrade(), [], NOW_FRESH);
    expect(result.graded).toBe(false);
    expect(result.message).toBe(
      "Too fresh to grade. The receipts need a year to age."
    );
  });

  it("withholds the grade on an old trade with trivial combined points", () => {
    const rows = [row({ points: 12 })];
    const result = computeTradeGrade(makeTrade(), rows, NOW_OLD);
    expect(result.graded).toBe(false);
    expect(result.message).toContain("jury is still deliberating");
  });

  it("never grades a trade with no timestamp", () => {
    const result = computeTradeGrade(
      makeTrade({ createdAtMs: null }),
      [row({ points: 500 })],
      NOW_OLD
    );
    expect(result.graded).toBe(false);
  });

  it("grades multi-team trades with letters but no overall label", () => {
    const trade = makeTrade();
    trade.sides.push({
      franchise: franchise("fc", "Team C"),
      rosterId: "3",
      players: [{ id: "te1", name: "Third Wheel", position: "TE", nflTeam: null }],
      picks: [],
    });
    const rows = [
      row({ points: 300 }),
      row({ playerId: "rb1", franchiseId: "fb", points: 100 }),
      row({ playerId: "te1", franchiseId: "fc", points: 20 }),
    ];
    const result = computeTradeGrade(trade, rows, NOW_OLD);

    expect(result.graded).toBe(true);
    expect(result.label).toBeNull();
    // shares: .714/.238/.048 -> r (x3): 2.14/.71/.14
    expect(result.sides.map((s) => s.grade)).toEqual(["A+", "D", "F"]);
  });
});
