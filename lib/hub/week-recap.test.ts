import { describe, it, expect } from "vitest";
import {
  assembleTeamOfWeek,
  pickTopPerformers,
  pickDud,
  recapHeadline,
  teamOfWeekVerdict,
  recapWindowClosesAt,
  isRecapWindowOpen,
  type RecapPlayer,
} from "./week-recap";

const SLOTS = ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "FLEX", "SUPER_FLEX", "BN", "BN"];

let seq = 0;
function player(
  position: string,
  points: number,
  started = true,
  extra: Partial<RecapPlayer> = {}
): RecapPlayer {
  seq += 1;
  return {
    playerId: `p${seq}`,
    name: `Player ${seq}`,
    position,
    nflTeam: "ATL",
    points,
    projectedPoints: 10,
    started,
    franchiseId: "f1",
    franchiseName: "Franchise One",
    franchiseSlug: "franchise-one",
    franchiseAbbreviation: "FO",
    franchiseBrandingColor: "#123456",
    franchiseAvatarUrl: null,
    ...extra,
  };
}

describe("assembleTeamOfWeek", () => {
  it("returns null with no starting slots or an empty pool", () => {
    expect(assembleTeamOfWeek(null, [player("QB", 20)])).toBeNull();
    expect(assembleTeamOfWeek(["BN", "IR"], [player("QB", 20)])).toBeNull();
    expect(assembleTeamOfWeek(SLOTS, [])).toBeNull();
  });

  it("fills slots in roster_positions order and never reuses a player", () => {
    const qb1 = player("QB", 30);
    const qb2 = player("QB", 25);
    const rb1 = player("RB", 22);
    const rb2 = player("RB", 18);
    const rb3 = player("RB", 15);
    const wr1 = player("WR", 28);
    const wr2 = player("WR", 12);
    const wr3 = player("WR", 11);
    const wr4 = player("WR", 9);
    const te1 = player("TE", 14);
    const te2 = player("TE", 13);
    const team = assembleTeamOfWeek(SLOTS, [
      qb1, qb2, rb1, rb2, rb3, wr1, wr2, wr3, wr4, te1, te2,
    ]);
    expect(team).not.toBeNull();
    const ids = team!.slots.map((s) => s.player?.playerId);
    expect(team!.slots.map((s) => s.slot)).toEqual(SLOTS.slice(0, 10));
    // Fixed slots take the top eligible; FLEX takes the next-best RB/WR/TE
    // (rb3 15, te2 13); SUPER_FLEX takes the leftover QB.
    expect(ids).toEqual([
      qb1.playerId,
      rb1.playerId,
      rb2.playerId,
      wr1.playerId,
      wr2.playerId,
      wr3.playerId,
      te1.playerId,
      rb3.playerId,
      te2.playerId,
      qb2.playerId,
    ]);
    expect(new Set(ids).size).toBe(10);
    expect(team!.total).toBe(30 + 22 + 18 + 28 + 12 + 11 + 14 + 15 + 13 + 25);
  });

  it("includes benched players and counts them", () => {
    const benchWr = player("WR", 40, false);
    const startedWr = player("WR", 20);
    const team = assembleTeamOfWeek(["WR", "BN"], [startedWr, benchWr]);
    expect(team!.slots[0].player?.playerId).toBe(benchWr.playerId);
    expect(team!.benched).toBe(1);
  });

  it("breaks an exact tie toward the started player", () => {
    const benchWr = player("WR", 20, false);
    const startedWr = player("WR", 20);
    const team = assembleTeamOfWeek(["WR"], [benchWr, startedWr]);
    expect(team!.slots[0].player?.playerId).toBe(startedWr.playerId);
    expect(team!.benched).toBe(0);
  });

  it("leaves a slot empty rather than forcing an ineligible position", () => {
    const team = assembleTeamOfWeek(["QB", "TE"], [player("QB", 20)]);
    expect(team!.slots[1].player).toBeNull();
    expect(team!.total).toBe(20);
  });
});

describe("pickTopPerformers", () => {
  it("returns started players only, highest first, capped at n", () => {
    const a = player("RB", 30);
    const b = player("WR", 35, false);
    const c = player("QB", 25);
    const d = player("TE", 5);
    const top = pickTopPerformers([a, b, c, d], 2);
    expect(top.map((p) => p.playerId)).toEqual([a.playerId, c.playerId]);
  });
});

