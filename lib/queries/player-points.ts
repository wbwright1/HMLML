import { db } from "@/lib/db";
import { playerWeekPoints, players, seasons } from "@/lib/db/schema";
import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { getTrendingAdds } from "@/lib/sleeper";
import { deriveStartingSlots } from "@/lib/lineup-slots";

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
 * Returns, per roster, how many starters have yet to score. Heuristic: a
 * starter counts as "left" when its points are 0 and its projection is > 0
 * (we have no per-game clock status). Keyed by rosterId.
 */
export async function getPlayersLeftCounts(
  seasonId: number,
  week: number
): Promise<Map<string, PlayersLeft>> {
  const result = new Map<string, PlayersLeft>();

  try {
    const rows = await db
      .select({
        rosterId: playerWeekPoints.rosterId,
        points: playerWeekPoints.points,
        projectedPoints: playerWeekPoints.projectedPoints,
      })
      .from(playerWeekPoints)
      .where(
        and(
          eq(playerWeekPoints.seasonId, seasonId),
          eq(playerWeekPoints.week, week),
          eq(playerWeekPoints.started, true)
        )
      );

    for (const row of rows) {
      const entry = result.get(row.rosterId) ?? { left: 0, total: 0 };
      entry.total += 1;
      if (row.points === 0 && (row.projectedPoints ?? 0) > 0) {
        entry.left += 1;
      }
      result.set(row.rosterId, entry);
    }
  } catch (e) {
    console.error("[player-points] getPlayersLeftCounts error:", e);
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
