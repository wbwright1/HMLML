import { describe, it, expect } from "vitest";
import { LEAGUE_TIME_ZONE, timeZoneOffsetMs, startOfDayInZone } from "./time-zone";

describe("LEAGUE_TIME_ZONE", () => {
  it("is a zone Intl accepts (a typo here cannot ship)", () => {
    expect(() => new Intl.DateTimeFormat("en-US", { timeZone: LEAGUE_TIME_ZONE })).not.toThrow();
  });
});

describe("timeZoneOffsetMs", () => {
  it("returns -5h for a September Chicago instant (CDT)", () => {
    const offset = timeZoneOffsetMs(new Date(Date.UTC(2026, 8, 9)), "America/Chicago");
    expect(offset).toBe(-5 * 3600_000);
    expect(Number.isFinite(offset)).toBe(true);
  });

  it("returns -6h for a January Chicago instant (CST)", () => {
    const offset = timeZoneOffsetMs(new Date(Date.UTC(2026, 0, 15)), "America/Chicago");
    expect(offset).toBe(-6 * 3600_000);
    expect(Number.isFinite(offset)).toBe(true);
  });

  it("crosses the spring-forward DST transition (CST -> CDT), both zones", () => {
    // 2026-03-08 02:00 CST -> CDT (America/Chicago).
    const before = timeZoneOffsetMs(new Date("2026-03-08T07:59:00Z"), "America/Chicago");
    const after = timeZoneOffsetMs(new Date("2026-03-08T08:01:00Z"), "America/Chicago");
    expect(before).toBe(-6 * 3600_000);
    expect(after).toBe(-5 * 3600_000);
    expect(Number.isFinite(before)).toBe(true);
    expect(Number.isFinite(after)).toBe(true);

    // Same transition, one hour later clock-wise, in America/New_York, proving
    // the timeZone parameter is honored and not shadowed by a default.
    const beforeEt = timeZoneOffsetMs(new Date("2026-03-08T06:59:00Z"), "America/New_York");
    const afterEt = timeZoneOffsetMs(new Date("2026-03-08T07:01:00Z"), "America/New_York");
    expect(beforeEt).toBe(-5 * 3600_000);
    expect(afterEt).toBe(-4 * 3600_000);
  });

  it("crosses the fall-back DST transition (CDT -> CST), both zones", () => {
    // 2026-11-01 02:00 CDT -> CST (America/Chicago).
    const before = timeZoneOffsetMs(new Date("2026-11-01T06:59:00Z"), "America/Chicago");
    const after = timeZoneOffsetMs(new Date("2026-11-01T07:01:00Z"), "America/Chicago");
    expect(before).toBe(-5 * 3600_000);
    expect(after).toBe(-6 * 3600_000);
    expect(Number.isFinite(before)).toBe(true);
    expect(Number.isFinite(after)).toBe(true);

    const beforeEt = timeZoneOffsetMs(new Date("2026-11-01T05:59:00Z"), "America/New_York");
    const afterEt = timeZoneOffsetMs(new Date("2026-11-01T06:01:00Z"), "America/New_York");
    expect(beforeEt).toBe(-4 * 3600_000);
    expect(afterEt).toBe(-5 * 3600_000);
  });

  it("throws for an invalid IANA zone rather than returning NaN", () => {
    expect(() => timeZoneOffsetMs(new Date(), "Not/AZone")).toThrow();
  });
});

describe("startOfDayInZone", () => {
  it("returns Chicago midnight for a September date (CDT)", () => {
    expect(startOfDayInZone(new Date(Date.UTC(2026, 8, 9))).toISOString()).toBe(
      "2026-09-09T05:00:00.000Z"
    );
  });

  it("returns Chicago midnight for a January date (CST)", () => {
    expect(startOfDayInZone(new Date(Date.UTC(2026, 0, 15))).toISOString()).toBe(
      "2026-01-15T06:00:00.000Z"
    );
  });

  it("throws for a bogus zone rather than an Invalid Date or an off-by-an-hour instant", () => {
    expect(() => startOfDayInZone(new Date(Date.UTC(2026, 8, 9)), "Not/AZone")).toThrow();
  });
});
