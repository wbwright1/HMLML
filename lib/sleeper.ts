import { z } from "zod";
import {
  SleeperLeagueSchema,
  SleeperUserSchema,
  SleeperRosterSchema,
  SleeperMatchupSchema,
  SleeperDraftSchema,
  SleeperDraftPickSchema,
  SleeperTransactionSchema,
  SleeperTradedPickSchema,
  SleeperNFLStateSchema,
  SleeperPlayerSchema,
  SleeperBracketMatchSchema,
  SleeperPlayerStatsSchema,
  SleeperWeekStatsSchema,
  SleeperProjectionsSchema,
  SleeperTrendingAddSchema,
  SleeperScheduleGameSchema,
  SleeperSeasonProjectionSchema,
  type SleeperLeague,
  type SleeperUser,
  type SleeperRoster,
  type SleeperMatchup,
  type SleeperDraft,
  type SleeperDraftPick,
  type SleeperTransaction,
  type SleeperTradedPick,
  type SleeperNFLState,
  type SleeperPlayer,
  type SleeperBracketMatch,
  type SleeperPlayerStats,
  type SleeperWeekStats,
  type SleeperProjections,
  type SleeperTrendingAdd,
  type SleeperScheduleGame,
  type SleeperSeasonProjection,
} from "./sleeper-schemas";

// ─── Constants ───────────────────────────────────────────────────────────────

const SLEEPER_BASE_URL = "https://api.sleeper.app/v1";
// The schedule endpoint lives at the API root, NOT under /v1.
const SLEEPER_ROOT_URL = "https://api.sleeper.app";
// Season projections are served from a different host entirely.
const SLEEPER_PROJECTIONS_HOST = "https://api.sleeper.com";

// ─── Result Type ─────────────────────────────────────────────────────────────

export type SleeperResult<T> =
  | { data: T }
  | { error: { message: string; code: string } };

// ─── Generic Fetch Helper ────────────────────────────────────────────────────

async function fetchSleeper<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: { revalidate?: number }
): Promise<SleeperResult<T>> {
  try {
    const url = path.startsWith("http") ? path : `${SLEEPER_BASE_URL}${path}`;
    const res = await fetch(url, {
      next: { revalidate: options?.revalidate ?? 0 },
    });

    if (!res.ok) {
      const message = `Sleeper API returned ${res.status}`;
      console.error(`[sleeper] ${message} for ${path}`);
      return { error: { message, code: "SLEEPER_HTTP_ERROR" } };
    }

    const json = await res.json();
    const parsed = schema.safeParse(json);

    if (!parsed.success) {
      const message = parsed.error.message;
      console.error(
        `[sleeper] Validation error for ${path}: ${message}`
      );
      return { error: { message, code: "SLEEPER_VALIDATION_ERROR" } };
    }

    return { data: parsed.data };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(`[sleeper] Network error for ${path}: ${message}`);
    return { error: { message, code: "SLEEPER_NETWORK_ERROR" } };
  }
}

// ─── API Functions ───────────────────────────────────────────────────────────

/** Fetch league info by league ID. */
export async function getLeague(
  leagueId: string
): Promise<SleeperResult<SleeperLeague>> {
  return fetchSleeper(`/league/${leagueId}`, SleeperLeagueSchema);
}

/**
 * Fetch the leagues a user belongs to for a given NFL season. Used to follow
 * the league chain forward (Sleeper leagues have no forward pointer, only
 * previous_league_id), so next season's league is found by matching its
 * previous_league_id against the current league id.
 */
export async function getUserLeagues(
  userId: string,
  season: string
): Promise<SleeperResult<SleeperLeague[]>> {
  return fetchSleeper(
    `/user/${userId}/leagues/nfl/${season}`,
    z.array(SleeperLeagueSchema)
  );
}

/** Fetch all users in a league. */
export async function getLeagueUsers(
  leagueId: string
): Promise<SleeperResult<SleeperUser[]>> {
  return fetchSleeper(
    `/league/${leagueId}/users`,
    z.array(SleeperUserSchema)
  );
}

/** Fetch all rosters in a league. */
export async function getLeagueRosters(
  leagueId: string
): Promise<SleeperResult<SleeperRoster[]>> {
  return fetchSleeper(
    `/league/${leagueId}/rosters`,
    z.array(SleeperRosterSchema)
  );
}

/** Fetch matchups for a specific week. */
export async function getLeagueMatchups(
  leagueId: string,
  week: number
): Promise<SleeperResult<SleeperMatchup[]>> {
  return fetchSleeper(
    `/league/${leagueId}/matchups/${week}`,
    z.array(SleeperMatchupSchema)
  );
}

/** Fetch all drafts for a league. Cached for 1 hour. */
export async function getLeagueDrafts(
  leagueId: string
): Promise<SleeperResult<SleeperDraft[]>> {
  return fetchSleeper(
    `/league/${leagueId}/drafts`,
    z.array(SleeperDraftSchema),
    { revalidate: 3600 }
  );
}

/** Fetch all picks for a specific draft. */
export async function getDraftPicks(
  draftId: string
): Promise<SleeperResult<SleeperDraftPick[]>> {
  return fetchSleeper(
    `/draft/${draftId}/picks`,
    z.array(SleeperDraftPickSchema)
  );
}

