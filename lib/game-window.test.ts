import { describe, it, expect } from "vitest";
import { isPlausibleGameWindow } from "./game-window";

// Helper: build a UTC instant. EDT is UTC-4 (summer), EST is UTC-5 (winter).
const utc = (iso: string) => new Date(iso);

describe("isPlausibleGameWindow", () => {
  it("is true Sunday afternoon ET", () => {
    // 2026-09-13 is a Sunday; 17:00Z = 13:00 EDT.
    expect(isPlausibleGameWindow(utc("2026-09-13T17:00:00Z"))).toBe(true);
  });

  it("is false Sunday morning before the window", () => {
    // 13:00Z = 09:00 EDT, before the 11am cutoff.
    expect(isPlausibleGameWindow(utc("2026-09-13T13:00:00Z"))).toBe(false);
  });

  it("is true Thursday night ET", () => {
    // 2026-09-10 Thursday; 00:30Z next day = 20:30 EDT Thursday.
    expect(isPlausibleGameWindow(utc("2026-09-11T00:30:00Z"))).toBe(true);
  });

  it("is false Thursday afternoon ET", () => {
    // 20:00Z = 16:00 EDT Thursday, before 7pm.
    expect(isPlausibleGameWindow(utc("2026-09-10T20:00:00Z"))).toBe(false);
  });

  it("is true Monday night ET", () => {
    // 2026-09-14 Monday; 2026-09-15T01:00Z = 21:00 EDT Monday.
    expect(isPlausibleGameWindow(utc("2026-09-15T01:00:00Z"))).toBe(true);
  });

  it("is false Tuesday and Wednesday", () => {
    expect(isPlausibleGameWindow(utc("2026-09-15T20:00:00Z"))).toBe(false);
    expect(isPlausibleGameWindow(utc("2026-09-16T20:00:00Z"))).toBe(false);
  });

  it("handles standard time (EST, UTC-5) correctly", () => {
    // 2026-12-13 Sunday; 16:00Z = 11:00 EST, exactly the cutoff.
    expect(isPlausibleGameWindow(utc("2026-12-13T16:00:00Z"))).toBe(true);
    // 15:00Z = 10:00 EST, before it.
    expect(isPlausibleGameWindow(utc("2026-12-13T15:00:00Z"))).toBe(false);
  });

  it("does not treat ET midnight as hour 24", () => {
    // 2026-09-15T04:00Z = 00:00 EDT Tuesday -> not a window, and must not
    // blow past a `>= 19` check via an hour value of 24.
    expect(isPlausibleGameWindow(utc("2026-09-15T04:00:00Z"))).toBe(false);
  });
});
