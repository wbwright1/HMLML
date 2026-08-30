// Three-segment season model for the site, derived from data with no
// hardcoded dates. Distinct from lib/hub/season-state.ts (the hub's coarser
// pre/regular/post/off model): this one draws the finer offseason ->
// preseason -> in-season line the players table needs.
//
//  - offseason:  the season has ended and the rookie draft has NOT happened
//                yet (latest seasons.status is 'pre_draft' or 'drafting').
//  - preseason:  the rookie draft has happened (status 'in_season') but the
//                NFL season has not started and we are not within 5 days of
//                the week-1 kickoff.
//  - in_season:  NFL state reads regular/post, OR we are within 5 days of the
//                earliest week-1 game.
//
// Pure: no I/O, no dependencies, safe to unit test directly.

export type SeasonSegment = "offseason" | "preseason" | "in_season";

const DAY_MS = 24 * 60 * 60 * 1000;
// How early before week-1 kickoff we flip to in-season (the merged WK column).
export const KICKOFF_LEAD_DAYS = 5;

export interface SeasonSegmentInput {
  /** seasons.status of the latest season row ('pre_draft' | 'drafting' | 'in_season' | 'complete' | ...). */
  seasonStatus: string | null;
  /** nfl_state season_type: 'pre' | 'regular' | 'post' | 'off'. */
  seasonType: string | null;
  /** Earliest nfl_games.game_date (YYYY-MM-DD text) for the current year's week 1, or null when there are no week-1 rows. */
  week1EarliestGameDate: string | null;
  /** Current time (injected for testability). */
  now: Date;
}

/**
 * Parses a 'YYYY-MM-DD' date string to a UTC-midnight Date, or null when it
 * does not start with that shape. Defensive: nfl_games.game_date is free-form
 * text and may be null or carry a trailing time.
 */
export function parseGameDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export const ET_TIME_ZONE = "America/New_York";

/** Fallback offset (EST, minutes) when the runtime cannot report a longOffset. */
const EST_OFFSET_MINUTES = -300;

/**
 * The UTC instant of local midnight in ET on the calendar day `utcMidnight`
 * names. Both kickoff windows anchor here rather than on UTC midnight, which
 * in September lands at 20:00 ET the previous day (a hub that flips to
 * "kickoff week" on a Saturday evening).
 *
 * Intl supplies the correct offset for the date (EDT in September, EST later),
 * so this needs no hardcoded DST rules. On a parse miss it falls back to EST
 * rather than throwing; this is a display boundary, not a correctness-critical
 * read.
 */
export function easternMidnight(utcMidnight: Date): Date {
  let offsetMinutes = EST_OFFSET_MINUTES;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: ET_TIME_ZONE,
      timeZoneName: "longOffset",
    }).formatToParts(utcMidnight);
    const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
    if (m) {
      const sign = m[1] === "-" ? -1 : 1;
      offsetMinutes = sign * (Number(m[2]) * 60 + Number(m[3]));
    }
  } catch {
    // Keep the EST fallback.
  }
  return new Date(utcMidnight.getTime() - offsetMinutes * 60 * 1000);
}

/**
 * True once we've reached ET midnight on the Sunday before the earliest week-1
 * game. This is the hub's "kickoff week" window: from that Sunday on, the site
 * presents as regular season (week banner, kickoff countdown, standings)
 * even though every team is still 0-0. Sunday rather than Monday because
 * week 1 can open on a Wednesday (2026 does). A kickoff that itself falls
 * on a Sunday anchors to the previous Sunday. Null/unparseable date: false
 * (no week-1 schedule rows means the window can never fire).
 *
 * The window is intentionally open-ended: it is a `now >= threshold` test with
 * no upper bound, so it never closes on its own and reads true for a past
 * season forever. That is safe because every caller passes the LATEST season's
 * year (app/page.tsx, components/site-nav.tsx), so a past season cannot leak
 * in, and because `nflSeasonType` dominates the result once the real season
 * starts (resolveHubSeasonType in lib/hub/season-state.ts). Bounding it would
 * need an end date, and if Sleeper's season_type ever lagged past that end the
 * site would fall back to the preseason hub during real play, which is a worse
 * failure than the one being guarded against.
 */
export function isWithinWeekOneLeadWindow(
  week1EarliestGameDate: string | null,
  now: Date
): boolean {
  const week1 = parseGameDate(week1EarliestGameDate);
  if (!week1) return false;
  const weekday = week1.getUTCDay(); // Sun=0 .. Sat=6
  const daysBack = weekday === 0 ? 7 : weekday;
  return now.getTime() >= easternMidnight(week1).getTime() - daysBack * DAY_MS;
}

/**
 * True unless the NFL calendar is definitely NOT running regular-season weeks.
 * A denylist on purpose: `season_type` is free-form `z.string()` from Sleeper
 * and can also be synthesized by the DB fallback in lib/sync/nfl-state.ts, so
 * an unrecognized or missing value must fail toward "the season is under way".
 * The consumer (the prior-week matchup backstop in lib/sync/hourly.ts)
 * over-fires harmlessly, since the main sync loop re-derives status every run
 * and self-heals; under-firing leaves finished weeks stuck at status !=
 * 'complete' with is_winner null, which nothing repairs.
 *
 * Note null/undefined returns true. That is the point: unknown state fails
 * toward the recoverable direction.
 */
export function isNflSeasonUnderway(seasonType: string | null | undefined): boolean {
  return seasonType !== "pre" && seasonType !== "off";
}

/**
 * Resolves the season segment. See the module header for the three cases and
 * the boundaries. When nfl_games has no week-1 rows (week1EarliestGameDate is
 * null) the 5-day rule cannot fire, so in-season falls back to season_type
 * regular/post alone.
 */
export function resolveSeasonSegment(input: SeasonSegmentInput): SeasonSegment {
  const { seasonStatus, seasonType, week1EarliestGameDate, now } = input;

  // 1. Offseason: season over, rookie draft not yet run.
  if (seasonStatus === "pre_draft" || seasonStatus === "drafting") {
    return "offseason";
  }

  // 2. In-season: NFL regular/post, OR within KICKOFF_LEAD_DAYS of week-1 kickoff.
  // Deliberately an allowlist, unlike isNflSeasonUnderway above: this one's safe
  // direction is the opposite one (falling back to preseason shows last season's
  // stats, which is merely stale, not wrong), and it is already OR'd with the
  // independent kickoff-date window below.
  const nflStarted = seasonType === "regular" || seasonType === "post";
  const week1 = parseGameDate(week1EarliestGameDate);
  // Anchored on ET midnight of the kickoff day, not UTC midnight (see easternMidnight).
  const withinKickoffWindow =
    week1 != null &&
    now.getTime() >= easternMidnight(week1).getTime() - KICKOFF_LEAD_DAYS * DAY_MS;

  if (nflStarted || withinKickoffWindow) {
    return "in_season";
  }

  // 3. Draft has happened but the season has not started: preseason.
  return "preseason";
}
