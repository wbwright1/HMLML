import { db } from "@/lib/db";
import { rethrowUnlessTolerable } from "@/lib/db-guard";
import { playerWeekPoints, players, seasons, nflGames } from "@/lib/db/schema";
import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { getTrendingAdds } from "@/lib/sleeper";
import { deriveStartingSlots } from "@/lib/lineup-slots";
import { classifyStarter } from "@/lib/game-status";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LineupRow {
  playerId: string;
  name: string | null;
  position: string | null;
  nflTeam: string | null;
  injuryStatus: string | null;
  slot: string;
  points: number;
  projectedPoints: number | null;
}

export interface LineupSide {
  rosterId: string;
  franchiseId: string;
  starters: LineupRow[];
  bench: LineupRow[];
  totalProjected: number | null;
}

export interface MatchupLineups {
  seasonId: number;
  week: number;
  matchupId: number;
  sides: LineupSide[];
}

export interface PlayersLeft {
  left: number;
  total: number;
}

export interface StarterLiveStats {
  left: number;
  total: number;
  projRemaining: number;
}

export interface TrendingAddPlayer {
  playerId: string;
  name: string | null;
  position: string | null;
  nflTeam: string | null;
  count: number;
}

// Shape of the per-season settings blob stored in seasons.settings_json.
interface SeasonSettingsJson {
  roster_positions?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a slot-label -> priority map from a season's roster_positions, using
 * each label's first appearance among the starting slots. Lets us order a
 * side's starters by roster_positions order rather than by points.
 */
function buildSlotPriority(
  rosterPositions: string[] | null
): Map<string, number> {
  const priority = new Map<string, number>();
  const startingSlots = deriveStartingSlots(rosterPositions);
  startingSlots.forEach((slot, i) => {
    if (!priority.has(slot)) priority.set(slot, i);
  });
  return priority;
}

function sumProjected(rows: LineupRow[]): number | null {
  let sum = 0;
  let any = false;
  for (const r of rows) {
    if (r.projectedPoints != null) {
      sum += r.projectedPoints;
      any = true;
    }
  }
  return any ? Math.round(sum * 100) / 100 : null;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Returns both rosters' lineups for a single matchup pairing. Starters are
 * ordered by the season's roster_positions order (slot order, not points);
 * bench players follow, ordered by points descending.
 */
export async function getMatchupLineups(
  seasonId: number,
  week: number,
  matchupId: number
): Promise<MatchupLineups> {
  const empty: MatchupLineups = { seasonId, week, matchupId, sides: [] };

  try {
    const [seasonRow] = await db
      .select({ settingsJson: seasons.settingsJson })
      .from(seasons)
      .where(eq(seasons.id, seasonId));

    const settings = (seasonRow?.settingsJson ?? null) as SeasonSettingsJson | null;
    const slotPriority = buildSlotPriority(settings?.roster_positions ?? null);

    const rows = await db
      .select({
        rosterId: playerWeekPoints.rosterId,
        franchiseId: playerWeekPoints.franchiseId,
        playerId: playerWeekPoints.playerId,
        points: playerWeekPoints.points,
        projectedPoints: playerWeekPoints.projectedPoints,
        slot: playerWeekPoints.slot,
        started: playerWeekPoints.started,
        name: players.fullName,
        position: players.position,
        nflTeam: players.nflTeam,
        injuryStatus: players.injuryStatus,
      })
      .from(playerWeekPoints)
      .leftJoin(players, eq(playerWeekPoints.playerId, players.id))
      .where(
        and(
          eq(playerWeekPoints.seasonId, seasonId),
          eq(playerWeekPoints.week, week),
          eq(playerWeekPoints.matchupId, matchupId)
        )
      );

    // Group rows into sides keyed by rosterId
    const byRoster = new Map<
      string,
      { franchiseId: string; starters: LineupRow[]; bench: LineupRow[] }
    >();

    for (const row of rows) {
      let side = byRoster.get(row.rosterId);
      if (!side) {
        side = { franchiseId: row.franchiseId, starters: [], bench: [] };
        byRoster.set(row.rosterId, side);
      }
      const lineupRow: LineupRow = {
        playerId: row.playerId,
        name: row.name,
        position: row.position,
        nflTeam: row.nflTeam,
        injuryStatus: row.injuryStatus,
        slot: row.slot ?? "BN",
        points: row.points,
        projectedPoints: row.projectedPoints,
      };
      if (row.started) side.starters.push(lineupRow);
      else side.bench.push(lineupRow);
    }

    const UNRANKED = Number.MAX_SAFE_INTEGER;
    const sides: LineupSide[] = [];
    for (const [rosterId, side] of byRoster) {
      side.starters.sort((a, b) => {
        const pa = slotPriority.get(a.slot) ?? UNRANKED;
        const pb = slotPriority.get(b.slot) ?? UNRANKED;
        if (pa !== pb) return pa - pb;
        if (b.points !== a.points) return b.points - a.points;
        return a.playerId.localeCompare(b.playerId);
      });
      side.bench.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return a.playerId.localeCompare(b.playerId);
      });
      sides.push({
        rosterId,
        franchiseId: side.franchiseId,
        starters: side.starters,
        bench: side.bench,
        totalProjected: sumProjected(side.starters),
      });
    }

    // Stable ordering of the two sides by rosterId
    sides.sort((a, b) => a.rosterId.localeCompare(b.rosterId));

    return { seasonId, week, matchupId, sides };
  } catch (e) {
    console.error("[player-points] getMatchupLineups error:", e);
    return empty;
  }
}

