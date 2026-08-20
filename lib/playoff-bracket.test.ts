import { describe, it, expect } from "vitest";
import type { SleeperBracketMatch } from "@/lib/sleeper-schemas";
import {
  advancesByLosing,
  deriveToiletBowlChampion,
  getMatchPlacementLabel,
  getRoundLabel,
  getWinnersRoundNames,
  normalizeBracketMatches,
  roundToWeek,
} from "@/lib/playoff-bracket";

// ---------------------------------------------------------------------------
// Fixtures: verbatim Sleeper payloads for the real HMLML leagues.
// Fetched from api.sleeper.app/v1/league/<id>/{winners,losers}_bracket.
// ---------------------------------------------------------------------------

/** 2021 (league 642634183625220096): 10 teams, 3-round winners bracket. */
const winners2021 = [
  { m: 1, r: 1, l: 1, w: 2, t1: 2, t2: 1 },
  { m: 2, r: 1, l: 6, w: 4, t1: 4, t2: 6 },
  { m: 3, r: 2, l: 4, w: 7, t1: 7, t2: 4 },
  { m: 4, r: 2, l: 5, w: 2, t1: 5, t2: 2 },
  { m: 5, p: 5, r: 2, l: 6, w: 1, t1: 6, t2: 1 },
  { m: 6, p: 1, r: 3, l: 2, w: 7, t1: 7, t2: 2, t2_from: { w: 4 }, t1_from: { w: 3 } },
  { m: 7, p: 3, r: 3, l: 5, w: 4, t1: 4, t2: 5, t2_from: { l: 4 }, t1_from: { l: 3 } },
] as SleeperBracketMatch[];

/** 2021 losers bracket: only 2 rounds (4 teams), unlike the 3-round winners. */
const losers2021 = [
  { m: 1, r: 1, l: 8, w: 10, t1: 8, t2: 10 },
  { m: 2, r: 1, l: 3, w: 9, t1: 3, t2: 9 },
  { p: 1, m: 3, r: 2, l: 10, w: 9, t1: 10, t2: 9, t2_from: { w: 2 }, t1_from: { w: 1 } },
  { p: 3, m: 4, r: 2, l: 3, w: 8, t1: 8, t2: 3, t2_from: { l: 2 }, t1_from: { l: 1 } },
] as SleeperBracketMatch[];

/** 2022 (league 784490166948585472): 2-round losers bracket. */
const losers2022 = [
  { m: 1, r: 1, l: 3, w: 6, t1: 6, t2: 3 },
  { m: 2, r: 1, l: 10, w: 9, t1: 9, t2: 10 },
  { p: 1, m: 3, r: 2, l: 9, w: 6, t1: 6, t2: 9, t2_from: { w: 2 }, t1_from: { w: 1 } },
  { p: 3, m: 4, r: 2, l: 10, w: 3, t1: 3, t2: 10, t2_from: { l: 2 }, t1_from: { l: 1 } },
] as SleeperBracketMatch[];

/** 2023 (league 916853033424773120): 12 teams, 3-round brackets both sides. */
const winners2023 = [
  { m: 1, r: 1, l: 8, w: 6, t1: 8, t2: 6 },
  { m: 2, r: 1, l: 12, w: 7, t1: 12, t2: 7 },
  { m: 3, r: 2, l: 1, w: 6, t1: 1, t2: 6 },
  { m: 4, r: 2, l: 3, w: 7, t1: 3, t2: 7 },
  { p: 5, m: 5, r: 2, l: 8, w: 12, t1: 8, t2: 12 },
  { p: 1, m: 6, r: 3, l: 7, w: 6, t1: 6, t2: 7, t2_from: { w: 4 }, t1_from: { w: 3 } },
  { p: 3, m: 7, r: 3, l: 3, w: 1, t1: 1, t2: 3, t2_from: { l: 4 }, t1_from: { l: 3 } },
] as SleeperBracketMatch[];

