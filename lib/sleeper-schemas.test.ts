import { describe, it, expect } from "vitest";
import {
  SleeperSeasonProjectionSchema,
  SleeperWeekStatsSchema,
} from "./sleeper-schemas";

describe("SleeperSeasonProjectionSchema", () => {
  it("parses a row with a full raw stat map and preserves every key", () => {
    const raw = {
      player_id: "6794",
      stats: {
        pass_yd: 4200,
        pass_td: 30,
        rush_yd: 250,
        rec: 0,
        rec_yd: 0,
        pts_ppr: 320.5,
        gp: 17,
      },
      // Sleeper ships extra top-level fields; passthrough must keep the row.
      company: "sportradar",
    };

    const parsed = SleeperSeasonProjectionSchema.parse(raw);

    expect(parsed.player_id).toBe("6794");
    // The widened record type retains raw scoring stats, not just pts_ppr,
    // so the value can be dot-producted against league scoring settings.
    expect(parsed.stats.pass_yd).toBe(4200);
    expect(parsed.stats.rush_yd).toBe(250);
    expect(parsed.stats.pts_ppr).toBe(320.5);
    expect(parsed.stats).toEqual(raw.stats);
  });

  it("accepts null stat values", () => {
    const parsed = SleeperSeasonProjectionSchema.parse({
      player_id: "1",
      stats: { pass_yd: null, pts_ppr: 12.3 },
    });
    expect(parsed.stats.pass_yd).toBeNull();
    expect(parsed.stats.pts_ppr).toBe(12.3);
  });
});

describe("SleeperWeekStatsSchema", () => {
  it("parses a real captured week-stats payload keyed by player_id", () => {
    // Trimmed real rows from
    // GET https://api.sleeper.app/v1/stats/nfl/regular/2024/1.
    const raw = {
      "421": {
        pass_att: 49,
        pass_cmp: 34,
        pass_yd: 317,
        pass_td: 1,
        pass_int: 1,
        pts_ppr: 15.68,
        gp: 1,
      },
      "17": {
        fgm: 2,
        fga: 2,
        xpm: 2,
        pts_ppr: 8,
        gp: 1,
      },
    };

    const parsed = SleeperWeekStatsSchema.parse(raw);
    expect(parsed["421"].pass_yd).toBe(317);
    expect(parsed["421"].pts_ppr).toBe(15.68);
    expect(parsed["17"].fgm).toBe(2);
    expect(parsed["17"].xpm).toBe(2);
  });

  it("accepts null stat values within a player's stat map", () => {
    const parsed = SleeperWeekStatsSchema.parse({
      "9999": { pass_yd: null, pts_ppr: 0 },
    });
    expect(parsed["9999"].pass_yd).toBeNull();
    expect(parsed["9999"].pts_ppr).toBe(0);
  });

  it("rejects a non-numeric stat value", () => {
    expect(() =>
      SleeperWeekStatsSchema.parse({ "1": { pass_yd: "lots" } }),
    ).toThrow();
  });
});
