import { describe, it, expect } from "vitest";
import {
  buildTradedAwayPairs,
  bustGroupKey,
  bustShortfall,
  classifyBustOutcome,
  computeBustExpectations,
  dedupePieces,
  franchiseSequenceFor,
  isBustEligible,
  isBustEligibleRound,
  median,
  pickBestFranchiseAndPoints,
  pickSeasonFranchise,
  pickSeasonFranchiseAndPoints,
  pickTopFranchiseByPoints,
  pickTopFranchiseByStarts,
  scopedFranchisePoints,
  wasTradedAwayByDrafter,
  type BustBaselineEntry,
  type PlayerFranchiseWeekRow,
  type RosterFranchiseRow,
  type TradeDropRow,
} from "@/lib/queries/lore";

interface Candidate {
  playerId: string;
  value: number;
}

function candidate(playerId: string, value = 0): Candidate {
  return { playerId, value };
}

describe("dedupePieces", () => {
  it("picks the top candidate from each list when nothing is claimed", () => {
    const [a, b] = dedupePieces(
      [],
      [candidate("p1"), candidate("p2")],
      [candidate("p3"), candidate("p4")],
    );
    expect(a?.playerId).toBe("p1");
    expect(b?.playerId).toBe("p3");
  });

  it("skips a candidate already claimed by a fixed card", () => {
    const [a] = dedupePieces(["p1"], [candidate("p1"), candidate("p2")]);
    expect(a?.playerId).toBe("p2");
  });

  it("claims sequentially: a later list skips a player an earlier list just picked", () => {
    const [a, b] = dedupePieces(
      [],
      [candidate("shared"), candidate("p2")],
      [candidate("shared"), candidate("p4")],
    );
    expect(a?.playerId).toBe("shared");
    expect(b?.playerId).toBe("p4");
  });

  it("returns null when every candidate in a list is already claimed", () => {
    const [a] = dedupePieces(["p1", "p2"], [candidate("p1"), candidate("p2")]);
    expect(a).toBeNull();
  });

  it("returns null for an empty candidate list", () => {
    const [a] = dedupePieces([], [] as Candidate[]);
    expect(a).toBeNull();
  });

  it("does not let a null pick block subsequent lists", () => {
    const [a, b] = dedupePieces(
      ["p1"],
      [candidate("p1")],
      [candidate("p1"), candidate("p2")],
    );
    expect(a).toBeNull();
    expect(b?.playerId).toBe("p2");
  });

  it("accepts a ReadonlySet for claimedIds", () => {
    const claimed = new Set(["p1"]);
    const [a] = dedupePieces(claimed, [candidate("p1"), candidate("p2")]);
    expect(a?.playerId).toBe("p2");
  });
});

function weekRow(
  franchiseId: string,
  seasonYear: number,
  week: number,
  started: boolean,
  points = 0,
): PlayerFranchiseWeekRow {
  return { playerId: "p1", franchiseId, seasonYear, week, started, points };
}

describe("pickSeasonFranchise", () => {
  it("picks the franchise with the most started weeks in that season", () => {
    const rows = [
      weekRow("f1", 2023, 1, true),
      weekRow("f1", 2023, 2, true),
      weekRow("f2", 2023, 3, true),
    ];
    expect(pickSeasonFranchise(rows, 2023)).toBe("f1");
  });

  it("breaks a starts tie by total points that season", () => {
    const rows = [
      weekRow("f1", 2023, 1, true, 10),
      weekRow("f2", 2023, 1, true, 20),
    ];
    expect(pickSeasonFranchise(rows, 2023)).toBe("f2");
  });

  it("ignores benched rows and rows from other seasons", () => {
    const rows = [
      weekRow("f1", 2023, 1, false, 100),
      weekRow("f1", 2024, 1, true, 100),
      weekRow("f2", 2023, 1, true, 1),
    ];
    expect(pickSeasonFranchise(rows, 2023)).toBe("f2");
  });

  it("returns null when there are no started rows that season", () => {
    expect(pickSeasonFranchise([weekRow("f1", 2023, 1, false)], 2023)).toBeNull();
  });
});

describe("pickSeasonFranchiseAndPoints", () => {
  it("returns the dominant franchise and its started points for that season only", () => {
    const rows = [
      weekRow("f1", 2023, 1, true, 10),
      weekRow("f1", 2023, 2, true, 15),
      weekRow("f2", 2024, 1, true, 1000), // different season, must not leak in
    ];
    expect(pickSeasonFranchiseAndPoints(rows, 2023)).toEqual({ franchiseId: "f1", points: 25 });
  });

  it("excludes points scored for a different franchise the same season", () => {
    const rows = [
      weekRow("f1", 2023, 1, true, 10),
      weekRow("f1", 2023, 2, true, 10),
      weekRow("f2", 2023, 3, true, 5), // same season, not the dominant franchise
    ];
    expect(pickSeasonFranchiseAndPoints(rows, 2023)).toEqual({ franchiseId: "f1", points: 20 });
  });

  it("ignores benched rows when totaling the season", () => {
    const rows = [weekRow("f1", 2023, 1, false, 1000), weekRow("f1", 2023, 2, true, 5)];
    expect(pickSeasonFranchiseAndPoints(rows, 2023)).toEqual({ franchiseId: "f1", points: 5 });
  });

  it("returns null when there are no started rows that season", () => {
    expect(pickSeasonFranchiseAndPoints([weekRow("f1", 2023, 1, false)], 2023)).toBeNull();
  });
});

