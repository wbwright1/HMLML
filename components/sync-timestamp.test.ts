import { describe, it, expect } from "vitest";
import { getStaleThresholdMs } from "./sync-timestamp";

describe("getStaleThresholdMs", () => {
  // UT-T01: Hourly data type — stale threshold is 2 hours
  it("returns 7,200,000ms (2 hours) for hourly data type", () => {
    const threshold = getStaleThresholdMs("hourly");
    expect(threshold).toBe(7_200_000);
  });

  // UT-T02: Hourly data — just over threshold is stale
  it("marks hourly data as stale when diff > 2 hours", () => {
    const threshold = getStaleThresholdMs("hourly");
    const diffMs = 7_200_001; // 2 hours + 1ms
    expect(diffMs > threshold).toBe(true);
  });

  // UT-T02: Hourly data — just under threshold is not stale
  it("marks hourly data as fresh when diff < 2 hours", () => {
    const threshold = getStaleThresholdMs("hourly");
    const diffMs = 7_199_999; // just under 2 hours
    expect(diffMs > threshold).toBe(false);
  });

  // UT-T03: Daily data type — stale threshold is 26 hours
  it("returns 93,600,000ms (26 hours) for daily data type", () => {
    const threshold = getStaleThresholdMs("daily");
    expect(threshold).toBe(93_600_000);
  });

  // UT-T03: Daily data — just over threshold is stale
  it("marks daily data as stale when diff > 26 hours", () => {
    const threshold = getStaleThresholdMs("daily");
    const diffMs = 93_600_001; // 26 hours + 1ms
    expect(diffMs > threshold).toBe(true);
  });

  // UT-T04: Daily data — just under threshold is not stale
  it("marks daily data as fresh when diff < 26 hours", () => {
    const threshold = getStaleThresholdMs("daily");
    const diffMs = 93_599_999; // just under 26 hours
    expect(diffMs > threshold).toBe(false);
  });

  // UT-T05: Default "league" data type uses the daily (26-hour) threshold
  // Decision: "league" is logged by the daily cron (lib/sync/daily.ts), so it
  // must use the 26h threshold, not the 2h hourly one (this was the bug).
  it("uses daily threshold (26 hours) for 'league' data type", () => {
    const threshold = getStaleThresholdMs("league");
    expect(threshold).toBe(93_600_000);

    // Verify a 26hr+1ms diff is considered stale
    const diffMs = 93_600_001;
    expect(diffMs > threshold).toBe(true);
  });

  // Other daily-cadence data types (see lib/sync/daily.ts logSyncStart calls)
  it.each(["members", "players", "drafts", "playoffs"])(
    "uses daily threshold (26 hours) for '%s' data type",
    (dataType) => {
      expect(getStaleThresholdMs(dataType)).toBe(93_600_000);
    }
  );

  // "rosters" is logged by both daily.ts and hourly.ts under the same
  // data_type string; since hourly.ts re-syncs it every hour, the freshest
  // row is effectively hourly-cadence and should use the tighter threshold.
  it("uses hourly threshold (2 hours) for 'rosters' data type", () => {
    expect(getStaleThresholdMs("rosters")).toBe(7_200_000);
  });

  // Hourly-cadence data types (see lib/sync/hourly.ts logSyncStart calls)
  it.each(["transactions", "matchups", "player_week_points", "nfl_games"])(
    "uses hourly threshold (2 hours) for '%s' data type",
    (dataType) => {
      expect(getStaleThresholdMs(dataType)).toBe(7_200_000);
    }
  );

  // Any unknown data type defaults to the hourly threshold
  it("uses hourly threshold for unknown data types", () => {
    const threshold = getStaleThresholdMs("unknown");
    expect(threshold).toBe(7_200_000);
  });
});
