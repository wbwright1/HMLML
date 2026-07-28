import { describe, it, expect } from "vitest";
import { mapWeekStatRow } from "./player-stats-map";

// Real Sleeper stat maps captured from
// GET https://api.sleeper.app/v1/stats/nfl/regular/2024/1 (trimmed fixtures).
const QB_STATS = {
  pass_att: 49,
  pass_cmp: 34,
  pass_yd: 317,
  pass_td: 1,
  pass_int: 1,
  pts_ppr: 15.68,
  gp: 1,
  cmp_pct: 69.39,
} as Record<string, number | null>;

const RB_STATS = {
  rush_att: 30,
  rush_yd: 159,
  rush_td: 1,
  rec: 3,
  rec_yd: 19,
  rec_tgt: 3,
  pts_ppr: 26.8,
  gp: 1,
  anytime_tds: 1,
} as Record<string, number | null>;

const WR_STATS = {
  rec: 6,
  rec_yd: 77,
  rec_tgt: 7,
  rec_td: 0,
  pts_ppr: 13.7,
  gp: 1,
} as Record<string, number | null>;

const K_STATS = {
  fgm: 2,
  fga: 2,
  xpm: 2,
  xpa: 2,
  pts_ppr: 8,
  gp: 1,
} as Record<string, number | null>;

describe("mapWeekStatRow", () => {
  it("extracts passing columns for a QB", () => {
    const row = mapWeekStatRow({
      seasonId: 5,
      week: 1,
      playerId: "421",
      position: "QB",
      statMap: QB_STATS,
    });
    expect(row.seasonId).toBe(5);
    expect(row.week).toBe(1);
    expect(row.playerId).toBe("421");
    expect(row.position).toBe("QB");
    expect(row.passYd).toBe(317);
    expect(row.passTd).toBe(1);
    expect(row.passInt).toBe(1);
    expect(row.passAtt).toBe(49);
    expect(row.passCmp).toBe(34);
    // A QB has no rushing/receiving keys in this line -> null, not 0.
    expect(row.rushYd).toBeNull();
    expect(row.rec).toBeNull();
    expect(row.fgm).toBeNull();
  });

  it("extracts rushing + receiving columns for a RB", () => {
    const row = mapWeekStatRow({
      seasonId: 5,
      week: 1,
      playerId: "4018",
      position: "RB",
      statMap: RB_STATS,
    });
    expect(row.rushAtt).toBe(30);
    expect(row.rushYd).toBe(159);
    expect(row.rushTd).toBe(1);
    expect(row.rec).toBe(3);
    expect(row.recYd).toBe(19);
    expect(row.recTgt).toBe(3);
    expect(row.passYd).toBeNull();
  });

  it("extracts receiving columns for a WR (rec_td present as 0 stays 0)", () => {
    const row = mapWeekStatRow({
      seasonId: 5,
      week: 1,
      playerId: "2374",
      position: "WR",
      statMap: WR_STATS,
    });
    expect(row.rec).toBe(6);
    expect(row.recYd).toBe(77);
    expect(row.recTgt).toBe(7);
    // rec_td is explicitly 0 in the payload -> real 0, not null.
    expect(row.recTd).toBe(0);
    expect(row.rushYd).toBeNull();
  });

  it("extracts kicking columns for a K", () => {
    const row = mapWeekStatRow({
      seasonId: 5,
      week: 1,
      playerId: "17",
      position: "K",
      statMap: K_STATS,
    });
    expect(row.fgm).toBe(2);
    expect(row.fga).toBe(2);
    expect(row.xpm).toBe(2);
    expect(row.passYd).toBeNull();
    expect(row.rushYd).toBeNull();
  });

  it("maps missing keys to null (not 0)", () => {
    const row = mapWeekStatRow({
      seasonId: 1,
      week: 3,
      playerId: "x",
      position: null,
      statMap: {},
    });
    expect(row.passYd).toBeNull();
    expect(row.rushYd).toBeNull();
    expect(row.rec).toBeNull();
    expect(row.fgm).toBeNull();
    expect(row.gamesPlayed).toBeNull();
    expect(row.position).toBeNull();
  });

  it("maps explicit null stat values to null", () => {
    const row = mapWeekStatRow({
      seasonId: 1,
      week: 3,
      playerId: "x",
      position: "QB",
      statMap: { pass_yd: null, gp: null },
    });
    expect(row.passYd).toBeNull();
    expect(row.gamesPlayed).toBeNull();
  });

  it("rounds games_played to an integer", () => {
    const row = mapWeekStatRow({
      seasonId: 1,
      week: 3,
      playerId: "x",
      position: "RB",
      statMap: { gp: 1 },
    });
    expect(row.gamesPlayed).toBe(1);

    const fractional = mapWeekStatRow({
      seasonId: 1,
      week: 3,
      playerId: "y",
      position: "RB",
      statMap: { gp: 0.6 },
    });
    expect(fractional.gamesPlayed).toBe(1);
    expect(Number.isInteger(fractional.gamesPlayed)).toBe(true);
  });

  it("passes the full stat map through to the jsonb catch-all verbatim", () => {
    const row = mapWeekStatRow({
      seasonId: 5,
      week: 1,
      playerId: "4018",
      position: "RB",
      statMap: RB_STATS,
    });
    // Curated columns are extracted, but the full map (incl pts_ppr and
    // advanced metrics like anytime_tds) survives untouched in stats.
    expect(row.stats).toBe(RB_STATS);
    expect((row.stats as Record<string, number | null>).pts_ppr).toBe(26.8);
    expect((row.stats as Record<string, number | null>).anytime_tds).toBe(1);
  });
});
