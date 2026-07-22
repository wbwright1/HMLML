// Pure label formatters for the topbar live pill's preseason and
// between-weeks kickoff-countdown states. Kept separate from
// components/live-pill.tsx (presentational) and lib/queries/kickoff.ts
// (DB access) so the string formatting is independently unit-testable.

const CHICAGO_TIME_ZONE = "America/Chicago";

/**
 * Whole days remaining until `target`, floored (matches the countdown DAYS card
 * and the between-weeks headline) and clamped at 0 so it is never negative. The
 * single source of the "N days out" count across the hub and the topbar pill.
 */
export function daysUntil(target: Date, now: Date): number {
  return Math.max(0, Math.floor((target.getTime() - now.getTime()) / 86_400_000));
}

/** e.g. "PRESEASON · WK 1 IN 34D" */
export function formatPreseasonKickoffLabel(target: Date, now: Date): string {
  return `PRESEASON · WK 1 IN ${daysUntil(target, now)}D`;
}

/** Weekday of a kickoff in America/Chicago (the league's home timezone), e.g. "THU". */
function formatKickoffDay(target: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: CHICAGO_TIME_ZONE,
  })
    .format(target)
    .toUpperCase();
}

/**
 * e.g. "WK 10 · KICKOFF THU". Day-only by design: our schedule source
 * (Sleeper) gives a date, not a kickoff clock time, so we never display a time
 * we do not have. Every current kickoff anchor is a Chicago start-of-day
 * instant (see parseKickoff), so the weekday is the most precise honest signal.
 * Phase 2 upgrade: wire a real kickoff-time source and restore the time here.
 */
export function formatBetweenWeeksKickoffLabel(week: number, target: Date): string {
  return `WK ${week} · KICKOFF ${formatKickoffDay(target)}`;
}
