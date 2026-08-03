import { describe, expect, it } from "vitest";
import { isVoidedPick } from "./voided-picks";

describe("isVoidedPick", () => {
  it.each([
    [2022, "2023", true],
    [2022, "2024", true],
    [2023, "2023", false],
    [2021, "2021", false],
    [2022, "2022", false],
  ])("isVoidedPick(%i, %s) === %s", (tradeSeasonYear, pickSeason, expected) => {
    expect(isVoidedPick(tradeSeasonYear, pickSeason)).toBe(expected);
  });
});
