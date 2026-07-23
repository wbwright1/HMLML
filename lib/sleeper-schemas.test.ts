import { describe, it, expect } from "vitest";
import { SleeperSeasonProjectionSchema } from "./sleeper-schemas";

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