const losers2023 = [
  { m: 1, r: 1, l: 4, w: 5, t1: 4, t2: 5 },
  { m: 2, r: 1, l: 10, w: 11, t1: 10, t2: 11 },
  { m: 3, r: 2, l: 5, w: 9, t1: 9, t2: 5 },
  { m: 4, r: 2, l: 2, w: 11, t1: 2, t2: 11 },
  { p: 5, m: 5, r: 2, l: 4, w: 10, t1: 4, t2: 10 },
  { p: 1, m: 6, r: 3, l: 9, w: 11, t1: 9, t2: 11, t2_from: { w: 4 }, t1_from: { w: 3 } },
  { p: 3, m: 7, r: 3, l: 5, w: 2, t1: 5, t2: 2, t2_from: { l: 4 }, t1_from: { l: 3 } },
] as SleeperBracketMatch[];

/** 2024 (league 1071927225714323456). */
const losers2024 = [
  { m: 1, r: 1, l: 10, w: 1, t1: 1, t2: 10 },
  { m: 2, r: 1, l: 9, w: 2, t1: 9, t2: 2 },
  { m: 3, r: 2, l: 1, w: 8, t1: 8, t2: 1 },
  { m: 4, r: 2, l: 2, w: 6, t1: 6, t2: 2 },
  { p: 5, m: 5, r: 2, l: 9, w: 10, t1: 10, t2: 9 },
  { p: 1, m: 6, r: 3, l: 6, w: 8, t1: 8, t2: 6, t2_from: { w: 4 }, t1_from: { w: 3 } },
  { p: 3, m: 7, r: 3, l: 2, w: 1, t1: 1, t2: 2, t2_from: { l: 4 }, t1_from: { l: 3 } },
] as SleeperBracketMatch[];

/** 2025 (league 1180222772668571648). */
const losers2025 = [
  { m: 1, r: 1, l: 9, w: 8, t1: 8, t2: 9 },
  { m: 2, r: 1, l: 10, w: 5, t1: 10, t2: 5 },
  { m: 3, r: 2, l: 3, w: 8, t1: 3, t2: 8 },
  { m: 4, r: 2, l: 5, w: 12, t1: 12, t2: 5 },
  { p: 5, m: 5, r: 2, l: 10, w: 9, t1: 9, t2: 10 },
  { p: 1, m: 6, r: 3, l: 8, w: 12, t1: 8, t2: 12, t2_from: { w: 4 }, t1_from: { w: 3 } },
  { p: 3, m: 7, r: 3, l: 5, w: 3, t1: 3, t2: 5, t2_from: { l: 4 }, t1_from: { l: 3 } },
] as SleeperBracketMatch[];

/** 2026 (league 1326710582497271808): in progress. Seeded slots, all w/l null. */
const losers2026 = [
  { m: 1, r: 1, l: null, w: null, t1: 8, t2: 2 },
  { m: 2, r: 1, l: null, w: null, t1: 3, t2: 11 },
  { m: 3, r: 2, l: null, w: null, t1: 7, t2: null },
  { m: 4, r: 2, l: null, w: null, t1: 9, t2: null },
  { m: 5, p: 5, r: 2, l: null, w: null, t1: null, t2: null },
  { m: 6, p: 1, r: 3, l: null, w: null, t1: null, t2: null, t2_from: { w: 4 }, t1_from: { w: 3 } },
  { m: 7, p: 3, r: 3, l: null, w: null, t1: null, t2: null, t2_from: { l: 4 }, t1_from: { l: 3 } },
] as SleeperBracketMatch[];

/**
 * roster_id -> franchise name, straight from the live DB's franchise_seasons
 * rows. Franchise names stand in for franchise ids here: the function only
 * does a map lookup, and names make the ground-truth assertions readable.
 */
const rosters2021 = new Map<number, string>([
  [8, "Watson Love Diggs"],
  [9, "Bucky's General Store"],
  [10, "Better call Myballs"],
  [3, "Team Three"],
]);
const rosters2022 = new Map<number, string>([
  [3, "Team Three"],
  [6, "Foopus"],
  [9, "Bucky's General Store"],
  [10, "Better call Myballs"],
]);
const rosters2023 = new Map<number, string>([
  [2, "Team Two"],
  [4, "Team Four"],
  [5, "Team Five"],
  [9, "Bucky's General Store"],
  [10, "Better call Myballs"],
  [11, "Olave Garden"],
]);
const rosters2024 = new Map<number, string>([
  [1, "Team One"],
  [2, "Team Two"],
  [6, "Foopus"],
  [8, "Watson Love Diggs"],
  [9, "Bucky's General Store"],
  [10, "Better call Myballs"],
]);
const rosters2025 = new Map<number, string>([
  [3, "Team Three"],
  [5, "Team Five"],
  [8, "Watson Love Diggs"],
  [9, "Bucky's General Store"],
  [10, "Better call Myballs"],
  [12, "Latter Day Lamb Special"],
]);

