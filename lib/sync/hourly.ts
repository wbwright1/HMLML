import { db } from "@/lib/db";
import {
  seasons,
  matchups,
  transactions,
  franchiseSeasons,
  rosterPlayers,
  playerWeekPoints,
  nflGames,
  type NewPlayerWeekPoints,
  type NewNflGame,
} from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  getLeague,
  getLeagueMatchups,
  getLeagueTransactions,
  getLeagueRosters,
  getWeekProjections,
  getNflSchedule,
} from "@/lib/sleeper";
import { resolveNflState } from "@/lib/sync/nfl-state";
import type {
  SleeperMatchup,
  SleeperProjections,
  SleeperScheduleGame,
} from "@/lib/sleeper-schemas";
import { alignStarterSlots, computeProjectedPoints } from "@/lib/lineup-slots";
import { logSyncStart, logSyncComplete } from "@/lib/queries/sync-log";
import { getRosterToFranchiseMap } from "@/lib/queries/franchise-mapping";
import { resolveDivisionName } from "@/lib/divisions";

// Shape of the per-season settings blob stored in seasons.settings_json.
interface SeasonSettingsJson {
  scoring_settings?: Record<string, number>;
  roster_positions?: string[];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SyncStepResult {
  dataType: string;
  status: "success" | "failure";
  rowCount: number;
  durationMs: number;
  error?: string;
  // Non-fatal advisory (e.g. NFL state served from DB fallback).
  note?: string;
}

export interface HourlySyncSummary {
  startedAt: string;
  completedAt: string;
  season: string;
  week: number;
  results: SyncStepResult[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Step A: Sync Transactions for Current Week
// ---------------------------------------------------------------------------

async function syncTransactions(
  leagueId: string,
  seasonId: number,
  week: number
): Promise<SyncStepResult> {
  const startTime = Date.now();
  const logId = await logSyncStart("hourly", "transactions");

  try {
    const result = await getLeagueTransactions(leagueId, week);

    if ("error" in result) {
      throw new Error(
        `Sleeper transactions API error: ${result.error.message}`
      );
    }

    const txns = result.data;
    let rowCount = 0;

    for (const txn of txns) {
      await db
        .insert(transactions)
        .values({
          seasonId,
          transactionId: txn.transaction_id,
          type: txn.type,
          status: txn.status,
          week: txn.week ?? week,
          rosterIds: txn.roster_ids,
          adds: txn.adds,
          drops: txn.drops,
          draftPicksInvolved: txn.draft_picks,
          createdAtSleeper: txn.created,
        })
        .onConflictDoUpdate({
          target: transactions.transactionId,
          set: {
            status: txn.status,
            adds: txn.adds,
            drops: txn.drops,
            draftPicksInvolved: txn.draft_picks,
          },
        });
      rowCount++;
    }

    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "success", rowCount);
    return { dataType: "transactions", status: "success", rowCount, durationMs };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "failure", 0, errorMessage);
    return {
      dataType: "transactions",
      status: "failure",
      rowCount: 0,
      durationMs,
      error: errorMessage,
    };
  }
}

// ---------------------------------------------------------------------------
// Step B: Sync Rosters and Traded Picks
// ---------------------------------------------------------------------------

async function syncRostersAndPicks(
  leagueId: string,
  seasonId: number
): Promise<SyncStepResult> {
  const startTime = Date.now();
  const logId = await logSyncStart("hourly", "rosters");

  try {
    const [rostersResult, leagueResult] = await Promise.all([
      getLeagueRosters(leagueId),
      getLeague(leagueId),
    ]);

    if ("error" in rostersResult) {
      throw new Error(
        `Sleeper rosters API error: ${rostersResult.error.message}`
      );
    }
    if ("error" in leagueResult) {
      throw new Error(
        `Sleeper league API error: ${leagueResult.error.message}`
      );
    }

    const rosters = rostersResult.data;
    const leagueMetadata = leagueResult.data.metadata;
    let rowCount = 0;

    const rosterToFranchise = await getRosterToFranchiseMap(seasonId);

    // Update standings from roster settings
    for (const roster of rosters) {
      const rosterIdStr = String(roster.roster_id);
      const franchiseId = rosterToFranchise.get(rosterIdStr);
      if (!franchiseId) continue;

      const fpts = roster.settings.fpts ?? 0;
      const fptsDecimal = roster.settings.fpts_decimal ?? 0;
      const pointsScored = fpts + fptsDecimal / 100;

      const fptsAgainst = roster.settings.fpts_against ?? 0;
      const fptsAgainstDecimal = roster.settings.fpts_against_decimal ?? 0;
      const pointsAgainst = fptsAgainst + fptsAgainstDecimal / 100;

      const divisionNumber = roster.settings.division ?? null;
      const divisionName =
        divisionNumber != null
          ? resolveDivisionName(leagueMetadata, divisionNumber)
          : null;

      await db
        .update(franchiseSeasons)
        .set({
          division: divisionNumber,
          divisionName,
          wins: roster.settings.wins ?? 0,
          losses: roster.settings.losses ?? 0,
          ties: roster.settings.ties ?? 0,
          pointsScored,
          pointsAgainst,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(franchiseSeasons.franchiseId, franchiseId),
            eq(franchiseSeasons.seasonId, seasonId)
          )
        );

      // Sync roster players
      const allPlayers = [
        ...(roster.starters ?? []).map((pid) => ({ playerId: pid, slot: "starter" })),
        ...(roster.players ?? [])
          .filter((pid) => !(roster.starters ?? []).includes(pid))
          .filter((pid) => !(roster.reserve ?? []).includes(pid))
          .filter((pid) => !(roster.taxi ?? []).includes(pid))
          .map((pid) => ({ playerId: pid, slot: "bench" })),
        ...(roster.reserve ?? []).map((pid) => ({ playerId: pid, slot: "ir" })),
        ...(roster.taxi ?? []).map((pid) => ({ playerId: pid, slot: "taxi" })),
      ];

      // Delete existing roster_players for this franchise+season so dropped
      // players are cleaned up, then re-insert the current roster. Wrapped in a
      // transaction so a mid-loop failure can't leave a partial wipe (the
      // delete rolls back with the failed insert). Insert errors are NOT
      // swallowed: an id missing from the players table (FK violation) rolls
      // back this roster and propagates to the sync error handler / sync_log.
      await db.transaction(async (tx) => {
        await tx
          .delete(rosterPlayers)
          .where(
            and(
              eq(rosterPlayers.seasonId, seasonId),
              eq(rosterPlayers.rosterId, rosterIdStr)
            )
          );

        for (const p of allPlayers) {
          await tx
            .insert(rosterPlayers)
            .values({
              seasonId,
              franchiseId,
              rosterId: rosterIdStr,
              playerId: p.playerId,
              slot: p.slot,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [
                rosterPlayers.seasonId,
                rosterPlayers.rosterId,
                rosterPlayers.playerId,
              ],
              set: {
                slot: p.slot,
                franchiseId,
                updatedAt: new Date(),
              },
            });
        }
      });

      rowCount++;
    }

    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "success", rowCount);
    return { dataType: "rosters", status: "success", rowCount, durationMs };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "failure", 0, errorMessage);
    return {
      dataType: "rosters",
      status: "failure",
      rowCount: 0,
      durationMs,
      error: errorMessage,
    };
  }
}

