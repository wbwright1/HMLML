import { describe, it, expect } from "vitest";
import {
  finishFromWinnersBracket,
  rookieDraftOrder,
  type DraftOrderTeam,
} from "@/lib/rookie-draft-order";

const team = (franchiseId: string, wins: number, losses: number, maxPointsFor: number | null): DraftOrderTeam => ({
  franchiseId,
  wins,
  losses,
  ties: 0,
  maxPointsFor,
});

// Real 2026 regular season after week 11 (Sleeper, 2026-11-24): record and
// Max PF. The projected field is MCC, ROG, TTT, BCM, LDL, BGS.
const TEAMS = [
  team("TTT", 9, 2, 2091.18),
  team("VV", 2, 9, 1384.56),
  team("OMM", 3, 8, 1607.78),
  team("MCC", 10, 1, 2188.28),
  team("BCH", 3, 8, 1466.98),
  team("FOO", 4, 7, 1482.92),
  team("TB", 4, 7, 1674.88),
  team("KWO", 5, 6, 1551.64),
  team("BGS", 5, 6, 1452.1),
  team("BCM", 6, 5, 1620.9),
  team("ROG", 9, 2, 1972.74),
  team("LDL", 6, 5, 1796.66),
];
const FIELD = ["MCC", "ROG", "TTT", "BCM", "LDL", "BGS"];

describe("rookieDraftOrder", () => {
  it("in season: non-playoff teams by lowest Max PF, every playoff slot TBD", () => {
    const slots = rookieDraftOrder(TEAMS, {
      field: FIELD,
      fifthSixth: null,
      fourth: null,
      third: null,
      runnerUp: null,
      champion: null,
    });
    expect(slots.map((s) => s.franchiseId)).toEqual([
      "VV",
      "BCH",
      "FOO",
      "KWO",
      "OMM", // 3-8 but a higher Max PF than 5-6 KWO: Max PF, not record
      "TB",
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(slots.map((s) => s.pick)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("after the playoffs: 5th/6th by Max PF, then 4th, 3rd, 2nd, champion last", () => {
    const slots = rookieDraftOrder(TEAMS, {
      field: FIELD,
      fifthSixth: ["LDL", "BGS"],
      fourth: "TTT",
      third: "BCM",
      runnerUp: "ROG",
      champion: "MCC",
    });
    expect(slots.slice(6).map((s) => [s.franchiseId, s.basis])).toEqual([
      ["BGS", "5th/6th place (Max PF)"], // 1452.10 < LDL 1796.66
      ["LDL", "5th/6th place (Max PF)"],
      ["TTT", "4th place"],
      ["BCM", "3rd place"],
      ["ROG", "2nd place"],
      ["MCC", "champion"],
    ]);
  });

  it("a Max PF tie goes to the worse record", () => {
    const slots = rookieDraftOrder(
      [team("a", 5, 6, 1500), team("b", 3, 8, 1500), ...TEAMS.slice(0, 6).map((t) => ({ ...t, maxPointsFor: 9999 }))],
      { field: TEAMS.slice(0, 6).map((t) => t.franchiseId), fifthSixth: null, fourth: null, third: null, runnerUp: null, champion: null },
    );
    expect(slots.slice(0, 2).map((s) => s.franchiseId)).toEqual(["b", "a"]);
  });

  it("with no field yet, every slot is TBD", () => {
    const slots = rookieDraftOrder(TEAMS, {
      field: null,
      fifthSixth: null,
      fourth: null,
      third: null,
      runnerUp: null,
      champion: null,
    });
    expect(slots).toHaveLength(12);
    expect(slots.every((s) => s.franchiseId === null)).toBe(true);
  });
});

describe("finishFromWinnersBracket", () => {
  it("reads the real 2025 bracket (Sleeper payload shape)", () => {
    // 2025: seeds 1 Beau(11), 2 Wheeler(4), 3 Blake(1), 4 Batson(7),
    // 5 Jackson(2), 6 Daniel(6). Beau won it all; Daniel took 3rd.
    const matches = [
      { round: 1, placement: null, team1RosterId: 7, team2RosterId: 2, advancingRosterId: 2, eliminatedRosterId: 7 },
      { round: 1, placement: null, team1RosterId: 6, team2RosterId: 1, advancingRosterId: 6, eliminatedRosterId: 1 },
      { round: 2, placement: null, team1RosterId: 11, team2RosterId: 6, advancingRosterId: 11, eliminatedRosterId: 6 },
      { round: 2, placement: null, team1RosterId: 4, team2RosterId: 2, advancingRosterId: 2, eliminatedRosterId: 4 },
      { round: 2, placement: 5, team1RosterId: 1, team2RosterId: 7, advancingRosterId: 1, eliminatedRosterId: 7 },
      { round: 3, placement: 1, team1RosterId: 11, team2RosterId: 2, advancingRosterId: 11, eliminatedRosterId: 2 },
      { round: 3, placement: 3, team1RosterId: 6, team2RosterId: 4, advancingRosterId: 6, eliminatedRosterId: 4 },
    ];
    const r2f = new Map([1, 2, 4, 6, 7, 11].map((r) => [r, `r${r}`]));
    const finish = finishFromWinnersBracket(matches, r2f);
    expect(new Set(finish.field)).toEqual(new Set(["r1", "r2", "r4", "r6", "r7", "r11"]));
    expect(finish.fifthSixth).toEqual(["r7", "r1"]);
    expect(finish.fourth).toBe("r4");
    expect(finish.third).toBe("r6");
    expect(finish.runnerUp).toBe("r2");
    expect(finish.champion).toBe("r11");
  });

  it("leaves unplayed results null", () => {
    const finish = finishFromWinnersBracket(
      [{ round: 1, placement: null, team1RosterId: 7, team2RosterId: 2, advancingRosterId: null, eliminatedRosterId: null }],
      new Map([[7, "a"], [2, "b"]]),
    );
    expect(finish.fifthSixth).toBeNull();
    expect(finish.champion).toBeNull();
  });
});