describe("pickDud", () => {
  it("returns null with no starters", () => {
    expect(pickDud([player("QB", 0, false)])).toBeNull();
  });

  it("ignores low-projection starters when an expected producer busted", () => {
    const byeKicker = player("TE", 0, true, { projectedPoints: 0 });
    const bust = player("WR", 1.2, true, { projectedPoints: 14 });
    expect(pickDud([byeKicker, bust])!.playerId).toBe(bust.playerId);
  });

  it("falls back to the lowest starter when nobody carried a projection", () => {
    const a = player("WR", 3, true, { projectedPoints: null });
    const b = player("RB", 2, true, { projectedPoints: null });
    expect(pickDud([a, b])!.playerId).toBe(b.playerId);
  });
});

describe("recapHeadline", () => {
  const high = { franchiseName: "McCarthyism", points: 185 };
  const low = { franchiseName: "Of Mice and Mendoza", points: 82.5 };
  const blowout = { winner: "Watson Love Diggs", loser: "Of Mice and Mendoza", margin: 86.4 };
  const close = { winner: "Real Olave Garden", loser: "Vanilla Vick", margin: 2.5 };

  it("pairs the high score with the mercy-rule loser", () => {
    expect(
      recapHeadline(1, { highestScorer: high, lowestScorer: low, biggestBlowout: blowout, closestWin: close })
    ).toBe("McCarthyism hung 185.0. Of Mice and Mendoza got run off the field by 86.4.");
  });

  it("does not name the same franchise twice", () => {
    const selfBlowout = { winner: "X", loser: "McCarthyism", margin: 10 };
    const h = recapHeadline(1, { highestScorer: high, lowestScorer: low, biggestBlowout: selfBlowout, closestWin: close });
    expect(h).toBe("McCarthyism hung 185.0. Of Mice and Mendoza managed 82.5.");
  });

  it("degrades to a plain fact when superlatives are missing", () => {
    expect(
      recapHeadline(3, { highestScorer: null, lowestScorer: null, biggestBlowout: null, closestWin: null })
    ).toBe("Week 3 is in the books.");
    expect(
      recapHeadline(3, { highestScorer: null, lowestScorer: null, biggestBlowout: null, closestWin: close })
    ).toBe("Real Olave Garden escaped Vanilla Vick by 2.5.");
  });

  it("never emits an em-dash", () => {
    const h = recapHeadline(1, { highestScorer: high, lowestScorer: low, biggestBlowout: blowout, closestWin: close });
    expect(h).not.toContain("—");
  });
});

describe("teamOfWeekVerdict", () => {
  it("scales with the benched count", () => {
    const base = { slots: [], total: 0 };
    expect(teamOfWeekVerdict({ ...base, benched: 0 })).toMatch(/actually set/);
    expect(teamOfWeekVerdict({ ...base, benched: 1 })).toMatch(/One of them/);
    expect(teamOfWeekVerdict({ ...base, benched: 3 })).toMatch(/^3 of them/);
  });
});

describe("recap window", () => {
  // Thursday Sep 17 2026, 7:15 PM Central = 00:15 UTC Friday Sep 18.
  const thursdayNightKickoff = new Date("2026-09-18T00:15:00Z");

  it("closes at the daily cron (06:00 UTC) on the kickoff's league-time day", () => {
    expect(recapWindowClosesAt(thursdayNightKickoff).toISOString()).toBe(
      "2026-09-17T06:00:00.000Z"
    );
  });

  it("is open Tuesday and Wednesday, closed from Thursday 1 AM Central on", () => {
    expect(isRecapWindowOpen(new Date("2026-09-15T15:00:00Z"), thursdayNightKickoff)).toBe(true);
    expect(isRecapWindowOpen(new Date("2026-09-17T05:59:59Z"), thursdayNightKickoff)).toBe(true);
    expect(isRecapWindowOpen(new Date("2026-09-17T06:00:00Z"), thursdayNightKickoff)).toBe(false);
    expect(isRecapWindowOpen(new Date("2026-09-17T18:00:00Z"), thursdayNightKickoff)).toBe(false);
  });

  it("stays open when the kickoff is unknown", () => {
    expect(isRecapWindowOpen(new Date("2026-09-17T18:00:00Z"), null)).toBe(true);
  });
});
