import { describe, it, expect } from "vitest";
import {
  computeTradeGrade,
  computeTradeGrades,
  type RealizedPointsRow,
  type MatchupResult,
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
        voided: false,
      },
      {
        season: "2025",
        round: 2,
        originalFranchise: null,
        became: { id: "rook2", name: "Flipped Rookie" },
        flippedToTradeId: 99,
        voided: false,
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
        voided: false,
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
        voided: false,
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
    // shares: .714/.238/.048 -> r (x3): 2.143/.714/.143 -> A+/C/F on the
    // blended-share curve (r .714 clears the C floor of .7)
    expect(result.sides.map((s) => s.grade)).toEqual(["A+", "C", "F"]);
  });
});

// The Omarion Hampton scenario: in trade 1, Team A gives a player to Team B
// for a pick; A later packages that pick WITH TWO OTHERS (trade 2, gave 3
// assets) for a star who realizes 300 points. Trade 1 must credit A's side
// 300/3 = 100 via the flip chain instead of scoring the pick as a dud.
// Module-scoped (not just describe-local): reused by the value/wins lens
// flip-credit tests below, not only the points flip-chain tests.
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
            voided: false,
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

describe("computeTradeGrades flip-chain credit", () => {
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
        voided: false,
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

function values(map: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(map));
}

function matchupMap(map: Record<string, MatchupResult>): Map<string, MatchupResult> {
  return new Map(Object.entries(map));
}

describe("computeTradeGrade value lens", () => {
  it("moderates a lopsided points split when values are near-even and fully covered (variant A)", () => {
    const rows = [
      row({ points: 40 }),
      row({ playerId: "rb1", franchiseId: "fb", points: 160 }),
    ];
    const result = computeTradeGrade(
      makeTrade(),
      rows,
      NOW_OLD,
      undefined,
      values({ wr1: 6000, rb1: 6000 })
    );
    expect(result.sides[0].blendedShare).toBeCloseTo(0.33125, 5);
    expect(result.sides[0].grade).toBe("D"); // points-only would be F
    expect(result.sides[1].blendedShare).toBeCloseTo(0.66875, 5);
    expect(result.sides[1].grade).toBe("A"); // points-only would be A+
  });

  it("moderates a lopsided points split when values are near-even and fully covered (variant B)", () => {
    const rows = [row({ playerId: "rb1", franchiseId: "fb", points: 200 })];
    const result = computeTradeGrade(
      makeTrade(),
      rows,
      NOW_OLD,
      undefined,
      values({ wr1: 12000, rb1: 4000 })
    );
    expect(result.sides[0].blendedShare).toBeCloseTo(0.328125, 5);
    expect(result.sides[0].grade).toBe("D"); // escapes F
    expect(result.sides[1].blendedShare).toBeCloseTo(0.671875, 5);
    expect(result.sides[1].grade).toBe("A");
  });

  it("blends an offsetting points/value split to a Win-Win with both sides B", () => {
    const rows = [
      row({ points: 300 }),
      row({ playerId: "rb1", franchiseId: "fb", points: 100 }),
    ];
    const result = computeTradeGrade(
      makeTrade(),
      rows,
      NOW_OLD,
      undefined,
      values({ wr1: 2000, rb1: 6000 })
    );
    expect(result.sides[0].blendedShare).toBeCloseTo(0.53125, 5);
    expect(result.sides[0].grade).toBe("B");
    expect(result.sides[1].blendedShare).toBeCloseTo(0.46875, 5);
    expect(result.sides[1].grade).toBe("B");
    expect(result.label).toBe("Win-Win");
  });

  it("weights the value lens by coverage fraction when one of three slots is unvalued", () => {
    const trade = makeTrade();
    trade.sides[0].picks = [
      {
        season: "2024",
        round: 1,
        originalFranchise: null,
        became: { id: "rook1", name: "Kept Rookie" },
        flippedToTradeId: null,
        voided: false,
      },
    ];
    const rows = [
      row({ points: 180 }),
      row({ playerId: "rb1", franchiseId: "fb", points: 20 }),
    ];
    // 3 value slots (wr1, the kept pick's drafted rookie, rb1); rook1 unvalued.
    const result = computeTradeGrade(
      trade,
      rows,
      NOW_OLD,
      2024,
      values({ wr1: 1000, rb1: 3000 })
    );
    // D = .45 + .35*(2/3) = .68333; w_p=.65854, w_v=.34146
    // blended_A = .65854*.9 + .34146*.25 = .678049 -> r 1.356 -> A
    expect(result.sides[0].blendedShare).toBeCloseTo(0.678049, 4);
    expect(result.sides[0].grade).toBe("A");
    // blended_B = .321951 -> r .6439 -> D
    expect(result.sides[1].blendedShare).toBeCloseTo(0.321951, 4);
    expect(result.sides[1].grade).toBe("D");
  });

  it("drops the value lens entirely (byte-identical to no values) below the coverage floor", () => {
    const trade = makeTrade();
    trade.sides[0].picks = [
      {
        season: "2024",
        round: 1,
        originalFranchise: null,
        became: { id: "rook1", name: "Kept Rookie" },
        flippedToTradeId: null,
        voided: false,
      },
    ];
    const rows = [
      row({ points: 180 }),
      row({ playerId: "rb1", franchiseId: "fb", points: 20 }),
    ];
    // Only 1 of 3 slots covered: coverageFraction .333 < VALUE_COVERAGE_FLOOR .5
    const partial = computeTradeGrade(trade, rows, NOW_OLD, 2024, values({ wr1: 1000 }));
    const empty = computeTradeGrade(trade, rows, NOW_OLD, 2024, values({}));
    expect(partial.sides.map((s) => ({ grade: s.grade, blendedShare: s.blendedShare }))).toEqual(
      empty.sides.map((s) => ({ grade: s.grade, blendedShare: s.blendedShare }))
    );
  });

  it("drops the value lens when the covered values sum to zero", () => {
    const rows = [
      row({ points: 150 }),
      row({ playerId: "rb1", franchiseId: "fb", points: 50 }),
    ];
    const zeroValued = computeTradeGrade(
      makeTrade(),
      rows,
      NOW_OLD,
      undefined,
      values({ wr1: 0, rb1: 0 })
    );
    const noValues = computeTradeGrade(makeTrade(), rows, NOW_OLD, undefined, values({}));
    expect(zeroValued.sides.map((s) => s.grade)).toEqual(noValues.sides.map((s) => s.grade));
    expect(zeroValued.sides.map((s) => s.blendedShare)).toEqual(
      noValues.sides.map((s) => s.blendedShare)
    );
  });

  it("grades points-only with an explicit empty values map", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => row({ week: 7 + i, points: 20 })),
      row({ playerId: "rb1", franchiseId: "fb", points: 30 }),
    ];
    const result = computeTradeGrade(makeTrade(), rows, NOW_OLD, undefined, values({}));
    expect(result.label).toBe("Highway Robbery");
    expect(result.sides[0].grade).toBe("A+");
    expect(result.sides[1].grade).toBe("F");
  });

  it("credits a flipped pick's value via the same diluted flip chain as points", () => {
    const grades = computeTradeGrades(
      hamptonTrades(),
      hamptonRows,
      NOW_OLD,
      undefined,
      values({ hampton: 5000 })
    );
    const trade1 = grades.get(1)!;
    expect(trade1.sides[0].valueNow).toBeCloseTo(5000 / 3, 5);
  });

  it("resolves a kept, undrafted pick's value via its FantasyCalc pseudo-id (blocked from a letter grade by the unseen-rookie gate, but still priced for display)", () => {
    const trade = makeTrade();
    trade.sides[0].players = [];
    trade.sides[0].picks = [
      {
        // A genuinely not-yet-drafted pick is always for a season later than
        // the league's most recently played one (the unseen-rookie gate owns
        // anything else): season 2025 > latestPlayed 2024.
        season: "2025",
        round: 1,
        originalFranchise: null,
        became: null,
        flippedToTradeId: null,
        voided: false,
      },
    ];
    const rows = [row({ playerId: "rb1", franchiseId: "fb", points: 100 })];
    const result = computeTradeGrade(
      trade,
      rows,
      NOW_OLD,
      2024,
      values({ FP_2025_1: 4000 })
    );
    expect(result.graded).toBe(false);
    expect(result.sides[0].valueNow).toBeCloseTo(4000, 5);
  });
});

