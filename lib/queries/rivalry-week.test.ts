import { describe, it, expect } from "vitest";
import { detectMutualTopRivals, rivalryPairKey } from "@/lib/queries/rivalry-week";
import type { RivalrySummary } from "@/lib/queries/records";

// Minimal RivalrySummary builder — only the fields detectMutualTopRivals reads
// matter (ids, record, totalGames); identity/branding are filler.
function rivalry(
  idA: string,
  idB: string,
  wins: number,
  losses: number,
  totalGames: number
): RivalrySummary {
  const f = (id: string) => ({
    id,
    slug: id,
    name: id,
    avatarUrl: null,
  });
  return {
    franchiseA: f(idA),
    franchiseB: f(idB),
    record: { wins, losses, ties: 0, streak: null },
    totalGames,
  };
}

describe("detectMutualTopRivals", () => {
  it("returns a pairing when two teams are each other's most-played opponent", () => {
    const rivalries = [
      rivalry("a", "b", 5, 5, 10), // a & b: 10 games, dead even
      rivalry("a", "c", 2, 1, 3),
      rivalry("b", "c", 1, 2, 3),
    ];
    const result = detectMutualTopRivals(rivalries);
    expect(result.has(rivalryPairKey("a", "b"))).toBe(true);
    expect(result.size).toBe(1);
  });

  it("does not pair teams below the minimum lifetime meeting count", () => {
    const rivalries = [rivalry("a", "b", 1, 1, 2)]; // only 2 games
    expect(detectMutualTopRivals(rivalries).size).toBe(0);
  });

  it("does not pair when the top-rival relationship is not mutual", () => {
    // a's most-played is b, but b's most-played is c (not a).
    const rivalries = [
      rivalry("a", "b", 3, 3, 6),
      rivalry("b", "c", 4, 4, 8),
      rivalry("a", "c", 1, 2, 3),
    ];
    const result = detectMutualTopRivals(rivalries);
    // b's top rival is c (8 > 6); c's top rival is b (8 > 3) -> mutual.
    expect(result.has(rivalryPairKey("b", "c"))).toBe(true);
    // a's top rival is b, but b's is c -> a/b not mutual.
    expect(result.has(rivalryPairKey("a", "b"))).toBe(false);
  });

  it("breaks a games-played tie toward the closer all-time record", () => {
    // a has two opponents with 6 games each; b is the closer record (0 gap).
    const rivalries = [
      rivalry("a", "b", 3, 3, 6), // gap 0
      rivalry("a", "c", 5, 1, 6), // gap 4
      rivalry("b", "a", 3, 3, 6), // mirror not needed but harmless
    ];
    const result = detectMutualTopRivals(rivalries);
    // a's top rival is b (closer record); need b's top rival to be a for mutual.
    expect(result.has(rivalryPairKey("a", "b"))).toBe(true);
  });

  it("returns empty for no rivalries (offseason / no history)", () => {
    expect(detectMutualTopRivals([]).size).toBe(0);
  });
});
