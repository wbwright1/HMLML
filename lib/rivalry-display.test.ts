import { describe, expect, it } from "vitest";
import {
  formatSeriesRecord,
  namedRivalriesFor,
  seriesRecordFor,
  seriesStanding,
  type PairSummary,
} from "./rivalry-display";

const summaries: PairSummary[] = [
  {
    franchiseA: { id: "a" },
    franchiseB: { id: "b" },
    record: { wins: 4, losses: 1, ties: 0 },
    totalGames: 5,
  },
  {
    franchiseA: { id: "b" },
    franchiseB: { id: "c" },
    record: { wins: 2, losses: 2, ties: 1 },
    totalGames: 5,
  },
];

describe("seriesRecordFor", () => {
  it("returns the record as stored when the franchise is side A", () => {
    expect(seriesRecordFor(summaries, "a", "b")).toEqual({
      wins: 4,
      losses: 1,
      ties: 0,
      totalGames: 5,
    });
  });

  it("flips wins and losses when the franchise is side B", () => {
    expect(seriesRecordFor(summaries, "b", "a")).toEqual({
      wins: 1,
      losses: 4,
      ties: 0,
      totalGames: 5,
    });
  });

  it("returns null for a pair that has never played", () => {
    expect(seriesRecordFor(summaries, "a", "c")).toBeNull();
  });
});

describe("namedRivalriesFor", () => {
  const list = [
    { franchiseAId: "a", franchiseBId: "b", name: "One" },
    { franchiseAId: "b", franchiseBId: "c", name: "Two" },
    { franchiseAId: "c", franchiseBId: "d", name: "Three" },
  ];

  it("finds the franchise on either side and names the opponent", () => {
    expect(namedRivalriesFor(list, "b").map((r) => [r.rivalry.name, r.opponentId])).toEqual([
      ["One", "a"],
      ["Two", "c"],
    ]);
  });

  it("returns nothing for a franchise with no named rivalry", () => {
    expect(namedRivalriesFor(list, "z")).toEqual([]);
  });
});

describe("seriesStanding and formatSeriesRecord", () => {
  it("classifies each side of the series", () => {
    expect(seriesStanding(null)).toBe("unplayed");
    expect(seriesStanding({ wins: 0, losses: 0, ties: 0, totalGames: 0 })).toBe("unplayed");
    expect(seriesStanding({ wins: 3, losses: 1, ties: 0, totalGames: 4 })).toBe("leads");
    expect(seriesStanding({ wins: 1, losses: 3, ties: 0, totalGames: 4 })).toBe("trails");
    expect(seriesStanding({ wins: 4, losses: 4, ties: 0, totalGames: 8 })).toBe("tied");
  });

  it("formats ties only when there are any", () => {
    expect(formatSeriesRecord({ wins: 4, losses: 4, ties: 0, totalGames: 8 })).toBe("4-4");
    expect(formatSeriesRecord({ wins: 2, losses: 2, ties: 1, totalGames: 5 })).toBe("2-2-1");
  });
});
