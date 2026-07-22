import { cache } from "react";
import { db } from "@/lib/db";
import { nflGames } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in kickoff.test.ts)
// ---------------------------------------------------------------------------

const CHICAGO_TIME_ZONE = "America/Chicago";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The signed offset (ms) of `timeZone` from UTC at the given instant, e.g.
 * Chicago in September (CDT, UTC-5) returns -5h. Uses Intl so DST is handled
 * correctly without a timezone library.
 */
function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
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
  return asUtc - date.getTime();
}

/** The instant of 00:00 America/Chicago on a "YYYY-MM-DD" date (DST-correct). */
function chicagoStartOfDay(dateOnly: string): Date | null {
  const [y, m, d] = dateOnly.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offset = timeZoneOffsetMs(new Date(utcMidnight), CHICAGO_TIME_ZONE);
  return new Date(utcMidnight - offset);
}

/**
 * Parses a stored nfl_games.game_date into a Date. Sleeper's schedule feed
 * gives a date-only "YYYY-MM-DD" (no kickoff clock time exists in our data). A
 * bare `new Date("2026-09-10")` is UTC midnight, which renders as the previous
 * evening in America/Chicago; so date-only values are anchored to start-of-day
 * in the league's home timezone. Full timestamps (a Phase 2 upgrade when a real
 * time source exists) pass straight through. Null for null/empty/unparseable.
 */
export function parseKickoff(gameDate: string | null | undefined): Date | null {
  if (!gameDate) return null;
  if (DATE_ONLY.test(gameDate)) return chicagoStartOfDay(gameDate);
  const d = new Date(gameDate);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Earliest not-yet-started ('pre_game') kickoff among a week's games. Returns
 * null when no pre_game rows carry a parseable date (e.g. the week is over, or
 * the schedule has not synced). Pure so the DB query stays a thin wrapper.
 */
export function earliestKickoff(
  games: { gameDate: string | null; status: string }[]
): Date | null {
  let earliest: Date | null = null;
  for (const g of games) {
    if (g.status !== "pre_game") continue;
    const d = parseKickoff(g.gameDate);
    if (!d) continue;
    if (earliest === null || d.getTime() < earliest.getTime()) earliest = d;
  }
  return earliest;
}

/**
 * The "between weeks" lull: regular season, and every matchup for the current
 * fantasy week is still 'scheduled' (the slate is set but no game has kicked
 * off). A week with any completed or in-progress matchup is mid-week, not
 * between, so it returns false; the every-'scheduled' check subsumes a separate
 * "is anything live" guard. Requires at least one matchup to avoid a false
 * positive on an unsynced week.
 */
export function computeIsBetweenWeeks({
  seasonType,
  matchupStatuses,
}: {
  seasonType: string;
  matchupStatuses: string[];
}): boolean {
  if (seasonType !== "regular") return false;
  if (matchupStatuses.length === 0) return false;
  return matchupStatuses.every((s) => s === "scheduled");
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Returns the earliest pre_game kickoff datetime for the given NFL week, used as
 * the between-weeks countdown target. Null when the schedule is unavailable or
 * the week has no upcoming games. nfl_games is keyed on the calendar year, so
 * callers pass the season's calendar year (not the fantasy season id).
 */
export const getNextKickoff = cache(async function getNextKickoff(
  seasonYear: number,
  week: number
): Promise<Date | null> {
  try {
    const rows = await db
      .select({
        gameDate: nflGames.gameDate,
        status: nflGames.status,
      })
      .from(nflGames)
      .where(and(eq(nflGames.seasonYear, seasonYear), eq(nflGames.week, week)));

    return earliestKickoff(rows);
  } catch (e) {
    console.error("[kickoff] getNextKickoff error:", e);
    return null;
  }
});
