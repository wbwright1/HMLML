import { describe, it, expect } from "vitest";
import { buildWeeklyLines, formatStatSummary } from "./weekly-line-model";
import type {
  PlayerWeeklyPointRow,
  PlayerWeeklyStatRow,
} from "@/lib/queries/player-profile";

function statRow(overrides: Partial<PlayerWeeklyStatRow> = {}): PlayerWeeklyStatRow {
  return {
    week: 1,
    position: null,
    gamesPlayed: 1,
    passYd: null,
    passTd: null,
    passInt: null,
    passAtt: null,
    passCmp: null,
    rushYd: null,
    rushTd: null,
    rushAtt: null,
    rec: null,
    recYd: null,
    recTd: null,
    recTgt: null,
    fumLost: null,
    fgm: null,
    fga: null,
    xpm: null,
    stats: null,
    ...overrides,
  };
}

function pointRow(overrides: Partial<PlayerWeeklyPointRow> = {}): PlayerWeeklyPointRow {
  return {
    week: 1,
    points: 10,
    projectedPoints: 8,
    slot: "QB",
    started: true,
    franchiseId: "f1",
    matchupId: 1,
    played: true,
    ownerFranchiseName: "Owner Team",
    ownerFranchiseSlug: "owner-team",
    ownerAvatarUrl: null,
    opponentFranchiseId: "f2",
    opponentFranchiseName: "Opp Team",
    opponentFranchiseSlug: "opp-team",
    opponentAvatarUrl: null,
    ...overrides,
  };
}

describe("formatStatSummary", () => {
  it("QB: renders cmp/att pair plus non-zero segments, omits zero/null", () => {
    const stat = statRow({
      position: "QB",
      passCmp: 24,
      passAtt: 35,
      passYd: 312,
      passTd: 3,
      passInt: 0,
      rushYd: null,
      rushTd: 0,
    });
    expect(formatStatSummary("QB", stat)).toEqual(["24/35", "312 YD", "3 TD"]);
  });

  it("RB: omits zero and null segments", () => {
    const stat = statRow({
      position: "RB",
      rushAtt: 18,
      rushYd: 84,
      rushTd: 0,
      rec: null,
      recYd: 12,
    });
    expect(formatStatSummary("RB", stat)).toEqual(["18 ATT", "84 YD", "12 REC YD"]);
  });

  it("WR/TE: full stat line", () => {
    const stat = statRow({
      position: "WR",
      recTgt: 9,
      rec: 7,
      recYd: 101,
      recTd: 1,
    });
    expect(formatStatSummary("WR", stat)).toEqual(["9 TGT", "7 REC", "101 YD", "1 TD"]);
    expect(formatStatSummary("TE", stat)).toEqual(["9 TGT", "7 REC", "101 YD", "1 TD"]);
  });

  it("K: renders fgm/fga pair and xpm, omits xpm when zero", () => {
    const stat = statRow({ position: "K", fgm: 2, fga: 3, xpm: 0 });
    expect(formatStatSummary("K", stat)).toEqual(["2/3 FG"]);

    const stat2 = statRow({ position: "K", fgm: 0, fga: 0, xpm: 4 });
    expect(formatStatSummary("K", stat2)).toEqual(["4 XP"]);
  });

  it("unknown position or missing stat returns empty summary", () => {
    expect(formatStatSummary("DST", statRow({ position: "DST" }))).toEqual([]);
    expect(formatStatSummary("QB", null)).toEqual([]);
    expect(formatStatSummary(null, statRow())).toEqual([]);
  });
});

describe("buildWeeklyLines", () => {
  it("unions lineup weeks with stat-only weeks", () => {
    const points = [pointRow({ week: 1 })];
    const stats = [statRow({ week: 1 }), statRow({ week: 2 })];
    const lines = buildWeeklyLines(points, stats);
    expect(lines.map((l) => l.week)).toEqual([1, 2]);
  });

  it("computes delta only when played and projected is known", () => {
    const points = [
      pointRow({ week: 1, points: 12, projectedPoints: 10, played: true }),
    ];
    const lines = buildWeeklyLines(points, []);
    expect(lines[0].delta).toBeCloseTo(2);
  });

  it("delta is null on unplayed (future) weeks", () => {
    const points = [
      pointRow({ week: 1, points: 0, projectedPoints: 10, played: false }),
    ];
    const lines = buildWeeklyLines(points, []);
    expect(lines[0].delta).toBeNull();
    expect(lines[0].actual).toBeNull();
    expect(lines[0].status).toBe("UPCOMING");
  });

  it("stat-only week (not rostered) has null delta, actual, owner, and NOT_ROSTERED status", () => {
    const stats = [statRow({ week: 3, position: "RB", rushYd: 50 })];
    const lines = buildWeeklyLines([], stats);
    expect(lines).toHaveLength(1);
    const line = lines[0];
    expect(line.rostered).toBe(false);
    expect(line.status).toBe("NOT_ROSTERED");
    expect(line.actual).toBeNull();
    expect(line.delta).toBeNull();
    expect(line.owner).toBeNull();
    expect(line.opponent).toBeNull();
    expect(line.stat).toEqual(stats[0]);
  });

  it("BENCH status for started=false rostered/played weeks", () => {
    const points = [pointRow({ week: 1, started: false, played: true })];
    const lines = buildWeeklyLines(points, []);
    expect(lines[0].status).toBe("BENCH");
  });
});
