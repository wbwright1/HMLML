// Shared timezone offset engine for the league's calendar-day boundaries
// (kickoff countdowns, season-segment windows, hub labels). Extracted from
// lib/queries/kickoff.ts so there is exactly one DST-handling implementation
// in the repo, per issue #250.
//
// Pure: no I/O, no dependencies, safe to unit test directly.

/**
 * The league's home timezone. Every kickoff/week-boundary calculation in the
 * codebase anchors here (see lib/queries/kickoff.ts, lib/season-segment.ts,
 * lib/hub/live-pill-label.ts, lib/hub/between-weeks.ts). This is a single
 * exported constant on purpose: if the league is ever confirmed to live in a
 * different zone, flipping it here is the entire fix.
 *
 * lib/game-window.ts is a deliberate, documented exception: it encodes NFL
 * national kickoff clock times, which are a fact about the league schedule
 * in America/New_York, not about where our members live.
 */
export const LEAGUE_TIME_ZONE = "America/Chicago";

/**
 * The signed offset (ms) of `timeZone` from UTC at the given instant, e.g.
 * Chicago in September (CDT, UTC-5) returns -5h. Uses Intl so DST is handled
 * correctly without a timezone library.
 *
 * Every `timeZone` argument in this repo is a module constant, never user or
 * API input, so a bad zone is a programmer error: this throws rather than
 * silently falling back, both for an invalid IANA zone (Intl.DateTimeFormat
 * throws a RangeError on construction) and for the rarer case where
 * formatToParts yields a non-finite part, which would otherwise propagate a
 * NaN into a getTime() comparison and produce a wrong-by-some-amount instant
 * instead of a loud failure.
 */
export function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const map: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = Number(p.value);
  const asUtc = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour % 24,
    map.minute,
    map.second
  );
  if (!Number.isFinite(asUtc)) {
    throw new RangeError(
      `timeZoneOffsetMs: non-finite offset computed for timeZone "${timeZone}"`
    );
  }
  return asUtc - instant.getTime();
}

/**
 * Given the UTC-midnight instant that names a calendar day (e.g.
 * Date.UTC(2026, 8, 9) for "2026-09-09"), returns the instant of 00:00 local
 * time in `timeZone` on that day. Defaults to LEAGUE_TIME_ZONE.
 */
export function startOfDayInZone(
  utcMidnight: Date,
  timeZone: string = LEAGUE_TIME_ZONE
): Date {
  const offset = timeZoneOffsetMs(utcMidnight, timeZone);
  return new Date(utcMidnight.getTime() - offset);
}
