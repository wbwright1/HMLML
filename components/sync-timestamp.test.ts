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

  // UT-T05: Default "league" data type uses hourly (2-hour) threshold
  // Decision: "league" maps to hourly threshold since league sync runs hourly
  it("uses hourly threshold (2 hours) for 'league' data type", () => {
    const threshold = getStaleThresholdMs("league");
    expect(threshold).toBe(7_200_000);

    // Verify a 2hr+1ms diff is considered stale
    const diffMs = 7_200_001;
    expect(diffMs > threshold).toBe(true);
  });

  // Any unknown data type also uses hourly threshold
  it("uses hourly threshold for unknown data types", () => {
    const threshold = getStaleThresholdMs("unknown");
    expect(threshold).toBe(7_200_000);
  });
});
