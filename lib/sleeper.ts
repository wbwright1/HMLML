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
} from "./sleeper-schemas";

// ─── Constants ───────────────────────────────────────────────────────────────

const SLEEPER_BASE_URL = "https://api.sleeper.app/v1";

// ─── Result Type ─────────────────────────────────────────────────────────────

export type SleeperResult<T> =
  | { data: T }
  | { error: { message: string; code: string } };

// ─── Generic Fetch Helper ────────────────────────────────────────────────────

async function fetchSleeper<T>(
  path: string,
  schema: z.ZodType<T>
): Promise<SleeperResult<T>> {
  try {
    const url = path.startsWith("http") ? path : `${SLEEPER_BASE_URL}${path}`;
    const res = await fetch(url);

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

/** Fetch all drafts for a league. */
export async function getLeagueDrafts(
  leagueId: string
): Promise<SleeperResult<SleeperDraft[]>> {
  return fetchSleeper(
    `/league/${leagueId}/drafts`,
    z.array(SleeperDraftSchema)
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

/** Fetch all traded future picks for a league. */
export async function getLeagueTradedPicks(
  leagueId: string
): Promise<SleeperResult<SleeperTradedPick[]>> {
  return fetchSleeper(
    `/league/${leagueId}/traded_picks`,
    z.array(SleeperTradedPickSchema)
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

/** Fetch the current NFL state (season, week, etc.). */
export async function getNFLState(): Promise<
  SleeperResult<SleeperNFLState>
> {
  return fetchSleeper("/state/nfl", SleeperNFLStateSchema);
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