/**
 * Single-scan live stats per roster for a season/week. Computes, per rosterId,
 * the starter count (total), how many have yet to play (left), and their summed
 * projected points still to come (projRemaining).
 *
 * A starter's state comes from the real NFL game status of their team, joined
 * through nfl_games (see classifyStarter): a finished game means the player has
 * played even if they scored 0.0, and a not-yet-started game means they are
 * "left". Every roster with starters appears; projRemaining is 0 once all its
 * starters have played.
 *
 * CRITICAL: if nfl_games has zero rows for this (seasonYear, week), we return an
 * EMPTY map. The UI hides players-left and win-probability when the map is empty,
 * which is the correct behavior; we never fall back to a points heuristic.
 */
export async function getStarterLiveStats(
  seasonId: number,
  week: number
): Promise<Map<string, StarterLiveStats>> {
  const result = new Map<string, StarterLiveStats>();

  try {
    // Resolve the calendar year for this season; nfl_games is keyed on it.
    const [seasonRow] = await db
      .select({ seasonYear: seasons.seasonYear })
      .from(seasons)
      .where(eq(seasons.id, seasonId));

    if (!seasonRow) return result;
    const seasonYear = seasonRow.seasonYear;

    // Build nflTeam -> game status for the week. Both home and away map to the
    // same game's status.
    const gameRows = await db
      .select({
        homeTeam: nflGames.homeTeam,
        awayTeam: nflGames.awayTeam,
        status: nflGames.status,
      })
      .from(nflGames)
      .where(
        and(
          eq(nflGames.seasonYear, seasonYear),
          eq(nflGames.week, week)
        )
      );

    // No schedule for this week: hide, do not guess. Return an empty map.
    if (gameRows.length === 0) return result;

    const statusByTeam = new Map<string, string>();
    for (const g of gameRows) {
      statusByTeam.set(g.homeTeam, g.status);
      statusByTeam.set(g.awayTeam, g.status);
    }

    const rows = await db
      .select({
        rosterId: playerWeekPoints.rosterId,
        points: playerWeekPoints.points,
        projectedPoints: playerWeekPoints.projectedPoints,
        nflTeam: players.nflTeam,
      })
      .from(playerWeekPoints)
      .leftJoin(players, eq(playerWeekPoints.playerId, players.id))
      .where(
        and(
          eq(playerWeekPoints.seasonId, seasonId),
          eq(playerWeekPoints.week, week),
          eq(playerWeekPoints.started, true)
        )
      );

    for (const row of rows) {
      const entry =
        result.get(row.rosterId) ?? { left: 0, total: 0, projRemaining: 0 };
      entry.total += 1;

      const gameStatus = row.nflTeam ? statusByTeam.get(row.nflTeam) ?? null : null;
      const { yetToPlay, projRemaining } = classifyStarter(
        gameStatus,
        row.points,
        row.projectedPoints
      );
      if (yetToPlay) entry.left += 1;
      entry.projRemaining += projRemaining;

      result.set(row.rosterId, entry);
    }

    for (const entry of result.values()) {
      entry.projRemaining = Math.round(entry.projRemaining * 100) / 100;
    }
  } catch (e) {
    console.error("[player-points] getStarterLiveStats error:", e);
  }

  return result;
}

