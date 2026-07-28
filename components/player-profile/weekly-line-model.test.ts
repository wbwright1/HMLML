import { describe, it, expect } from "vitest";
import {
  buildWeeklyLines,
  type BuildWeeklyLinesOptions,
} from "./weekly-line-model";
import type {
  PlayerWeeklyPointRow,
  PlayerWeeklyStatRow,
} from "@/lib/queries/player-profile";

const SEASON_YEAR = 2024;

/** No schedule facts: every classify() call returns null (weekIsComplete false),
 * so BYE/DNP never engage and behavior matches the pre-classifier baseline. */
function noScheduleFacts(): BuildWeeklyLinesOptions {
  return {
    seasonYear: SEASON_YEAR,
    nflTeam: null,
    teamByeWeeks: new Map(),
    completeWeeks: new Set(),
  };
}

/** A resolvable schedule: `week` is this team's bye, and completeWeeks marks
 * every week 1..upToWeek as having been played. */
function scheduleFacts(
  team: string,
  byeWeek: number,
  completeThroughWeek: number,
): BuildWeeklyLinesOptions {
  const teamByeWeeks = new Map([[`${SEASON_YEAR}:${team}`, byeWeek]]);
  const completeWeeks = new Set<string>();
  for (let w = 1; w <= completeThroughWeek; w++) {
    completeWeeks.add(`${SEASON_YEAR}:${w}`);
  }
  return { seasonYear: SEASON_YEAR, nflTeam: team, teamByeWeeks, completeWeeks };
}

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

describe("buildWeeklyLines", () => {
  it("unions lineup weeks with stat-only weeks", () => {
    const points = [pointRow({ week: 1 })];
    const stats = [statRow({ week: 1 }), statRow({ week: 2 })];
    const lines = buildWeeklyLines(points, stats, noScheduleFacts());
    expect(lines.map((l) => l.week)).toEqual([1, 2]);
  });

  it("computes delta only when played and projected is known", () => {
    const points = [
      pointRow({ week: 1, points: 12, projectedPoints: 10, played: true }),
    ];
    const lines = buildWeeklyLines(points, [], noScheduleFacts());
    expect(lines[0].delta).toBeCloseTo(2);
  });

  it("delta is null on unplayed (future) weeks", () => {
    const points = [
      pointRow({ week: 1, points: 0, projectedPoints: 10, played: false }),
    ];
    const lines = buildWeeklyLines(points, [], noScheduleFacts());
    expect(lines[0].delta).toBeNull();
    expect(lines[0].actual).toBeNull();
    expect(lines[0].status).toBe("UPCOMING");
  });

  it("stat-only week (not rostered) has null delta, actual, owner, and NOT_ROSTERED status", () => {
    const stats = [statRow({ week: 3, position: "RB", rushYd: 50 })];
    const lines = buildWeeklyLines([], stats, noScheduleFacts());
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
    const lines = buildWeeklyLines(points, [], noScheduleFacts());
    expect(lines[0].status).toBe("BENCH");
  });

  describe("BYE / DNP classification", () => {
    it("a rostered bye-week row shows BYE with null actual/delta, even though it was 'started'", () => {
      // A manager who left a bye-week player in the lineup: started=true,
      // points=0, no stat row at all for that week.
      const points = [
        pointRow({ week: 6, points: 0, projectedPoints: 5, started: true, played: true }),
      ];
      const lines = buildWeeklyLines(points, [], scheduleFacts("KC", 6, 6));
      expect(lines[0].status).toBe("BYE");
      expect(lines[0].actual).toBeNull();
      expect(lines[0].delta).toBeNull();
      expect(lines[0].played).toBe(false);
    });

    it("DNP for a started, completed week with zero real production and no bye match", () => {
      const points = [
        pointRow({ week: 4, points: 0, projectedPoints: 8, started: true, played: true }),
      ];
      const stats = [statRow({ week: 4, gamesPlayed: 0, stats: { gms_active: 0 } })];
      const lines = buildWeeklyLines(points, stats, scheduleFacts("KC", 6, 6));
      expect(lines[0].status).toBe("DNP");
      expect(lines[0].actual).toBeNull();
      expect(lines[0].delta).toBeNull();
    });

    it("PLAYED guard wins over a bye-week match when the player has real production", () => {
      const points = [
        pointRow({ week: 6, points: 14.2, projectedPoints: 10, started: true, played: true }),
      ];
      const stats = [statRow({ week: 6, gamesPlayed: 1 })];
      const lines = buildWeeklyLines(points, stats, scheduleFacts("KC", 6, 6));
      expect(lines[0].status).toBe("START");
      expect(lines[0].actual).toBe(14.2);
    });

    it("incomplete (future) week keeps UPCOMING even if it matches the team bye week", () => {
      const points = [
        pointRow({ week: 9, points: 0, projectedPoints: 5, started: true, played: false }),
      ];
      // completeThroughWeek=6 means week 9 has not happened yet.
      const lines = buildWeeklyLines(points, [], scheduleFacts("KC", 9, 6));
      expect(lines[0].status).toBe("UPCOMING");
      expect(lines[0].actual).toBeNull();
    });

    it("null nfl_team never asserts BYE, falls to DNP for a zero week", () => {
      const points = [
        pointRow({ week: 6, points: 0, projectedPoints: 5, started: true, played: true }),
      ];
      const lines = buildWeeklyLines(points, [], {
        seasonYear: SEASON_YEAR,
        nflTeam: null,
        teamByeWeeks: new Map([[`${SEASON_YEAR}:KC`, 6]]),
        completeWeeks: new Set([`${SEASON_YEAR}:6`]),
      });
      expect(lines[0].status).toBe("DNP");
    });
  });
});
