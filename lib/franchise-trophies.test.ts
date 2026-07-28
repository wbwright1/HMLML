import { describe, expect, it } from "vitest";
import {
  buildFranchiseTrophies,
  groupFranchiseTrophies,
  type FranchiseTrophySeason,
} from "@/lib/franchise-trophies";
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

function season(partial: Partial<FranchiseTrophySeason>): FranchiseTrophySeason {
  return {
    seasonYear: 2023,
    playoffResult: null,
    wins: 10,
    losses: 4,
    ties: 0,
    ...partial,
  };
}

describe("buildFranchiseTrophies", () => {
  it("orders championships year-descending, before player awards", () => {
    const trophies = buildFranchiseTrophies(
      [
        season({ seasonYear: 2021, playoffResult: "champion" }),
        season({ seasonYear: 2023, playoffResult: "champion" }),
        season({ seasonYear: 2022, playoffResult: "runner_up" }),
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

  it("carries season wins/losses/ties on the championship trophy", () => {
    const trophies = buildFranchiseTrophies(
      [season({ seasonYear: 2022, playoffResult: "champion", wins: 11, losses: 3, ties: 0 })],
      [],
    );
    expect(trophies[0]).toMatchObject({
      kind: "championship",
      seasonYear: 2022,
      wins: 11,
      losses: 3,
      ties: 0,
    });
  });

  it("excludes non-champion playoff results (no runner-up/finalist filler)", () => {
    const trophies = buildFranchiseTrophies(
      [
        season({ seasonYear: 2022, playoffResult: "runner_up" }),
        season({ seasonYear: 2021, playoffResult: "semifinalist" }),
      ],
      [],
    );
    expect(trophies).toEqual([]);
  });

  it("groups player awards by the Trophy Case award order (championship MVP, regular season MVP, rookie of the year)", () => {
    const trophies = buildFranchiseTrophies(
      [],
      [
        award({ id: 1, seasonYear: 2023, awardType: "regular_season_mvp" }),
        award({ id: 2, seasonYear: 2022, awardType: "championship_mvp" }),
        award({ id: 3, seasonYear: 2021, awardType: "rookie_of_year" }),
      ],
    );
    expect(
      trophies.map((t) => (t.kind === "award" ? t.awardType : t.kind)),
    ).toEqual(["championship_mvp", "regular_season_mvp", "rookie_of_year"]);
  });

  it("gives repeat winners one card each", () => {
    const trophies = buildFranchiseTrophies(
      [
        season({ seasonYear: 2022, playoffResult: "champion" }),
        season({ seasonYear: 2019, playoffResult: "champion" }),
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

describe("groupFranchiseTrophies", () => {
  it("groups into one row per type: championship first, then Trophy Case award order", () => {
    const trophies = buildFranchiseTrophies(
      [season({ seasonYear: 2022, playoffResult: "champion" })],
      [
        award({ id: 1, seasonYear: 2023, awardType: "regular_season_mvp" }),
        award({ id: 2, seasonYear: 2022, awardType: "championship_mvp" }),
        award({ id: 3, seasonYear: 2021, awardType: "rookie_of_year" }),
      ],
    );

    const groups = groupFranchiseTrophies(trophies);
    expect(groups.map((g) => g.key)).toEqual([
      "championship",
      "championship_mvp",
      "regular_season_mvp",
      "rookie_of_year",
    ]);
    expect(groups[0].label).toBe("League Champion");
  });

  it("omits award-type groups with zero wins", () => {
    const trophies = buildFranchiseTrophies(
      [],
      [award({ id: 1, seasonYear: 2023, awardType: "rookie_of_year" })],
    );
    const groups = groupFranchiseTrophies(trophies);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("rookie_of_year");
  });
});