/**
 * Returns, per roster, how many starters have yet to score. Thin derivation of
 * getStarterLiveStats. Keyed by rosterId.
 */
export async function getPlayersLeftCounts(
  seasonId: number,
  week: number
): Promise<Map<string, PlayersLeft>> {
  const stats = await getStarterLiveStats(seasonId, week);
  const result = new Map<string, PlayersLeft>();
  for (const [rosterId, { left, total }] of stats) {
    result.set(rosterId, { left, total });
  }
  return result;
}

/**
 * Returns, per roster, the projected points still to be scored this week: the
 * sum of projected_points across starters that have yet to score. Thin
 * derivation of getStarterLiveStats. Keyed by rosterId; only rosters with
 * remaining projection appear (a roster whose starters have all scored is
 * absent). Feeds the live win-probability model.
 */
export async function getProjectedRemainingByRoster(
  seasonId: number,
  week: number
): Promise<Map<string, number>> {
  const stats = await getStarterLiveStats(seasonId, week);
  const result = new Map<string, number>();
  for (const [rosterId, { projRemaining }] of stats) {
    if (projRemaining > 0) {
      result.set(rosterId, projRemaining);
    }
  }
  return result;
}

/**
 * Returns a map of playerId -> projected_points for every rostered player in
 * the given season/week. Used for roster and players-page PROJ columns.
 */
export async function getCurrentWeekProjectionsByPlayer(
  seasonId: number,
  week: number
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  try {
    const rows = await db
      .select({
        playerId: playerWeekPoints.playerId,
        projectedPoints: playerWeekPoints.projectedPoints,
      })
      .from(playerWeekPoints)
      .where(
        and(
          eq(playerWeekPoints.seasonId, seasonId),
          eq(playerWeekPoints.week, week),
          isNotNull(playerWeekPoints.projectedPoints)
        )
      );

    for (const row of rows) {
      if (row.projectedPoints != null) {
        result.set(row.playerId, row.projectedPoints);
      }
    }
  } catch (e) {
    console.error(
      "[player-points] getCurrentWeekProjectionsByPlayer error:",
      e
    );
  }

  return result;
}

/**
 * Per-player current-week status for the players page's merged "WK" column.
 * Returns a map of playerId -> { points, projected, gameStatus } for the given
 * season/week, where gameStatus is the real NFL game status of the player's
 * team (from nfl_games), joined via nflTeam.
 *
 * CRITICAL: played/not-played is decided downstream from gameStatus (see
 * decideWeekDisplay), NEVER from a points heuristic. When nfl_games has zero
 * rows for the (seasonYear, week), every gameStatus is null, which correctly
 * yields projections for all players.
 */
export interface CurrentWeekPlayerStatus {
  points: number | null;
  projected: number | null;
  gameStatus: string | null;
}