// ---------------------------------------------------------------------------
// Step C: Sync Matchup Scores for Current Week
// ---------------------------------------------------------------------------

/**
 * Returns the set of weeks (for a given NFL season year) whose games are all
 * complete, read from the nfl_games schedule. A week counts as final only when
 * it has at least one game row AND every game for that week has status
 * "complete". This is the game-status source of truth used to decide whether a
 * matchup is over, replacing the old "both sides have points > 0" heuristic
 * that stamped a winner minutes after Sunday kickoff.
 *
 * Safe to aggregate over (season_year, week) alone: syncNflSchedule never
 * stores post-season rows whose playoff-round number collides with a
 * regular-season week (see the note there), so every row counted here is a
 * regular-season game and the week numbers are unambiguous.
 */
async function getCompleteNflWeeks(seasonYear: number): Promise<Set<number>> {
  const rows = await db
    .select({ week: nflGames.week, status: nflGames.status })
    .from(nflGames)
    .where(eq(nflGames.seasonYear, seasonYear));

  const byWeek = new Map<number, { total: number; complete: number }>();
  for (const r of rows) {
    const agg = byWeek.get(r.week) ?? { total: 0, complete: 0 };
    agg.total += 1;
    if (r.status === "complete") agg.complete += 1;
    byWeek.set(r.week, agg);
  }

  const completeWeeks = new Set<number>();
  for (const [week, agg] of byWeek) {
    if (agg.total > 0 && agg.complete === agg.total) completeWeeks.add(week);
  }
  return completeWeeks;
}

