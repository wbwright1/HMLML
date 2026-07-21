import { db } from "@/lib/db";
import {
  seasons,
  matchups,
  transactions,
  franchiseSeasons,
  rosterPlayers,
  playerWeekPoints,
  type NewPlayerWeekPoints,
} from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  getNFLState,
  getLeague,
  getLeagueMatchups,
  getLeagueTransactions,
  getLeagueRosters,
  getWeekProjections,
} from "@/lib/sleeper";
import type { SleeperMatchup, SleeperProjections } from "@/lib/sleeper-schemas";
import { alignStarterSlots, computeProjectedPoints } from "@/lib/lineup-slots";
import { logSyncStart, logSyncComplete } from "@/lib/queries/sync-log";

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

function getLeagueId(): string {
  const id = process.env.SLEEPER_LEAGUE_ID;
  if (!id) throw new Error("SLEEPER_LEAGUE_ID is not set");
  return id;
}

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
    const [rostersResult] = await Promise.all([
      getLeagueRosters(leagueId),
    ]);

    if ("error" in rostersResult) {
      throw new Error(
        `Sleeper rosters API error: ${rostersResult.error.message}`
      );
    }

    const rosters = rostersResult.data;
    let rowCount = 0;

    // Build roster_id -> franchise_id mapping from franchise_seasons
    const fsRows = await db
      .select({
        rosterId: franchiseSeasons.rosterId,
        franchiseId: franchiseSeasons.franchiseId,
      })
      .from(franchiseSeasons)
      .where(eq(franchiseSeasons.seasonId, seasonId));

    const rosterToFranchise = new Map<string, string>();
    for (const fs of fsRows) {
      rosterToFranchise.set(fs.rosterId, fs.franchiseId);
    }

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

      await db
        .update(franchiseSeasons)
        .set({
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
      // players are cleaned up, then re-insert the current roster.
      await db
        .delete(rosterPlayers)
        .where(
          and(
            eq(rosterPlayers.seasonId, seasonId),
            eq(rosterPlayers.rosterId, rosterIdStr)
          )
        );

      // Insert fresh roster players
      for (const p of allPlayers) {
        try {
          await db
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
        } catch {
          // Player may not exist in players table — skip
        }
      }

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

async function syncMatchupScores(
  leagueId: string,
  seasonId: number,
  week: number
): Promise<SyncStepResult> {
  const startTime = Date.now();
  const logId = await logSyncStart("hourly", "matchups");

  try {
    const result = await getLeagueMatchups(leagueId, week);

    if ("error" in result) {
      throw new Error(`Sleeper matchups API error: ${result.error.message}`);
    }

    const sleeperMatchups = result.data;

    // Build roster_id -> franchise_id mapping
    const fsRows = await db
      .select({
        rosterId: franchiseSeasons.rosterId,
        franchiseId: franchiseSeasons.franchiseId,
      })
      .from(franchiseSeasons)
      .where(eq(franchiseSeasons.seasonId, seasonId));

    const rosterToFranchise = new Map<string, string>();
    for (const fs of fsRows) {
      rosterToFranchise.set(fs.rosterId, fs.franchiseId);
    }

    // Get season info for playoff detection
    const [seasonRow] = await db
      .select({ playoffWeekStart: seasons.playoffWeekStart })
      .from(seasons)
      .where(eq(seasons.id, seasonId));

    const playoffWeekStart = seasonRow?.playoffWeekStart ?? 15;
    const isPlayoffWeek = week >= playoffWeekStart;

    let rowCount = 0;

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
      // Check if every side in this matchup pairing has isWinner set (non-null),
      // which indicates final scores are in and the matchup is complete.
      const allHaveWinner =
        pair.length === 2 &&
        pair.every((p) => {
          const opponent = pair.find((o) => o.roster_id !== p.roster_id);
          const pts = p.points ?? 0;
          const oppPts = opponent?.points ?? 0;
          return pts > 0 && oppPts > 0;
        });

      for (const m of pair) {
        const rosterIdStr = String(m.roster_id);
        const franchiseId = rosterToFranchise.get(rosterIdStr);
        if (!franchiseId) continue;

        const points = m.points ?? 0;

        // Determine winner status if both sides have points
        let isWinner: boolean | null = null;
        if (pair.length === 2) {
          const opponent = pair.find((p) => p.roster_id !== m.roster_id);
          if (opponent && points > 0 && (opponent.points ?? 0) > 0) {
            isWinner = points > (opponent.points ?? 0);
          }
        }

        // Determine status:
        // - "complete" when both sides have points and winners are determined
        // - "in_progress" when points > 0 but not yet finalized
        // - "scheduled" otherwise
        let status = "scheduled";
        if (allHaveWinner) {
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

    // Mark all matchups from prior weeks as "complete" if they are still
    // in_progress. If we are syncing week N, any week < N is finished.
    if (week > 1) {
      await db
        .update(matchups)
        .set({ status: "complete", updatedAt: new Date() })
        .where(
          and(
            eq(matchups.seasonId, seasonId),
            sql`${matchups.week} < ${week}`,
            sql`${matchups.status} != 'complete'`
          )
        );
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
    const fsRows = await db
      .select({
        rosterId: franchiseSeasons.rosterId,
        franchiseId: franchiseSeasons.franchiseId,
      })
      .from(franchiseSeasons)
      .where(eq(franchiseSeasons.seasonId, seasonId));

    const rosterToFranchise = new Map<string, string>();
    for (const fs of fsRows) {
      rosterToFranchise.set(fs.rosterId, fs.franchiseId);
    }

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
// Main: Run Hourly Sync
// ---------------------------------------------------------------------------

export async function runHourlySync(): Promise<HourlySyncSummary> {
  const startedAt = new Date().toISOString();

  // Get NFL state to determine current season/week
  const nflStateResult = await getNFLState();

  if ("error" in nflStateResult) {
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
          error: `Failed to get NFL state: ${nflStateResult.error.message}`,
        },
      ],
    };
  }

  const nflState = nflStateResult.data;
  const seasonYear = parseInt(nflState.season, 10);
  const currentWeek = nflState.week;

  // Look up the season in our database
  const [seasonRow] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.seasonYear, seasonYear));

  if (!seasonRow) {
    return {
      startedAt,
      completedAt: new Date().toISOString(),
      season: nflState.season,
      week: currentWeek,
      results: [
        {
          dataType: "season_lookup",
          status: "failure",
          rowCount: 0,
          durationMs: 0,
          error: `Season ${seasonYear} not found in database. Run daily sync first.`,
        },
      ],
    };
  }

  const leagueId = getLeagueId();
  const seasonId = seasonRow.id;

  // Run all syncs independently — a failure in one doesn't block others.
  // Per-player points are a separate step so a failure there does not corrupt
  // the team-level matchup sync (atomic-per-data-type rule).
  const results = await Promise.allSettled([
    syncTransactions(leagueId, seasonId, currentWeek),
    syncRostersAndPicks(leagueId, seasonId),
    syncMatchupScores(leagueId, seasonId, currentWeek),
    syncPlayerWeekPoints(leagueId, seasonId, seasonYear, currentWeek),
  ]);

  const stepResults: SyncStepResult[] = results.map((r, i) => {
    if (r.status === "fulfilled") {
      return r.value;
    }
    const dataTypes = [
      "transactions",
      "rosters",
      "matchups",
      "player_week_points",
    ];
    return {
      dataType: dataTypes[i],
      status: "failure" as const,
      rowCount: 0,
      durationMs: 0,
      error: r.reason instanceof Error ? r.reason.message : "Unknown error",
    };
  });

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    season: nflState.season,
    week: currentWeek,
    results: stepResults,
  };
}
