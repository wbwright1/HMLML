import { describe, it, expect } from "vitest";
import { sortGamesChronologically } from "./game-chronology";

// The live seasons table, for reference: 2026=id 1, 2023=3, 2024=4, 2025=5,
// 2021=7, 2022=8. Sorting by id puts 2021/2022 LAST, which is what made both
// streak calculations report backwards.
const LIVE_SEASON_IDS: Record<number, number> = {
  2026: 1,
  2023: 3,
  2024: 4,
  2025: 5,
  2021: 7,
  2022: 8,
};

describe("sortGamesChronologically", () => {
  const games = [
    { seasonYear: 2025, week: 5, winner: "foopus" },
    { seasonYear: 2023, week: 9, winner: "foopus" },
    { seasonYear: 2022, week: 10, winner: "hall" },
    { seasonYear: 2022, week: 3, winner: "hall" },
    { seasonYear: 2021, week: 12, winner: "foopus" },
  ];

  it("puts the most recent game last", () => {
    const sorted = sortGamesChronologically(games);
    expect(sorted.map((g) => `${g.seasonYear}w${g.week}`)).toEqual([
      "2021w12",
      "2022w3",
      "2022w10",
      "2023w9",
      "2025w5",
    ]);
  });

  it("disagrees with insertion-order season ids, which is the whole point", () => {
    const byYear = sortGamesChronologically(games);
    const byId = [...games].sort(
      (a, b) =>
        LIVE_SEASON_IDS[a.seasonYear] - LIVE_SEASON_IDS[b.seasonYear] ||
        a.week - b.week
    );
    // The id sort ends on a 2022 Hall win; the truth ends on a 2025 Foopus win.
    expect(byId.at(-1)?.winner).toBe("hall");
    expect(byYear.at(-1)?.winner).toBe("foopus");
  });

  it("does not mutate the input", () => {
    const input = [...games];
    sortGamesChronologically(input);
    expect(input).toEqual(games);
  });
});