async function syncMatchupScores(
  leagueId: string,
  seasonId: number,
  seasonYear: number,
  currentWeek: number
): Promise<SyncStepResult> {
  const startTime = Date.now();
  const logId = await logSyncStart("hourly", "matchups");

  try {
    const rosterToFranchise = await getRosterToFranchiseMap(seasonId);

    // Which weeks are truly final, by NFL game status (never by points).
    const completeNflWeeks = await getCompleteNflWeeks(seasonYear);

    // Get season info for playoff detection
    const [seasonRow] = await db
      .select({ playoffWeekStart: seasons.playoffWeekStart })
      .from(seasons)
      .where(eq(seasons.id, seasonId));

    const playoffWeekStart = seasonRow?.playoffWeekStart ?? 15;

    // Path A: sync every regular-season week (1..playoffWeekStart-1), not just
    // currentWeek, so the full-season schedule lands in `matchups` and is
    // queryable for forward-looking schedule views. Future weeks come back
    // from Sleeper with points 0, which the status logic below already maps
    // to "scheduled". Always include the real currentWeek too, since it may
    // fall in the playoff range (>= playoffWeekStart) and would otherwise be
    // skipped.
    const weeksToSync = new Set<number>();
    for (let w = 1; w < playoffWeekStart; w++) {
      weeksToSync.add(w);
    }
    weeksToSync.add(currentWeek);

    let rowCount = 0;

    for (const week of Array.from(weeksToSync).sort((a, b) => a - b)) {
      const result = await getLeagueMatchups(leagueId, week);

      if ("error" in result) {
        throw new Error(
          `Sleeper matchups API error (week ${week}): ${result.error.message}`
        );
      }

      const sleeperMatchups = result.data;
      const isPlayoffWeek = week >= playoffWeekStart;

      // A week is final only when all its NFL games are complete. This is what
      // gates a matchup to "complete" and lets a winner be stamped; a points
      // lead mid-game must never finalize the result.
      const weekIsFinal = completeNflWeeks.has(week);

      // Group Sleeper matchups by matchup_id to determine winners
      const grouped = new Map<number, typeof sleeperMatchups>();
      for (const m of sleeperMatchups) {
        if (m.matchup_id == null) continue;
        if (!grouped.has(m.matchup_id)) {
          grouped.set(m.matchup_id, []);
        }
        grouped.get(m.matchup_id)!.push(m);
      }

      for (const [sleeperMatchupId, pair] of grouped) {
        for (const m of pair) {
          const rosterIdStr = String(m.roster_id);
          const franchiseId = rosterToFranchise.get(rosterIdStr);
          if (!franchiseId) continue;

          const points = m.points ?? 0;

          // Only decide a winner once the week's NFL games are final. A winner
          // stamped from a mid-game points lead is the bug this replaces.
          let isWinner: boolean | null = null;
          if (weekIsFinal && pair.length === 2) {
            const opponent = pair.find((p) => p.roster_id !== m.roster_id);
            const oppPts = opponent?.points ?? 0;
            if (opponent && points !== oppPts) {
              isWinner = points > oppPts;
            }
          }

          // Determine status from real game state, never from points:
          // - "complete" once every NFL game of the week is final
          // - "in_progress" when games are underway (points on the board)
          // - "scheduled" otherwise (future weeks Sleeper has paired but not played)
          let status = "scheduled";
          if (weekIsFinal) {
            status = "complete";
          } else if (points > 0) {
            status = "in_progress";
          }

          await db
            .insert(matchups)
            .values({
              seasonId,
              week,
              matchupId: sleeperMatchupId,
              franchiseId,
              rosterId: rosterIdStr,
              points,
              isWinner,
              isPlayoff: isPlayoffWeek,
              status,
            })
            .onConflictDoUpdate({
              target: [matchups.seasonId, matchups.week, matchups.rosterId],
              set: {
                matchupId: sleeperMatchupId,
                franchiseId,
                points,
                isWinner,
                isPlayoff: isPlayoffWeek,
                status,
                updatedAt: new Date(),
              },
            });

          rowCount++;
        }
      }
    }

    // Backstop: any matchup from a prior week is definitely over, so mark it
    // complete. This MUST key off the real currentWeek (the actual NFL week
    // from /v1/state/nfl), never the loop variable above; otherwise future
    // weeks synced ahead of schedule would get marked complete before being
    // played. Unlike a blanket status flip, we also stamp is_winner here from
    // the (now final) points, so a game that reached this path with a null
    // winner does not stay winnerless. Ties (equal points) leave is_winner
    // null, which reads correctly as "no winner" downstream.
    if (currentWeek > 1) {
      // Fetch the full prior-week pairing set (regardless of status) so each
      // matchup has both sides available to compare, then update only rows
      // that still need it.
      const priorRows = await db
        .select({
          id: matchups.id,
          week: matchups.week,
          matchupId: matchups.matchupId,
          rosterId: matchups.rosterId,
          points: matchups.points,
          status: matchups.status,
          isWinner: matchups.isWinner,
        })
        .from(matchups)
        .where(
          and(
            eq(matchups.seasonId, seasonId),
            sql`${matchups.week} < ${currentWeek}`
          )
        );

      const priorGroups = new Map<string, typeof priorRows>();
      for (const row of priorRows) {
        const key = `${row.week}|${row.matchupId}`;
        if (!priorGroups.has(key)) priorGroups.set(key, []);
        priorGroups.get(key)!.push(row);
      }

      for (const rows of priorGroups.values()) {
        for (const row of rows) {
          let desiredWinner: boolean | null = null;
          if (rows.length === 2) {
            const opponent = rows.find((o) => o.rosterId !== row.rosterId);
            const oppPts = opponent?.points ?? 0;
            const pts = row.points ?? 0;
            if (opponent && pts !== oppPts) {
              desiredWinner = pts > oppPts;
            }
          }

          const needsStatus = row.status !== "complete";
          const needsWinner = row.isWinner == null && desiredWinner != null;
          if (!needsStatus && !needsWinner) continue;

          await db
            .update(matchups)
            .set({
              status: "complete",
              isWinner: desiredWinner,
              updatedAt: new Date(),
            })
            .where(eq(matchups.id, row.id));
        }
      }
    }

    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "success", rowCount);
    return { dataType: "matchups", status: "success", rowCount, durationMs };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "failure", 0, errorMessage);
    return {
      dataType: "matchups",
      status: "failure",
      rowCount: 0,
      durationMs,
      error: errorMessage,
    };
  }
}

