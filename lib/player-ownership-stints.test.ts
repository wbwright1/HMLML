import { describe, it, expect } from "vitest";
import { computeOwnershipStints, type OwnershipPresence } from "./player-ownership-stints";

describe("computeOwnershipStints", () => {
  it("CeeDee Lamb case: Tokyo 2021-2022, LDLS 2023-2024, Tokyo 2024-2026 (mid-season trade wk10/11 2024) -> 3 stints, Tokyo appearing twice", () => {
    const presence: OwnershipPresence[] = [
      { franchiseId: "tokyo", seasonYear: 2021, minWeek: 1 },
      { franchiseId: "tokyo", seasonYear: 2022, minWeek: 1 },
      { franchiseId: "ldls", seasonYear: 2023, minWeek: 1 },
      { franchiseId: "ldls", seasonYear: 2024, minWeek: 1 },
      { franchiseId: "tokyo", seasonYear: 2024, minWeek: 11 },
      { franchiseId: "tokyo", seasonYear: 2025, minWeek: 1 },
      { franchiseId: "tokyo", seasonYear: 2026, minWeek: 1 },
    ];

    const stints = computeOwnershipStints(presence);

    expect(stints).toEqual([
      { franchiseId: "tokyo", firstSeasonYear: 2021, lastSeasonYear: 2022 },
      { franchiseId: "ldls", firstSeasonYear: 2023, lastSeasonYear: 2024 },
      { franchiseId: "tokyo", firstSeasonYear: 2024, lastSeasonYear: 2026 },
    ]);
    expect(stints.filter((s) => s.franchiseId === "tokyo")).toHaveLength(2);
  });

  it("single-season stint", () => {
    const presence: OwnershipPresence[] = [
      { franchiseId: "a", seasonYear: 2023, minWeek: 3 },
    ];
    expect(computeOwnershipStints(presence)).toEqual([
      { franchiseId: "a", firstSeasonYear: 2023, lastSeasonYear: 2023 },
    ]);
  });

  it("same-year A->B->A: within-season dedupe collapses repeated same-franchise weeks, leaving A then B chronologically", () => {
    // Two rows for franchise A in the same season dedupe to one (min week
    // kept), so a within-season A -> B -> A oscillation reads as A -> B.
    const presence: OwnershipPresence[] = [
      { franchiseId: "a", seasonYear: 2024, minWeek: 1 },
      { franchiseId: "b", seasonYear: 2024, minWeek: 5 },
      { franchiseId: "a", seasonYear: 2024, minWeek: 10 },
    ];
    expect(computeOwnershipStints(presence)).toEqual([
      { franchiseId: "a", firstSeasonYear: 2024, lastSeasonYear: 2024 },
      { franchiseId: "b", firstSeasonYear: 2024, lastSeasonYear: 2024 },
    ]);
  });

  it("three-way return across seasons: A, B, C, A -> 4 separate stints (non-adjacent A not merged)", () => {
    const presence: OwnershipPresence[] = [
      { franchiseId: "a", seasonYear: 2021, minWeek: 1 },
      { franchiseId: "b", seasonYear: 2022, minWeek: 1 },
      { franchiseId: "c", seasonYear: 2023, minWeek: 1 },
      { franchiseId: "a", seasonYear: 2024, minWeek: 1 },
    ];
    expect(computeOwnershipStints(presence)).toEqual([
      { franchiseId: "a", firstSeasonYear: 2021, lastSeasonYear: 2021 },
      { franchiseId: "b", firstSeasonYear: 2022, lastSeasonYear: 2022 },
      { franchiseId: "c", firstSeasonYear: 2023, lastSeasonYear: 2023 },
      { franchiseId: "a", firstSeasonYear: 2024, lastSeasonYear: 2024 },
    ]);
  });

  it("roster-only null-week ordering: a null minWeek sorts after a known week within the same season", () => {
    const presence: OwnershipPresence[] = [
      { franchiseId: "b", seasonYear: 2024, minWeek: null },
      { franchiseId: "a", seasonYear: 2024, minWeek: 4 },
    ];
    // franchise "a" (week 4, known) should sort before franchise "b" (null ->
    // Infinity) within 2024, so "a" is the first stint despite input order.
    expect(computeOwnershipStints(presence)).toEqual([
      { franchiseId: "a", firstSeasonYear: 2024, lastSeasonYear: 2024 },
      { franchiseId: "b", firstSeasonYear: 2024, lastSeasonYear: 2024 },
    ]);
  });

  it("empty presence returns no stints", () => {
    expect(computeOwnershipStints([])).toEqual([]);
  });
});
