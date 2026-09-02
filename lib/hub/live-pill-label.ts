// Pure label formatters for the topbar live pill's preseason and
// between-weeks kickoff-countdown states. Kept separate from
// components/live-pill.tsx (presentational) and lib/queries/kickoff.ts
// (DB access) so the string formatting is independently unit-testable.

import { LEAGUE_TIME_ZONE } from "@/lib/time-zone";

/**
 * Calendar days from `now`'s date to `target`'s date in the league's home
 * timezone, clamped at 0 so it is never negative. The single source of the
 * "N days out" count across the hub and the topbar pill. Counted by date, not
 * by elapsed 24-hour blocks: a Thursday kickoff seen the prior Wednesday is
 * "8 days", even though fewer than 192 hours remain. (The ticking countdown
 * card keeps its own duration math; this feeds prose and labels.)
 */
export function daysUntil(target: Date, now: Date): number {
  return Math.max(0, leagueDayStamp(target) - leagueDayStamp(now));
}

/** A date's day number in the league timezone (days since the epoch). */
function leagueDayStamp(d: Date): number {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: LEAGUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const [year, month, day] = ymd.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** e.g. "PRESEASON · WK 1 IN 34D" */
export function formatPreseasonKickoffLabel(target: Date, now: Date): string {
  return `PRESEASON · WK 1 IN ${daysUntil(target, now)}D`;
}

/** Weekday of a kickoff in America/Chicago (the league's home timezone), e.g. "THU". */
function formatKickoffDay(target: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: LEAGUE_TIME_ZONE,
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