// ---------------------------------------------------------------------------
// Step D: Sync Per-Player Weekly Points
// ---------------------------------------------------------------------------

/** Split an array into chunks of the given size. */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export interface PlayerPointsWriteInput {
  seasonId: number;
  week: number;
  matchups: SleeperMatchup[];
  rosterToFranchise: Map<string, string>;
  scoringSettings: Record<string, number> | null;
  rosterPositions: string[] | null;
  projections: SleeperProjections | null;
}

/**
 * Core write logic for player_week_points, shared by the hourly sync and the
 * historical backfill. Builds starter + bench rows for every matchup roster and
 * batch-upserts them. Returns the number of rows written.
 *
 * - Starter slots come from alignStarterSlots; bench players get slot 'BN'.
 * - Points come from players_points (keyed by player id), falling back to
 *   starters_points by index for starters, then 0.
 * - projected_points is computed from the season's scoring settings joined with
 *   the week's projections; null when no projection is available.
 */
export async function upsertPlayerWeekPoints(
  input: PlayerPointsWriteInput
): Promise<number> {
  const {
    seasonId,
    week,
    matchups: sleeperMatchups,
    rosterToFranchise,
    scoringSettings,
    rosterPositions,
    projections,
  } = input;

  // Dedupe by (rosterId, playerId) so a duplicated player id can't trigger an
  // "ON CONFLICT cannot affect row a second time" error in a batch insert.
  const rowMap = new Map<string, NewPlayerWeekPoints>();
  const now = new Date();

  const projectedFor = (playerId: string): number | null =>
    computeProjectedPoints(scoringSettings, projections?.[playerId] ?? null);

  for (const m of sleeperMatchups) {
    const rosterIdStr = String(m.roster_id);
    const franchiseId = rosterToFranchise.get(rosterIdStr);
    if (!franchiseId) continue;

    const matchupId = m.matchup_id ?? null;
    const starters = m.starters ?? [];
    const startersPoints = m.starters_points ?? [];
    const playersPoints = m.players_points ?? {};
    const allPlayers = m.players ?? [];

    // First (non-empty) index of each starter, for the starters_points fallback.
    const starterIndex = new Map<string, number>();
    starters.forEach((pid, i) => {
      if (pid && pid !== "0" && !starterIndex.has(pid)) {
        starterIndex.set(pid, i);
      }
    });

    const aligned = alignStarterSlots(rosterPositions, starters);
    const starterIds = new Set(aligned.map((s) => s.playerId));

    for (const { playerId, slot } of aligned) {
      const idx = starterIndex.get(playerId);
      const points =
        playersPoints[playerId] ??
        (idx != null ? startersPoints[idx] : undefined) ??
        0;
      rowMap.set(`${rosterIdStr}|${playerId}`, {
        seasonId,
        week,
        rosterId: rosterIdStr,
        franchiseId,
        matchupId,
        playerId,
        points,
        projectedPoints: projectedFor(playerId),
        slot,
        started: true,
        updatedAt: now,
      });
    }

    for (const playerId of allPlayers) {
      if (!playerId || playerId === "0" || starterIds.has(playerId)) continue;
      rowMap.set(`${rosterIdStr}|${playerId}`, {
        seasonId,
        week,
        rosterId: rosterIdStr,
        franchiseId,
        matchupId,
        playerId,
        points: playersPoints[playerId] ?? 0,
        projectedPoints: projectedFor(playerId),
        slot: "BN",
        started: false,
        updatedAt: now,
      });
    }
  }

  const rows = [...rowMap.values()];
  if (rows.length === 0) return 0;

  for (const batch of chunk(rows, 100)) {
    await db
      .insert(playerWeekPoints)
      .values(batch)
      .onConflictDoUpdate({
        target: [
          playerWeekPoints.seasonId,
          playerWeekPoints.week,
          playerWeekPoints.rosterId,
          playerWeekPoints.playerId,
        ],
        set: {
          franchiseId: sql`excluded.franchise_id`,
          matchupId: sql`excluded.matchup_id`,
          points: sql`excluded.points`,
          projectedPoints: sql`excluded.projected_points`,
          slot: sql`excluded.slot`,
          started: sql`excluded.started`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  return rows.length;
}

/**
 * Loads a season's scoring settings and roster positions from
 * seasons.settings_json.
 */
async function getSeasonScoringConfig(seasonId: number): Promise<{
  scoringSettings: Record<string, number> | null;
  rosterPositions: string[] | null;
}> {
  const [seasonRow] = await db
    .select({ settingsJson: seasons.settingsJson })
    .from(seasons)
    .where(eq(seasons.id, seasonId));

  const settings = (seasonRow?.settingsJson ?? null) as SeasonSettingsJson | null;
  return {
    scoringSettings: settings?.scoring_settings ?? null,
    rosterPositions: settings?.roster_positions ?? null,
  };
}

async function syncPlayerWeekPoints(
  leagueId: string,
  seasonId: number,
  seasonYear: number,
  week: number
): Promise<SyncStepResult> {
  const startTime = Date.now();
  const logId = await logSyncStart("hourly", "player_week_points");

  try {
    const result = await getLeagueMatchups(leagueId, week);
    if ("error" in result) {
      throw new Error(`Sleeper matchups API error: ${result.error.message}`);
    }

    // roster_id -> franchise_id mapping for this season
    const rosterToFranchise = await getRosterToFranchiseMap(seasonId);

    const { scoringSettings, rosterPositions } =
      await getSeasonScoringConfig(seasonId);

    // Fetch projections once for the whole week. A failure here is non-fatal:
    // player points still persist, just without projected_points.
    let projections: SleeperProjections | null = null;
    const projResult = await getWeekProjections(seasonYear, week);
    if (!("error" in projResult)) {
      projections = projResult.data;
    }

    const rowCount = await upsertPlayerWeekPoints({
      seasonId,
      week,
      matchups: result.data,
      rosterToFranchise,
      scoringSettings,
      rosterPositions,
      projections,
    });

    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "success", rowCount);
    return {
      dataType: "player_week_points",
      status: "success",
      rowCount,
      durationMs,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "failure", 0, errorMessage);
    return {
      dataType: "player_week_points",
      status: "failure",
      rowCount: 0,
      durationMs,
      error: errorMessage,
    };
  }
}

// ---------------------------------------------------------------------------
// Step E: Sync NFL Schedule (game statuses)
// ---------------------------------------------------------------------------

/**
 * Batch-upserts NFL schedule rows into nfl_games, keyed on game_id. Shared by
 * the hourly sync step and the historical backfill (like upsertPlayerWeekPoints).
 * Updates status/date/week/teams on conflict. Returns the number of rows written.
 */
export async function upsertNflGames(
  seasonYear: number,
  games: SleeperScheduleGame[]
): Promise<number> {
  // Dedupe by game_id so a repeated id can't trigger an "ON CONFLICT cannot
  // affect row a second time" error within a single batch insert.
  const rowMap = new Map<string, NewNflGame>();
  const now = new Date();

  for (const g of games) {
    rowMap.set(g.game_id, {
      gameId: g.game_id,
      seasonYear,
      week: g.week,
      gameDate: g.date ?? null,
      homeTeam: g.home,
      awayTeam: g.away,
      status: g.status,
      updatedAt: now,
    });
  }

  const rows = [...rowMap.values()];
  if (rows.length === 0) return 0;

  for (const batch of chunk(rows, 100)) {
    await db
      .insert(nflGames)
      .values(batch)
      .onConflictDoUpdate({
        target: nflGames.gameId,
        set: {
          seasonYear: sql`excluded.season_year`,
          week: sql`excluded.week`,
          gameDate: sql`excluded.game_date`,
          homeTeam: sql`excluded.home_team`,
          awayTeam: sql`excluded.away_team`,
          status: sql`excluded.status`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  return rows.length;
}

/**
 * Fetches the current season's NFL schedule and upserts it into nfl_games. The
 * regular-season schedule is required; the post-season schedule is fetched too
 * and upserted only when the endpoint serves games (it returns [] for a season
 * whose playoffs haven't been scheduled).
 *
 * Verified week numbering (curl schedule/nfl/post/{season}): Sleeper's
 * post-season feed numbers the playoff ROUNDS 1..4 (wild card .. Super Bowl),
 * which collide head-on with regular-season / fantasy weeks 1..4. nfl_games is
 * keyed only by (season_year, week) with no season_type column, so storing a
 * January playoff row at week 1 would sit alongside September's regular week 1
 * and, since those playoff games are pre_game until played, would un-finalize
 * fantasy week 1 in getCompleteNflWeeks (and pollute the week-1 game joins in
 * kickoff.ts / player-points.ts). No fantasy feature consumes NFL post-season
 * games, so the minimal, migration-free guard is to skip any post-season row
 * whose week collides with a regular-season week (currently all of them).
 */
async function syncNflSchedule(seasonYear: number): Promise<SyncStepResult> {
  const startTime = Date.now();
  const logId = await logSyncStart("hourly", "nfl_games");

  try {
    const seasonStr = String(seasonYear);

    const regularResult = await getNflSchedule("regular", seasonStr);
    if ("error" in regularResult) {
      throw new Error(
        `Sleeper schedule API error (regular): ${regularResult.error.message}`
      );
    }

    let rowCount = await upsertNflGames(seasonYear, regularResult.data);

    const regularWeeks = new Set(regularResult.data.map((g) => g.week));

    // Post-season is optional: absent/empty for seasons not yet in the playoffs.
    // Drop rows whose week collides with a regular-season week (see note above).
    const postResult = await getNflSchedule("post", seasonStr);
    if (!("error" in postResult) && postResult.data.length > 0) {
      const nonCollidingPost = postResult.data.filter(
        (g) => !regularWeeks.has(g.week)
      );
      if (nonCollidingPost.length > 0) {
        rowCount += await upsertNflGames(seasonYear, nonCollidingPost);
      }
    }

    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "success", rowCount);
    return { dataType: "nfl_games", status: "success", rowCount, durationMs };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "failure", 0, errorMessage);
    return {
      dataType: "nfl_games",
      status: "failure",
      rowCount: 0,
      durationMs,
      error: errorMessage,
    };
  }
}

// ---------------------------------------------------------------------------
// Main: Run Hourly Sync
// ---------------------------------------------------------------------------

export async function runHourlySync(): Promise<HourlySyncSummary> {
  const startedAt = new Date().toISOString();

  // Resolve NFL state, degrading to the last-synced DB state if /state/nfl is
  // down or fails validation. Only abort when no fallback can be reconstructed.
  const resolved = await resolveNflState();

  if (!resolved) {
    return {
      startedAt,
      completedAt: new Date().toISOString(),
      season: "unknown",
      week: 0,
      results: [
        {
          dataType: "nfl_state",
          status: "failure",
          rowCount: 0,
          durationMs: 0,
          error:
            "Failed to get NFL state and no DB fallback available. Run daily sync first.",
        },
      ],
    };
  }

  const nflState = resolved.state;
  const seasonYear = parseInt(nflState.season, 10);
  const currentWeek = nflState.week;
  const nflStateNote = resolved.fromFallback
    ? "NFL state served from DB fallback (live /state/nfl unavailable)"
    : undefined;

  // Look up the season in our database
  const [seasonRow] = await db
    .select({ id: seasons.id, leagueId: seasons.leagueId })
    .from(seasons)
    .where(eq(seasons.seasonYear, seasonYear));

  if (!seasonRow) {
    // In the offseason/preseason Sleeper's /state/nfl already reports the
    // upcoming year (e.g. season 2026, season_type "off") before that league
    // has been created in Sleeper and synced into our DB. There is nothing to
    // sync yet, so this is an expected wait, not a failure: return a SUCCESS
    // summary with a no-op advisory. A missing season row during regular/post
    // play IS a real problem (the daily sync should have created it), so keep
    // that a failure.
    const isPreOrOff =
      nflState.season_type === "off" || nflState.season_type === "pre";
    return {
      startedAt,
      completedAt: new Date().toISOString(),
      season: nflState.season,
      week: currentWeek,
      results: [
        isPreOrOff
          ? {
              dataType: "season_lookup",
              status: "success",
              rowCount: 0,
              durationMs: 0,
              note: `Season ${seasonYear} not in database yet (season_type "${nflState.season_type}"); nothing to sync until the new league is created. Waiting.`,
            }
          : {
              dataType: "season_lookup",
              status: "failure",
              rowCount: 0,
              durationMs: 0,
              error: `Season ${seasonYear} not found in database. Run daily sync first.`,
            },
      ],
    };
  }

  // Use the league id recorded on the season row (written by the daily sync,
  // which auto-advances the league chain). Reading the env id here instead
  // could sync the previous season's league into the new season after an
  // auto-advance.
  const leagueId = seasonRow.leagueId;
  const seasonId = seasonRow.id;

  // Sync the NFL schedule FIRST so matchup completeness (which now keys off
  // real game statuses in nfl_games) reads this run's fresh statuses rather
  // than last hour's. A schedule failure is non-fatal: matchups then fall back
  // to the previously-synced game statuses.
  const scheduleResult = await syncNflSchedule(seasonYear);

  // Run the remaining syncs independently; a failure in one doesn't block
  // others. Per-player points are a separate step so a failure there does not
  // corrupt the team-level matchup sync (atomic-per-data-type rule).
  const results = await Promise.allSettled([
    syncTransactions(leagueId, seasonId, currentWeek),
    syncRostersAndPicks(leagueId, seasonId),
    syncMatchupScores(leagueId, seasonId, seasonYear, currentWeek),
    syncPlayerWeekPoints(leagueId, seasonId, seasonYear, currentWeek),
  ]);

  const dataTypes = [
    "transactions",
    "rosters",
    "matchups",
    "player_week_points",
  ];
  const stepResults: SyncStepResult[] = results.map((r, i) => {
    if (r.status === "fulfilled") {
      return r.value;
    }
    return {
      dataType: dataTypes[i],
      status: "failure" as const,
      rowCount: 0,
      durationMs: 0,
      error: r.reason instanceof Error ? r.reason.message : "Unknown error",
    };
  });

  stepResults.push(scheduleResult);

  // Surface the NFL-state fallback (if used) as a non-fatal advisory step.
  if (nflStateNote) {
    stepResults.unshift({
      dataType: "nfl_state",
      status: "success",
      rowCount: 0,
      durationMs: 0,
      note: nflStateNote,
    });
  }

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    season: nflState.season,
    week: currentWeek,
    results: stepResults,
  };
}