/** Fetch transactions for a league in a specific week. */
export async function getLeagueTransactions(
  leagueId: string,
  week: number
): Promise<SleeperResult<SleeperTransaction[]>> {
  return fetchSleeper(
    `/league/${leagueId}/transactions/${week}`,
    z.array(SleeperTransactionSchema)
  );
}

/** Fetch all traded future picks for a league. Cached for 1 hour. */
export async function getLeagueTradedPicks(
  leagueId: string
): Promise<SleeperResult<SleeperTradedPick[]>> {
  return fetchSleeper(
    `/league/${leagueId}/traded_picks`,
    z.array(SleeperTradedPickSchema),
    { revalidate: 3600 }
  );
}

/** Fetch the winners (playoff) bracket for a league. */
export async function getWinnersBracket(
  leagueId: string
): Promise<SleeperResult<SleeperBracketMatch[]>> {
  return fetchSleeper(
    `/league/${leagueId}/winners_bracket`,
    z.array(SleeperBracketMatchSchema)
  );
}

/** Fetch the losers (consolation/toilet bowl) bracket for a league. */
export async function getLosersBracket(
  leagueId: string
): Promise<SleeperResult<SleeperBracketMatch[]>> {
  return fetchSleeper(
    `/league/${leagueId}/losers_bracket`,
    z.array(SleeperBracketMatchSchema)
  );
}

/** Fetch the current NFL state (season, week, etc.). Cached for 5 minutes. */
export async function getNFLState(): Promise<
  SleeperResult<SleeperNFLState>
> {
  return fetchSleeper("/state/nfl", SleeperNFLStateSchema, { revalidate: 300 });
}

/**
 * Fetch all NFL players. This endpoint returns ~5MB of data.
 * Use sparingly and cache results aggressively.
 * Returns a record keyed by player_id.
 */
export async function getAllPlayers(): Promise<
  SleeperResult<Record<string, SleeperPlayer>>
> {
  return fetchSleeper(
    "/players/nfl",
    z.record(z.string(), SleeperPlayerSchema)
  );
}

/**
 * Fetch season-long player stats for a given NFL season.
 * Returns a record keyed by player_id with pts_ppr, pts_half_ppr, etc.
 */
export async function getPlayerStats(
  season: string | number
): Promise<SleeperResult<SleeperPlayerStats>> {
  return fetchSleeper(
    `https://api.sleeper.app/v1/stats/nfl/regular/${season}`,
    SleeperPlayerStatsSchema
  );
}

/**
 * Fetch per-player weekly box-score stats for a given NFL season and week.
 * Returns a record keyed by player_id with a stat map (pass_yd, rush_td, rec,
 * pts_ppr, gp, and many advanced metrics). Historical stats are served for past
 * seasons. One call covers every player for the week.
 */
export async function getWeekStats(
  season: string | number,
  week: number
): Promise<SleeperResult<SleeperWeekStats>> {
  return fetchSleeper(
    `https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`,
    SleeperWeekStatsSchema
  );
}

/**
 * Fetch per-player weekly projections for a given NFL season and week.
 * Returns a record keyed by player_id with a stat map (pass_yd, rush_td,
 * pts_ppr, pts_half_ppr, pts_std, etc.). Historical projections are served
 * for past seasons.
 */
export async function getWeekProjections(
  season: string | number,
  week: number
): Promise<SleeperResult<SleeperProjections>> {
  return fetchSleeper(
    `https://api.sleeper.app/v1/projections/nfl/regular/${season}/${week}`,
    SleeperProjectionsSchema
  );
}

/**
 * Fetch the NFL schedule for a season type ("regular" | "post") and season.
 * NOTE: this endpoint is served at the API root, not under /v1. Returns an
 * array of games with an NFL-abbreviation home/away and a game status.
 */
export async function getNflSchedule(
  seasonType: string,
  season: string
): Promise<SleeperResult<SleeperScheduleGame[]>> {
  return fetchSleeper(
    `${SLEEPER_ROOT_URL}/schedule/nfl/${seasonType}/${season}`,
    z.array(SleeperScheduleGameSchema)
  );
}

/**
 * Fetch upcoming-season fantasy-point projections (PPR) for skill positions.
 * Unlike the weekly projections endpoint, this is a flat array (not keyed by
 * player_id) and lives on api.sleeper.com, not api.sleeper.app.
 */
export async function getSeasonProjections(
  season: string | number
): Promise<SleeperResult<SleeperSeasonProjection[]>> {
  return fetchSleeper(
    `${SLEEPER_PROJECTIONS_HOST}/projections/nfl/${season}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&order_by=pts_ppr`,
    z.array(SleeperSeasonProjectionSchema)
  );
}

/**
 * Fetch the players most-added across Sleeper in the lookback window.
 * Returns an array of { player_id, count }, ordered by count descending.
 * Cached for 1 hour since it is queried at render time from the players page.
 */
export async function getTrendingAdds(
  lookbackHours = 24,
  limit = 25
): Promise<SleeperResult<SleeperTrendingAdd[]>> {
  return fetchSleeper(
    `/players/nfl/trending/add?lookback_hours=${lookbackHours}&limit=${limit}`,
    SleeperTrendingAddSchema,
    { revalidate: 3600 }
  );
}
