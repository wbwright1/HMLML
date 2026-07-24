import { describe, it, expect } from "vitest";
import { ringlessLeaderIds, type CareerTotalsForGating } from "./superlatives";

function totals(
  franchiseId: string,
  wins: number,
  losses: number,
  pointsFor: number,
  wonTitle = false,
  ties = 0,
): CareerTotalsForGating {
  return { franchiseId, wins, losses, ties, pointsFor, wonTitle };
}

describe("ringlessLeaderIds (truth gate for Empty Calories / The Nearly Man)", () => {
  it("picks the league-wide PF leader among never-champions only", () => {
    const { pfLeaderIds } = ringlessLeaderIds([
      totals("champ", 40, 10, 12000, true),
      totals("tokyo", 30, 20, 9966.2),
      totals("vanilla", 25, 25, 9114.1),
    ]);
    expect(pfLeaderIds).toEqual(new Set(["tokyo"]));
  });

  it("excludes champions even when they lead outright in PF", () => {
    const { pfLeaderIds } = ringlessLeaderIds([
      totals("champ", 40, 10, 12000, true),
      totals("ringless", 20, 30, 8000),
    ]);
    expect(pfLeaderIds).toEqual(new Set(["ringless"]));
  });

  it("picks the best win pct among never-champions for the record leader", () => {
    const { recordLeaderIds } = ringlessLeaderIds([
      totals("champ", 45, 5, 11000, true),
      totals("nearly", 35, 15, 9000),
      totals("mid", 25, 25, 9500),
    ]);
    expect(recordLeaderIds).toEqual(new Set(["nearly"]));
  });

  it("counts ties as half a win in the record comparison", () => {
    const { recordLeaderIds } = ringlessLeaderIds([
      // 30-20-0 = .600 vs 29-19-2 = .600: exact tie, both are co-leaders.
      totals("a", 30, 20, 9000),
      totals("b", 29, 19, 9000, false, 2),
    ]);
    expect(recordLeaderIds).toEqual(new Set(["a", "b"]));
  });

  it("includes every co-leader on an exact PF tie", () => {
    const { pfLeaderIds } = ringlessLeaderIds([
      totals("a", 20, 30, 9500),
      totals("b", 30, 20, 9500),
      totals("c", 25, 25, 9000),
    ]);
    expect(pfLeaderIds).toEqual(new Set(["a", "b"]));
  });

  it("returns empty sets when every franchise has a title", () => {
    const { pfLeaderIds, recordLeaderIds } = ringlessLeaderIds([
      totals("a", 30, 20, 9500, true),
      totals("b", 20, 30, 8000, true),
    ]);
    expect(pfLeaderIds.size).toBe(0);
    expect(recordLeaderIds.size).toBe(0);
  });

  it("returns empty sets for zero-PF and zero-game inputs", () => {
    const { pfLeaderIds, recordLeaderIds } = ringlessLeaderIds([
      totals("empty", 0, 0, 0),
    ]);
    expect(pfLeaderIds.size).toBe(0);
    expect(recordLeaderIds.size).toBe(0);
  });

  it("returns empty sets for an empty league", () => {
    const { pfLeaderIds, recordLeaderIds } = ringlessLeaderIds([]);
    expect(pfLeaderIds.size).toBe(0);
    expect(recordLeaderIds.size).toBe(0);
  });
});