export async function getCurrentWeekPlayerStatusByPlayer(
  seasonId: number,
  week: number
): Promise<Map<string, CurrentWeekPlayerStatus>> {
  const result = new Map<string, CurrentWeekPlayerStatus>();

  try {
    const [seasonRow] = await db
      .select({ seasonYear: seasons.seasonYear })
      .from(seasons)
      .where(eq(seasons.id, seasonId));

    if (!seasonRow) return result;
    const seasonYear = seasonRow.seasonYear;

    // nflTeam -> game status for the week (both sides of each game).
    const gameRows = await db
      .select({
        homeTeam: nflGames.homeTeam,
        awayTeam: nflGames.awayTeam,
        status: nflGames.status,
      })
      .from(nflGames)
      .where(and(eq(nflGames.seasonYear, seasonYear), eq(nflGames.week, week)));

    const statusByTeam = new Map<string, string>();
    for (const g of gameRows) {
      statusByTeam.set(g.homeTeam, g.status);
      statusByTeam.set(g.awayTeam, g.status);
    }

    const rows = await db
      .select({
        playerId: playerWeekPoints.playerId,
        points: playerWeekPoints.points,
        projectedPoints: playerWeekPoints.projectedPoints,
        nflTeam: players.nflTeam,
      })
      .from(playerWeekPoints)
      .leftJoin(players, eq(playerWeekPoints.playerId, players.id))
      .where(
        and(
          eq(playerWeekPoints.seasonId, seasonId),
          eq(playerWeekPoints.week, week)
        )
      );

    for (const row of rows) {
      // A player can appear once per week; keep the first row seen.
      if (result.has(row.playerId)) continue;
      const gameStatus = row.nflTeam
        ? statusByTeam.get(row.nflTeam) ?? null
        : null;
      result.set(row.playerId, {
        points: row.points ?? null,
        projected: row.projectedPoints ?? null,
        gameStatus,
      });
    }
  } catch (e) {
    // A week with no points rows yet is a real outcome and returns an empty
    // map. A rejected query is not: falling through would leave the map empty,
    // the roster page's `size > 0` guard would drop the WK column, and the page
    // would ISR-cache with the wrong headline column and no error (#253).
    //
    // Guard before logging: on the intolerable path this throws and the caller
    // reports it, so logging above would double-report every prod failure.
    rethrowUnlessTolerable(e);
    console.error(
      "[player-points] getCurrentWeekPlayerStatusByPlayer error:",
      e
    );
  }

  return result;
}

/**
 * Returns the most-added players across Sleeper, joined with local player
 * records for names/positions/teams, ordered by add count descending.
 *
 * Degrades gracefully: an empty array if the Sleeper call or the local join
 * fails, keeping the two concerns separable so a DB outage does not break the
 * players page.
 */
export async function getTrendingAddPlayers(
  limit = 10
): Promise<TrendingAddPlayer[]> {
  const trendingResult = await getTrendingAdds(24, limit);
  if ("error" in trendingResult) {
    console.error(
      "[player-points] getTrendingAddPlayers Sleeper error:",
      trendingResult.error.message
    );
    return [];
  }

  const trending = trendingResult.data;
  if (trending.length === 0) return [];

  const countByPlayer = new Map<string, number>();
  for (const t of trending) {
    countByPlayer.set(t.player_id, t.count);
  }

  try {
    const ids = [...countByPlayer.keys()];
    const rows = await db
      .select({
        id: players.id,
        name: players.fullName,
        position: players.position,
        nflTeam: players.nflTeam,
      })
      .from(players)
      .where(inArray(players.id, ids));

    const byId = new Map(rows.map((r) => [r.id, r]));

    return trending
      .map((t) => {
        const row = byId.get(t.player_id);
        return {
          playerId: t.player_id,
          name: row?.name ?? null,
          position: row?.position ?? null,
          nflTeam: row?.nflTeam ?? null,
          count: t.count,
        };
      })
      .sort((a, b) => b.count - a.count);
  } catch (e) {
    console.error("[player-points] getTrendingAddPlayers join error:", e);
    return [];
  }
}