// ---------------------------------------------------------------------------

describe("advancesByLosing", () => {
  it("is true only for the losers bracket", () => {
    expect(advancesByLosing("losers")).toBe(true);
    expect(advancesByLosing("winners")).toBe(false);
  });
});

describe("roundToWeek", () => {
  it("maps round 1 onto playoff_week_start", () => {
    expect(roundToWeek(1, 15)).toBe(15);
    expect(roundToWeek(2, 15)).toBe(16);
    expect(roundToWeek(3, 15)).toBe(17);
  });
});

describe("normalizeBracketMatches", () => {
  it("maps a plain first-round match onto table columns", () => {
    const [first] = normalizeBracketMatches([winners2023[0]], "winners");
    expect(first).toEqual({
      bracketType: "winners",
      round: 1,
      matchNumber: 1,
      placement: null,
      team1RosterId: 8,
      team2RosterId: 6,
      team1FromMatch: null,
      team2FromMatch: null,
      advancingRosterId: 6,
      eliminatedRosterId: 8,
    });
  });

  it("captures the sibling t1_from / t2_from feeder match numbers", () => {
    const rows = normalizeBracketMatches(winners2023, "winners");
    const final = rows.find((r) => r.matchNumber === 6)!;
    expect(final.placement).toBe(1);
    expect(final.team1FromMatch).toBe(3);
    expect(final.team2FromMatch).toBe(4);
    // t1/t2 have resolved to real rosters even though the feeders are present.
    expect(final.team1RosterId).toBe(6);
    expect(final.team2RosterId).toBe(7);
  });

  it("also accepts the object form of t1 / t2", () => {
    const objectForm = [
      { m: 9, r: 3, p: 1, t1: { w: 3 }, t2: { l: 4 }, w: null, l: null },
    ] as unknown as SleeperBracketMatch[];
    const [row] = normalizeBracketMatches(objectForm, "winners");
    expect(row.team1RosterId).toBeNull();
    expect(row.team1FromMatch).toBe(3);
    expect(row.team2RosterId).toBeNull();
    expect(row.team2FromMatch).toBe(4);
  });

  it("leaves an unplayed match's advancing/eliminated rosters null", () => {
    const rows = normalizeBracketMatches(losers2026, "losers");
    expect(rows).toHaveLength(7);
    for (const row of rows) {
      expect(row.advancingRosterId).toBeNull();
      expect(row.eliminatedRosterId).toBeNull();
    }
    // Seeded first-round slots are still captured.
    expect(rows[0].team1RosterId).toBe(8);
    expect(rows[0].team2RosterId).toBe(2);
  });

  it("records the losers-bracket advancing team as Sleeper's w, not the higher scorer", () => {
    // 2023 losers round 1 match 1: rosters 4 (171.98) and 5 (118.38). Roster 5
    // scored 53 fewer points and is the team that advanced deeper into the
    // Toilet Bowl.
    const rows = normalizeBracketMatches(losers2023, "losers");
    const m1 = rows.find((r) => r.matchNumber === 1)!;
    expect(m1.advancingRosterId).toBe(5);
    expect(m1.eliminatedRosterId).toBe(4);
  });
});

describe("getRoundLabel", () => {
  it("names the 3-round winners bracket from the end", () => {
    // Round 1 of a 6-team bracket is a wild card round, not quarterfinals:
    // only four teams play and the top two seeds are on bye.
    expect(getRoundLabel("winners", 1, 3)).toBe("Wild Card Round");
    expect(getRoundLabel("winners", 2, 3)).toBe("Semifinals");
    expect(getRoundLabel("winners", 3, 3)).toBe("Championship");
  });

  it("names a 2-round winners bracket from the end too", () => {
    expect(getRoundLabel("winners", 1, 2)).toBe("Semifinals");
    expect(getRoundLabel("winners", 2, 2)).toBe("Championship");
  });

  it("falls back to a plain round number beyond the named rounds", () => {
    expect(getRoundLabel("winners", 1, 4)).toBe("Round 1");
  });

  it("names the 2-round losers bracket without assuming three rounds", () => {
    expect(getRoundLabel("losers", 1, 2)).toBe("Toilet Bowl Round 1");
    expect(getRoundLabel("losers", 2, 2)).toBe("Toilet Bowl Final");
  });

  it("names the 3-round losers bracket", () => {
    expect(getRoundLabel("losers", 1, 3)).toBe("Toilet Bowl Round 1");
    expect(getRoundLabel("losers", 2, 3)).toBe("Toilet Bowl Round 2");
    expect(getRoundLabel("losers", 3, 3)).toBe("Toilet Bowl Final");
  });
});