describe("pickTopFranchiseByPoints", () => {
  it("picks the franchise with the most career started points", () => {
    const rows = [
      weekRow("f1", 2022, 1, true, 10),
      weekRow("f1", 2023, 1, true, 10),
      weekRow("f2", 2023, 1, true, 15),
    ];
    expect(pickTopFranchiseByPoints(rows)).toBe("f1");
  });

  it("ignores benched rows", () => {
    const rows = [
      weekRow("f1", 2022, 1, false, 1000),
      weekRow("f2", 2022, 1, true, 5),
    ];
    expect(pickTopFranchiseByPoints(rows)).toBe("f2");
  });

  it("returns null for an empty list", () => {
    expect(pickTopFranchiseByPoints([])).toBeNull();
  });
});

describe("pickTopFranchiseByStarts", () => {
  it("picks the franchise with the most career starts", () => {
    const rows = [
      weekRow("f1", 2022, 1, true),
      weekRow("f1", 2022, 2, true),
      weekRow("f2", 2022, 1, true),
    ];
    expect(pickTopFranchiseByStarts(rows)).toBe("f1");
  });

  it("returns null for an empty list", () => {
    expect(pickTopFranchiseByStarts([])).toBeNull();
  });
});

describe("scopedFranchisePoints", () => {
  it("sums only started points scored for the given franchise", () => {
    const rows = [
      weekRow("f1", 2021, 1, true, 10),
      weekRow("f1", 2021, 2, true, 15),
      weekRow("f2", 2023, 1, true, 100),
    ];
    expect(scopedFranchisePoints(rows, "f1")).toBe(25);
  });

  it("ignores benched rows even for the matching franchise", () => {
    const rows = [weekRow("f1", 2021, 1, false, 50), weekRow("f1", 2021, 2, true, 5)];
    expect(scopedFranchisePoints(rows, "f1")).toBe(5);
  });

  it("returns 0 when the player never scored for that franchise", () => {
    const rows = [weekRow("f2", 2021, 1, true, 50)];
    expect(scopedFranchisePoints(rows, "f1")).toBe(0);
  });

  it("returns 0 for an empty row set", () => {
    expect(scopedFranchisePoints([], "f1")).toBe(0);
  });
});

describe("pickBestFranchiseAndPoints", () => {
  it("returns the franchise with the most started points, and its total", () => {
    const rows = [
      weekRow("f1", 2021, 1, true, 10),
      weekRow("f1", 2022, 1, true, 10),
      weekRow("f2", 2023, 1, true, 15),
    ];
    expect(pickBestFranchiseAndPoints(rows)).toEqual({ franchiseId: "f1", points: 20 });
  });

  it("ignores benched rows when totaling the winning franchise", () => {
    const rows = [weekRow("f1", 2021, 1, false, 1000), weekRow("f2", 2021, 1, true, 5)];
    expect(pickBestFranchiseAndPoints(rows)).toEqual({ franchiseId: "f2", points: 5 });
  });

  it("returns null for an empty row set", () => {
    expect(pickBestFranchiseAndPoints([])).toBeNull();
  });

  it("returns null when the player has rows but none started", () => {
    expect(pickBestFranchiseAndPoints([weekRow("f1", 2021, 1, false, 10)])).toBeNull();
  });
});

describe("franchiseSequenceFor", () => {
  it("orders distinct franchises by first season/week appearance", () => {
    const rows = [
      weekRow("f2", 2023, 3, true),
      weekRow("f1", 2022, 1, true),
      weekRow("f1", 2022, 2, true),
      weekRow("f3", 2023, 1, false),
    ];
    expect(franchiseSequenceFor(rows)).toEqual(["f1", "f3", "f2"]);
  });

  it("returns an empty array for no rows", () => {
    expect(franchiseSequenceFor([])).toEqual([]);
  });

  it("includes benched-only franchises (rostered, not just started)", () => {
    const rows = [weekRow("f1", 2022, 1, false)];
    expect(franchiseSequenceFor(rows)).toEqual(["f1"]);
  });
});

describe("isBustEligible", () => {
  it("is eligible once the latest completed season is at least a year after the draft", () => {
    expect(isBustEligible(2022, 2023)).toBe(true);
    expect(isBustEligible(2022, 2024)).toBe(true);
  });

  it("is not eligible for a draft from the latest completed season or later", () => {
    expect(isBustEligible(2023, 2023)).toBe(false);
    expect(isBustEligible(2024, 2023)).toBe(false);
  });
});

