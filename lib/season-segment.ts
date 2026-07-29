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
  const nflStarted = seasonType === "regular" || seasonType === "post";
  const week1 = parseGameDate(week1EarliestGameDate);
  const withinKickoffWindow =
    week1 != null &&
    now.getTime() >= week1.getTime() - KICKOFF_LEAD_DAYS * DAY_MS;

  if (nflStarted || withinKickoffWindow) {
    return "in_season";
  }

  // 3. Draft has happened but the season has not started: preseason.
  return "preseason";
}