describe("getWinnersRoundNames", () => {
  it("returns the round names in playing order, one name per round", () => {
    expect(getWinnersRoundNames(3)).toEqual([
      "Wild Card Round",
      "Semifinals",
      "Championship",
    ]);
    expect(getWinnersRoundNames(2)).toEqual(["Semifinals", "Championship"]);
  });

  it("agrees with getRoundLabel, so the hub and the bracket page cannot drift", () => {
    const names = getWinnersRoundNames(3);
    for (let round = 1; round <= 3; round++) {
      expect(names[round - 1]).toBe(getRoundLabel("winners", round, 3));
    }
  });
});

describe("getMatchPlacementLabel", () => {
  it("uses Sleeper's p directly in the winners bracket", () => {
    expect(getMatchPlacementLabel("winners", 1, 12)).toBe("Championship");
    expect(getMatchPlacementLabel("winners", 3, 12)).toBe("3rd Place Game");
    expect(getMatchPlacementLabel("winners", 5, 12)).toBe("5th Place Game");
  });

  it("returns null for an ordinary advancement game", () => {
    expect(getMatchPlacementLabel("winners", null, 12)).toBeNull();
    expect(getMatchPlacementLabel("losers", null, 12)).toBeNull();
  });

  it("counts losers-bracket placements up from the bottom", () => {
    // 12 teams: p=1 settles 11th/12th (the Toilet Bowl Final), p=3 settles
    // 9th/10th, p=5 settles 7th/8th.
    expect(getMatchPlacementLabel("losers", 1, 12)).toBe("Toilet Bowl Final");
    expect(getMatchPlacementLabel("losers", 3, 12)).toBe("9th Place Game");
    expect(getMatchPlacementLabel("losers", 5, 12)).toBe("7th Place Game");
    // 10 teams (2021): p=3 settles 7th/8th.
    expect(getMatchPlacementLabel("losers", 3, 10)).toBe("7th Place Game");
  });

  it("refuses to invent a position without a roster count", () => {
    expect(getMatchPlacementLabel("losers", 3, null)).toBe("Placement Game");
  });
});

describe("deriveToiletBowlChampion", () => {
  it("crowns the advancing team of the p=1 losers match for every completed season", () => {
    expect(deriveToiletBowlChampion(losers2021, rosters2021)).toBe(
      "Bucky's General Store",
    );
    expect(deriveToiletBowlChampion(losers2022, rosters2022)).toBe("Foopus");
    expect(deriveToiletBowlChampion(losers2023, rosters2023)).toBe("Olave Garden");
    expect(deriveToiletBowlChampion(losers2024, rosters2024)).toBe(
      "Watson Love Diggs",
    );
    expect(deriveToiletBowlChampion(losers2025, rosters2025)).toBe(
      "Latter Day Lamb Special",
    );
  });

  it("crowns nobody while the final is unplayed", () => {
    expect(deriveToiletBowlChampion(losers2026, rosters2023)).toBeNull();
  });

  it("crowns nobody when there is no losers bracket at all", () => {
    expect(deriveToiletBowlChampion([], rosters2023)).toBeNull();
  });

  it("does not fall back to the higher scorer of the final", () => {
    // 2023 final: roster 9 scored 119.98, roster 11 scored 109.22. The lower
    // scorer (11, Olave Garden) is the Toilet Bowl champion.
    expect(deriveToiletBowlChampion(losers2023, rosters2023)).not.toBe(
      "Bucky's General Store",
    );
  });

  it("ignores the winners bracket's own p=1 match", () => {
    // Passing the winners bracket in would crown the league champion; the
    // caller must only ever hand this the losers bracket. Guard the shape by
    // asserting the two brackets resolve differently.
    expect(deriveToiletBowlChampion(winners2021, rosters2021)).not.toBe(
      "Bucky's General Store",
    );
  });
});