describe("computeTradeGrade unresolved past kept pick guard (FIX 2)", () => {
  it("resolves and grades a previously-unresolvable kept past pick once became is populated (the came-home pick fix)", () => {
    const trade = makeTrade();
    trade.sides[0].players = [];
    trade.sides[0].picks = [
      {
        season: "2024",
        round: 1,
        originalFranchise: null,
        became: { id: "rook1", name: "Homegrown Rookie" },
        flippedToTradeId: null,
        voided: false,
      },
    ];
    const rows = [
      row({ playerId: "rook1", seasonYear: 2024, points: 120 }),
      row({ playerId: "rb1", franchiseId: "fb", points: 40 }),
    ];
    const result = computeTradeGrade(
      trade,
      rows,
      NOW_OLD,
      2024,
      values({ rook1: 3000, rb1: 1000 })
    );
    expect(result.sides[0].realizedPoints).toBe(120);
    expect(result.sides[0].valueNow).toBeCloseTo(3000, 5);
  });

  it("excludes an unresolved past kept pick from the value lens denominator instead of pricing it as a future pick", () => {
    const trade = makeTrade();
    trade.sides[0].picks = [
      {
        season: "2024",
        round: 1,
        originalFranchise: null,
        // Drafted (season already played, per latestPlayedSeason 2024 below)
        // but the resulting player is unknown: a resolution gap, not a kept,
        // not-yet-drafted pick, so it must NOT fall back to a pseudo-id price.
        became: null,
        flippedToTradeId: null,
        voided: false,
      },
    ];
    const rows = [
      row({ points: 180 }),
      row({ playerId: "rb1", franchiseId: "fb", points: 20 }),
    ];
    const result = computeTradeGrade(
      trade,
      rows,
      NOW_OLD,
      2024,
      values({ wr1: 1000, rb1: 3000 })
    );
    expect(result.graded).toBe(true);
    // Only wr1 counts toward side 0's value; the unresolved pick contributes
    // no slot at all (not even an uncovered one).
    expect(result.sides[0].valueNow).toBeCloseTo(1000, 5);
  });

  it("ungrades the trade with 'Incomplete draft records for this deal.' when a side's ONLY asset is an unresolved past kept pick", () => {
    const trade = makeTrade();
    trade.sides[0].players = [];
    trade.sides[0].picks = [
      {
        season: "2024",
        round: 1,
        originalFranchise: null,
        became: null,
        flippedToTradeId: null,
        voided: false,
      },
    ];
    const rows = [row({ playerId: "rb1", franchiseId: "fb", points: 500 })];
    const result = computeTradeGrade(
      trade,
      rows,
      NOW_OLD,
      2024,
      values({ rb1: 5000 })
    );
    expect(result.graded).toBe(false);
    expect(result.message).toBe("Incomplete draft records for this deal.");
  });
});

