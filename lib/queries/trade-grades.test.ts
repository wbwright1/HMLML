import { describe, it, expect } from "vitest";
import {
  computeTradeGrade,
  computeTradeGrades,
  type RealizedPointsRow,
} from "./trade-grades";
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
        gaveAssetCount: 1,
        players: [{ id: "wr1", name: "Star Receiver", position: "WR", nflTeam: "KC" }],
        picks: [],
      },
      {
        franchise: franchise("fb", "Team B"),
        rosterId: "2",
        gaveAssetCount: 1,
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
      "Too fresh to grade. Grades print once the receipts cover about six games or the deal turns a year old."
    );
  });

  it("grades a fresh trade EARLY once every player has 6+ post-trade games", () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => row({ week: 7 + i, points: 20 })), // fa: 120
      ...Array.from({ length: 6 }, (_, i) =>
        row({ playerId: "rb1", franchiseId: "fb", week: 7 + i, points: 10 })
      ), // fb: 60
    ];
    const result = computeTradeGrade(makeTrade(), rows, NOW_FRESH);

    expect(result.graded).toBe(true);
    expect(result.sides[0].grade).toBe("A");
  });

  it("does NOT grade early while any player is short of 6 post-trade games", () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => row({ week: 7 + i, points: 20 })),
      ...Array.from({ length: 5 }, (_, i) =>
        row({ playerId: "rb1", franchiseId: "fb", week: 7 + i, points: 30 })
      ), // rb1: only 5 games
    ];
    const result = computeTradeGrade(makeTrade(), rows, NOW_FRESH);
    expect(result.graded).toBe(false);
    expect(result.message).toContain("Too fresh to grade");
  });

  it("ignores phantom zero-point weeks as played-game evidence", () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => row({ week: 7 + i, points: 20 })),
      // rb1 "played" 6 weeks but every row is a phantom 0: not evidence.
      ...Array.from({ length: 6 }, (_, i) =>
        row({ playerId: "rb1", franchiseId: "fb", week: 7 + i, points: 0 })
      ),
    ];
    const result = computeTradeGrade(makeTrade(), rows, NOW_FRESH);
    expect(result.graded).toBe(false);
  });

  it("never grades a trade holding a kept pick from an unplayed rookie class", () => {
    const trade = makeTrade();
    trade.sides[0].picks = [
      {
        season: "2026",
        round: 1,
        originalFranchise: null,
        became: null,
        flippedToTradeId: null,
      },
    ];
    const rows = [
      row({ points: 400 }),
      row({ playerId: "rb1", franchiseId: "fb", points: 300 }),
    ];
    // Even years past the trade, with big realized points on both sides:
    const result = computeTradeGrade(makeTrade({ sides: trade.sides }), rows, NOW_OLD, 2025);
    expect(result.graded).toBe(false);
    expect(result.message).toContain("rookie class that hasn't seen the field");
  });

  it("lets a FLIPPED future pick through: it never blocks the flipper's grade", () => {
    const trade = makeTrade();
    trade.sides[0].picks = [
      {
        season: "2026",
        round: 1,
        originalFranchise: null,
        became: null,
        flippedToTradeId: 42,
      },
    ];
    const rows = [
      row({ points: 400 }),
      row({ playerId: "rb1", franchiseId: "fb", points: 300 }),
    ];
    const result = computeTradeGrade(makeTrade({ sides: trade.sides }), rows, NOW_OLD, 2025);
    expect(result.graded).toBe(true);
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
      gaveAssetCount: 1,
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

describe("computeTradeGrades flip-chain credit", () => {
  // The Omarion Hampton scenario: in trade 1, Team A gives a player to Team B
  // for a pick; A later packages that pick WITH TWO OTHERS (trade 2, gave 3
  // assets) for a star who realizes 300 points. Trade 1 must credit A's side
  // 300/3 = 100 via the flip chain instead of scoring the pick as a dud.
  function hamptonTrades(): Trade[] {
    const trade1 = makeTrade({
      id: 1,
      sides: [
        {
          franchise: franchise("fa", "Team A"),
          rosterId: "1",
          gaveAssetCount: 1, // gave one player
          players: [],
          picks: [
            {
              season: "2025",
              round: 1,
              originalFranchise: null,
              became: { id: "someone", name: "Whoever It Became" },
              flippedToTradeId: 2,
            },
          ],
        },
        {
          franchise: franchise("fb", "Team B"),
          rosterId: "2",
          gaveAssetCount: 1, // gave the pick
          players: [{ id: "vet1", name: "Veteran Piece", position: "WR", nflTeam: "KC" }],
          picks: [],
        },
      ],
    });
    const trade2 = makeTrade({
      id: 2,
      seasonYear: 2025,
      createdAtMs: TRADE_MS + 90 * 24 * 60 * 60 * 1000,
      week: 2,
      sides: [
        {
          franchise: franchise("fa", "Team A"),
          rosterId: "1",
          gaveAssetCount: 3, // the flipped pick plus two more
          players: [{ id: "hampton", name: "Omarion Hampton", position: "RB", nflTeam: "LAC" }],
          picks: [],
        },
        {
          franchise: franchise("fc", "Team C"),
          rosterId: "3",
          gaveAssetCount: 1,
          players: [],
          picks: [],
        },
      ],
    });
    return [trade1, trade2];
  }

  const hamptonRows = [
    // Hampton: 300 pts for Team A after trade 2.
    ...Array.from({ length: 10 }, (_, i) =>
      row({ playerId: "hampton", franchiseId: "fa", seasonYear: 2025, week: 3 + i, points: 30 })
    ),
    // The player Team B got in trade 1: 90 pts.
    ...Array.from({ length: 9 }, (_, i) =>
      row({ playerId: "vet1", franchiseId: "fb", week: 7 + i, points: 10 })
    ),
  ];

  it("credits a flipped pick with a diluted share of the flip trade's haul", () => {
    const grades = computeTradeGrades(hamptonTrades(), hamptonRows, NOW_OLD);
    const trade1 = grades.get(1)!;

    expect(trade1.sides[0].flipCreditPoints).toBeCloseTo(100, 5); // 300 / 3
    expect(trade1.sides[0].realizedPoints).toBeCloseTo(100, 5);
    expect(trade1.sides[1].realizedPoints).toBeCloseTo(90, 5);
    // 100 vs 90 is near-even: the trade no longer reads as a robbery of A.
    expect(trade1.graded).toBe(true);
    expect(trade1.label).toBe("Mutual Mediocrity");
  });

  it("leaves the flip trade itself graded on its own full haul", () => {
    const grades = computeTradeGrades(hamptonTrades(), hamptonRows, NOW_OLD);
    const trade2 = grades.get(2)!;
    expect(trade2.sides[0].realizedPoints).toBeCloseTo(300, 5);
    expect(trade2.sides[0].flipCreditPoints).toBe(0);
  });

  it("earns zero credit when the flip target trade is not in the input", () => {
    const [trade1] = hamptonTrades();
    const grades = computeTradeGrades([trade1], hamptonRows, NOW_OLD);
    expect(grades.get(1)!.sides[0].flipCreditPoints).toBe(0);
  });

  it("chains credit across two hops of flips, diluting at each step", () => {
    const [trade1, trade2] = hamptonTrades();
    // Trade 2's return is now itself a pick flipped into trade 3 (gave 2),
    // whose haul realizes 200 for Team A: trade2 credit = 200/2 = 100,
    // trade1 credit = 100/3.
    trade2.sides[0].players = [];
    trade2.sides[0].picks = [
      {
        season: "2026",
        round: 1,
        originalFranchise: null,
        became: null,
        flippedToTradeId: 3,
      },
    ];
    trade2.sides[0].gaveAssetCount = 3;
    const trade3 = makeTrade({
      id: 3,
      seasonYear: 2025,
      createdAtMs: TRADE_MS + 180 * 24 * 60 * 60 * 1000,
      week: 8,
      sides: [
        {
          franchise: franchise("fa", "Team A"),
          rosterId: "1",
          gaveAssetCount: 2,
          players: [{ id: "star3", name: "Final Star", position: "WR", nflTeam: "DAL" }],
          picks: [],
        },
        {
          franchise: franchise("fd", "Team D"),
          rosterId: "4",
          gaveAssetCount: 1,
          players: [],
          picks: [],
        },
      ],
    });
    const rows = [
      ...hamptonRows,
      ...Array.from({ length: 10 }, (_, i) =>
        row({ playerId: "star3", franchiseId: "fa", seasonYear: 2025, week: 9 + i, points: 20 })
      ),
    ];
    const grades = computeTradeGrades([trade1, trade2, trade3], rows, NOW_OLD);

    expect(grades.get(2)!.sides[0].flipCreditPoints).toBeCloseTo(100, 5); // 200/2
    expect(grades.get(1)!.sides[0].flipCreditPoints).toBeCloseTo(100 / 3, 5);
  });
});
