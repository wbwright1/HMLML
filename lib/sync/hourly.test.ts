import { describe, it, expect } from "vitest";
import { shouldSkipHourlySync, OFFSEASON_SYNC_INTERVAL_MS } from "./hourly";

const NOW = new Date("2026-06-15T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("shouldSkipHourlySync", () => {
  it("skips in the offseason when the last successful sync is recent", () => {
    expect(shouldSkipHourlySync("off", ago(60 * 60 * 1000), NOW)).toBe(true);
  });

  it("runs in the offseason once the throttle window has lapsed", () => {
    expect(
      shouldSkipHourlySync("off", ago(OFFSEASON_SYNC_INTERVAL_MS + 1000), NOW)
    ).toBe(false);
  });

  it("runs in the offseason when there is no prior successful sync", () => {
    expect(shouldSkipHourlySync("off", null, NOW)).toBe(false);
  });

  it("treats the boundary itself as due (not skipped)", () => {
    expect(
      shouldSkipHourlySync("off", ago(OFFSEASON_SYNC_INTERVAL_MS), NOW)
    ).toBe(false);
  });

  it.each(["regular", "post", "pre"])(
    "never skips during the %s season, even seconds after a success",
    (seasonType) => {
      expect(shouldSkipHourlySync(seasonType, ago(1000), NOW)).toBe(false);
    }
  );

  it("honors a custom interval", () => {
    expect(shouldSkipHourlySync("off", ago(30_000), NOW, 60_000)).toBe(true);
    expect(shouldSkipHourlySync("off", ago(90_000), NOW, 60_000)).toBe(false);
  });
});
