import { describe, expect, it } from "vitest";
import { buildFranchiseTrophies } from "@/lib/franchise-trophies";
import type { AwardEntry } from "@/lib/queries/awards";

function award(partial: Partial<AwardEntry>): AwardEntry {
  return {
    id: 1,
    awardType: "regular_season_mvp",
    seasonYear: 2023,
    playerId: "1234",
    playerName: "Test Player",
    position: "RB",
    franchise: null,
    note: null,
    ...partial,
  };
}

describe("buildFranchiseTrophies", () => {
  it("orders championships year-descending, before player awards", () => {
    const trophies = buildFranchiseTrophies(
      [
        { seasonYear: 2021, playoffResult: "champion" },
        { seasonYear: 2023, playoffResult: "champion" },
        { seasonYear: 2022, playoffResult: "runner_up" },
      ],
      [award({ seasonYear: 2020 })],
    );

    expect(trophies.map((t) => t.kind)).toEqual([
      "championship",
      "championship",
      "award",
    ]);
    expect(
      trophies
        .filter((t) => t.kind === "championship")
        .map((t) => t.seasonYear),
    ).toEqual([2023, 2021]);
  });

  it("excludes non-champion playoff results (no runner-up/finalist filler)", () => {
    const trophies = buildFranchiseTrophies(
      [
        { seasonYear: 2022, playoffResult: "runner_up" },
        { seasonYear: 2021, playoffResult: "semifinalist" },
      ],
      [],
    );
    expect(trophies).toEqual([]);
  });

  it("preserves the season-descending order of player awards as given", () => {
    const trophies = buildFranchiseTrophies(
      [],
      [
        award({ id: 1, seasonYear: 2023, awardType: "regular_season_mvp" }),
        award({ id: 2, seasonYear: 2023, awardType: "championship_mvp" }),
        award({ id: 3, seasonYear: 2021, awardType: "rookie_of_year" }),
      ],
    );
    expect(trophies.map((t) => t.seasonYear)).toEqual([2023, 2023, 2021]);
  });

  it("gives repeat winners one card each", () => {
    const trophies = buildFranchiseTrophies(
      [
        { seasonYear: 2022, playoffResult: "champion" },
        { seasonYear: 2019, playoffResult: "champion" },
      ],
      [],
    );
    expect(trophies).toHaveLength(2);
  });

  it("drops awards with an unrecognized award type", () => {
    const trophies = buildFranchiseTrophies(
      [],
      // @ts-expect-error deliberately invalid award type for defensive test
      [award({ awardType: "best_dressed" })],
    );
    expect(trophies).toEqual([]);
  });

  it("returns an empty array for a franchise with no hardware", () => {
    expect(buildFranchiseTrophies([], [])).toEqual([]);
  });
});