describe("computeTradeGrade wins-impact lens", () => {
  it("lets a swung playoff win rescue the losing side from D to B", () => {
    const rows = [
      row({ seasonYear: 2024, week: 10, points: 20, started: true }),
      row({ seasonYear: 2024, week: 11, points: 100, started: true }),
      row({ playerId: "rb1", franchiseId: "fb", seasonYear: 2024, week: 12, points: 100, started: true }),
    ];
    const v = values({ wr1: 1000, rb1: 5000 });
    const withMatchups = computeTradeGrade(
      makeTrade(),
      rows,
      NOW_OLD,
      undefined,
      v,
      matchupMap({ "2024:10:fa": { isWinner: true, isPlayoff: true, margin: 3 } })
    );
    // D = 1 (all three lenses active); blended_A = .5038 -> r 1.0076 -> B
    expect(withMatchups.sides[0].blendedShare).toBeCloseTo(0.503788, 4);
    expect(withMatchups.sides[0].grade).toBe("B");
    expect(withMatchups.sides[1].blendedShare).toBeCloseTo(0.496212, 4);
    expect(withMatchups.sides[1].grade).toBe("B");

    const withoutMatchups = computeTradeGrade(makeTrade(), rows, NOW_OLD, undefined, v);
    // D = .8 (wins lens inactive); blended_A = .3798 -> r .7596 -> C on the
    // blended curve (D was the old, unblended-curve letter)
    expect(withoutMatchups.sides[0].blendedShare).toBeCloseTo(0.379735, 4);
    expect(withoutMatchups.sides[0].grade).toBe("C");
    expect(withoutMatchups.sides[1].grade).toBe("B+"); // r 1.2405 -> B+ band [1.1, 1.3)
  });

  it("matches the value-only run when matchups are present but nothing swings", () => {
    const rows = [
      row({ seasonYear: 2024, week: 10, points: 20, started: true }),
      row({ seasonYear: 2024, week: 11, points: 100, started: true }),
      row({ playerId: "rb1", franchiseId: "fb", seasonYear: 2024, week: 12, points: 100, started: true }),
    ];
    const v = values({ wr1: 1000, rb1: 5000 });
    const zeroSwings = computeTradeGrade(
      makeTrade(),
      rows,
      NOW_OLD,
      undefined,
      v,
      matchupMap({ "2024:10:fa": { isWinner: true, isPlayoff: true, margin: 25 } }) // 20 <= 25, no swing
    );
    const valueOnly = computeTradeGrade(makeTrade(), rows, NOW_OLD, undefined, v);
    expect(zeroSwings.sides.map((s) => s.grade)).toEqual(valueOnly.sides.map((s) => s.grade));
    expect(zeroSwings.sides.map((s) => s.blendedShare)).toEqual(
      valueOnly.sides.map((s) => s.blendedShare)
    );
  });

  it("matches the value-only run with an explicit empty matchups map", () => {
    const rows = [
      row({ points: 150 }),
      row({ playerId: "rb1", franchiseId: "fb", points: 50 }),
    ];
    const v = values({ wr1: 1000, rb1: 3000 });
    const emptyMatchups = computeTradeGrade(makeTrade(), rows, NOW_OLD, undefined, v, matchupMap({}));
    const noMatchupsArg = computeTradeGrade(makeTrade(), rows, NOW_OLD, undefined, v);
    expect(emptyMatchups.sides.map((s) => s.grade)).toEqual(
      noMatchupsArg.sides.map((s) => s.grade)
    );
  });

  it("weighs a playoff swing above a regular-season swing when points/value are even", () => {
    const rows = [
      row({ seasonYear: 2024, week: 10, points: 100, started: true }),
      row({ playerId: "rb1", franchiseId: "fb", seasonYear: 2024, week: 11, points: 100, started: true }),
    ];
    const v = values({ wr1: 1000, rb1: 1000 });
    const result = computeTradeGrade(
      makeTrade(),
      rows,
      NOW_OLD,
      undefined,
      v,
      matchupMap({
        "2024:10:fa": { isWinner: true, isPlayoff: true, margin: 5 }, // A: playoff swing, impact 2
        "2024:11:fb": { isWinner: true, isPlayoff: false, margin: 5 }, // B: regular swing, impact 1
      })
    );
    expect(result.sides[0].winsShare).toBeCloseTo(2 / 3, 5);
    expect(result.sides[1].winsShare).toBeCloseTo(1 / 3, 5);
    expect(result.sides[0].blendedShare!).toBeGreaterThan(result.sides[1].blendedShare!);
  });

  it("credits a flipped pick's wins-impact via the diluted flip chain, direct count stays zero", () => {
    const matchupsInput = matchupMap({
      "2025:5:fa": { isWinner: true, isPlayoff: false, margin: 10 }, // hampton started 30 > 10
    });
    const grades = computeTradeGrades(hamptonTrades(), hamptonRows, NOW_OLD, undefined, undefined, matchupsInput);
    const trade1 = grades.get(1)!;
    const trade2 = grades.get(2)!;
    expect(trade2.sides[0].weightedWinsImpact).toBeCloseTo(1, 5);
    expect(trade1.sides[0].winsSwung).toBe(0);
    expect(trade1.sides[0].weightedWinsImpact).toBeCloseTo(1 / 3, 5);
  });

  it("requires the started sum to STRICTLY exceed the margin", () => {
    const rowsNoSwing = [row({ seasonYear: 2024, week: 10, points: 20, started: true })];
    const noSwing = computeTradeGrades(
      [makeTrade()],
      rowsNoSwing,
      NOW_OLD,
      undefined,
      undefined,
      matchupMap({ "2024:10:fa": { isWinner: true, isPlayoff: false, margin: 20 } })
    ).get(1)!;
    expect(noSwing.sides[0].weightedWinsImpact).toBe(0);

    const rowsSwing = [row({ seasonYear: 2024, week: 10, points: 20.1, started: true })];
    const swing = computeTradeGrades(
      [makeTrade()],
      rowsSwing,
      NOW_OLD,
      undefined,
      undefined,
      matchupMap({ "2024:10:fa": { isWinner: true, isPlayoff: false, margin: 20 } })
    ).get(1)!;
    expect(swing.sides[0].weightedWinsImpact).toBeCloseTo(1, 5);
  });
});