describe("buildTradedAwayPairs / wasTradedAwayByDrafter", () => {
  const rosterFranchiseRows: RosterFranchiseRow[] = [
    { seasonId: 1, rosterId: "5", franchiseId: "f1" },
    { seasonId: 2, rosterId: "5", franchiseId: "f2" }, // same roster_id, different season/franchise
  ];

  it("marks a player traded away by the franchise that dropped him that season", () => {
    const tradeDrops: TradeDropRow[] = [{ playerId: "p1", rosterId: "5", seasonId: 1 }];
    const pairs = buildTradedAwayPairs(tradeDrops, rosterFranchiseRows);
    expect(wasTradedAwayByDrafter(pairs, "p1", "f1")).toBe(true);
    expect(wasTradedAwayByDrafter(pairs, "p1", "f2")).toBe(false);
  });

  it("scopes roster_id -> franchise resolution by season (same roster_id, different seasons)", () => {
    const tradeDrops: TradeDropRow[] = [{ playerId: "p1", rosterId: "5", seasonId: 2 }];
    const pairs = buildTradedAwayPairs(tradeDrops, rosterFranchiseRows);
    expect(wasTradedAwayByDrafter(pairs, "p1", "f2")).toBe(true);
    expect(wasTradedAwayByDrafter(pairs, "p1", "f1")).toBe(false);
  });

  it("drops without a resolvable roster/season pair are ignored", () => {
    const tradeDrops: TradeDropRow[] = [{ playerId: "p1", rosterId: "99", seasonId: 1 }];
    const pairs = buildTradedAwayPairs(tradeDrops, rosterFranchiseRows);
    expect(pairs.size).toBe(0);
  });

  it("returns an empty set for no trade drops", () => {
    expect(buildTradedAwayPairs([], rosterFranchiseRows).size).toBe(0);
  });
});

describe("classifyBustOutcome", () => {
  it("classifies a still-rostered player as 'rostered'", () => {
    expect(classifyBustOutcome(true)).toBe("rostered");
  });

  it("classifies a dropped player as 'dropped'", () => {
    expect(classifyBustOutcome(false)).toBe("dropped");
  });
});

describe("isBustEligibleRound", () => {
  it("allows startup rounds 1 through 6", () => {
    expect(isBustEligibleRound("startup", 1)).toBe(true);
    expect(isBustEligibleRound("startup", 6)).toBe(true);
  });

  it("rejects startup rounds outside 1-6 (Draft Steal's territory starts at 8)", () => {
    expect(isBustEligibleRound("startup", 7)).toBe(false);
    expect(isBustEligibleRound("startup", 8)).toBe(false);
  });

  it("allows only round 1 for rookie drafts", () => {
    expect(isBustEligibleRound("rookie", 1)).toBe(true);
    expect(isBustEligibleRound("rookie", 2)).toBe(false);
    expect(isBustEligibleRound("rookie", 6)).toBe(false);
  });
});

describe("bustGroupKey", () => {
  it("buckets startup picks by round", () => {
    expect(bustGroupKey("startup", 1)).toBe("startup:1");
    expect(bustGroupKey("startup", 6)).toBe("startup:6");
  });

  it("buckets all rookie round-1 picks into one group regardless of round passed in", () => {
    expect(bustGroupKey("rookie", 1)).toBe("rookie:1");
  });
});

describe("median", () => {
  it("returns the middle value for an odd-length list", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("averages the two middle values for an even-length list", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("returns the single value for a one-element list", () => {
    expect(median([42])).toBe(42);
  });

  it("returns 0 for an empty list", () => {
    expect(median([])).toBe(0);
  });
});

describe("computeBustExpectations", () => {
  it("computes the median scoped points per group", () => {
    const baseline: BustBaselineEntry[] = [
      { groupKey: "startup:1", scopedPts: 100 },
      { groupKey: "startup:1", scopedPts: 200 },
      { groupKey: "startup:1", scopedPts: 300 },
      { groupKey: "startup:6", scopedPts: 10 },
      { groupKey: "startup:6", scopedPts: 20 },
    ];
    const expectations = computeBustExpectations(baseline);
    expect(expectations.get("startup:1")).toBe(200);
    expect(expectations.get("startup:6")).toBe(15);
  });

  it("returns an empty map for no baseline entries", () => {
    expect(computeBustExpectations([]).size).toBe(0);
  });
});

describe("bustShortfall", () => {
  it("is positive when actual falls short of expected", () => {
    expect(bustShortfall(200, 50)).toBe(150);
  });

  it("is negative when actual exceeds expected", () => {
    expect(bustShortfall(100, 150)).toBe(-50);
  });

  it("is zero when actual matches expected exactly", () => {
    expect(bustShortfall(100, 100)).toBe(0);
  });
});
