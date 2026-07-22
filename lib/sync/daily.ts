import { db } from "@/lib/db";
import {
  seasons,
  franchises,
  franchiseSeasons,
  members,
  players,
  draftPicks,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  getLeague,
  getLeagueUsers,
  getLeagueRosters,
  getLeagueDrafts,
  getDraftPicks,
  getAllPlayers,
  getPlayerStats,
  getSeasonProjections,
  getNFLState,
  getWinnersBracket,
  getLosersBracket,
} from "@/lib/sleeper";
import { logSyncStart, logSyncComplete } from "@/lib/queries/sync-log";
import { derivePlayoffResults } from "@/lib/sync/derive-playoffs";
import { buildMemberFranchiseMap } from "@/lib/sync/member-franchise";
import { resolveDivisionName } from "@/lib/divisions";

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

export interface DailySyncSummary {
  startedAt: string;
  completedAt: string;
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

/** Slugify a display name for the franchise slug. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Generate a unique slug for a franchise. If the base slug already belongs to
 * a different franchise ID, append a suffix derived from the user_id to avoid
 * unique-constraint collisions.
 */
async function uniqueSlug(
  baseName: string,
  franchiseId: string
): Promise<string> {
  const base = slugify(baseName);

  // Check if the slug is already taken by a different franchise
  const [existing] = await db
    .select({ id: franchises.id })
    .from(franchises)
    .where(eq(franchises.slug, base))
    .limit(1);

  if (!existing || existing.id === franchiseId) {
    return base;
  }

  // Collision: append first 6 chars of user_id to disambiguate
  return `${base}-${franchiseId.slice(0, 6)}`;
}

/**
 * Resolves a member's team avatar to a full URL. Prefers the per-league team
 * avatar (metadata.avatar, already a full URL), falls back to the account-level
 * avatar id resolved against the Sleeper CDN, else null.
 */
function resolveAvatarUrl(user: {
  avatar: string | null;
  metadata?: { avatar?: string | null } | null;
}): string | null {
  const teamAvatar = user.metadata?.avatar?.trim();
  if (teamAvatar) return teamAvatar;
  if (user.avatar) return `https://sleepercdn.com/avatars/thumbs/${user.avatar}`;
  return null;
}

/** Split an array into chunks of the given size. */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Step A: League Settings Sync
// ---------------------------------------------------------------------------

async function syncLeagueSettings(): Promise<SyncStepResult> {
  const startTime = Date.now();
  const logId = await logSyncStart("daily", "league");

  try {
    const leagueId = getLeagueId();
    const result = await getLeague(leagueId);

    if ("error" in result) {
      throw new Error(`Sleeper API error: ${result.error.message}`);
    }

    const league = result.data;
    const seasonYear = parseInt(league.season, 10);

    // Extract playoff_week_start from settings if available
    const playoffWeekStart =
      typeof league.settings.playoff_week_start === "number"
        ? league.settings.playoff_week_start
        : null;

    // Division metadata: settings.divisions is the count; names come from
    // league.metadata.division_N (absent in this league, so names default to
    // "Division N" via resolveDivisionName). Nullable for pre-division leagues.
    const divisionCount =
      typeof league.settings.divisions === "number"
        ? league.settings.divisions
        : null;
    const divisionNames: Record<string, string> | null = divisionCount
      ? Object.fromEntries(
          Array.from({ length: divisionCount }, (_, i) => i + 1).map((n) => [
            String(n),
            resolveDivisionName(league.metadata, n),
          ]),
        )
      : null;

    await db
      .insert(seasons)
      .values({
        seasonYear,
        leagueId: league.league_id,
        previousLeagueId: league.previous_league_id,
        status: league.status,
        totalRosters: league.total_rosters,
        playoffWeekStart,
        divisionCount,
        divisionNames,
        settingsJson: {
          settings: league.settings,
          roster_positions: league.roster_positions,
          scoring_settings: league.scoring_settings,
        },
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: seasons.seasonYear,
        set: {
          leagueId: league.league_id,
          previousLeagueId: league.previous_league_id,
          status: league.status,
          totalRosters: league.total_rosters,
          playoffWeekStart,
          divisionCount,
          divisionNames,
          settingsJson: {
            settings: league.settings,
            roster_positions: league.roster_positions,
            scoring_settings: league.scoring_settings,
          },
          updatedAt: new Date(),
        },
      });

    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "success", 1);
    return { dataType: "league", status: "success", rowCount: 1, durationMs };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "failure", 0, errorMessage);
    return {
      dataType: "league",
      status: "failure",
      rowCount: 0,
      durationMs,
      error: errorMessage,
    };
  }
}

// ---------------------------------------------------------------------------
// Step B: User & Roster Mapping Sync
// ---------------------------------------------------------------------------

async function syncUsersAndRosters(): Promise<SyncStepResult> {
  const startTime = Date.now();
  const logId = await logSyncStart("daily", "rosters");

  try {
    const leagueId = getLeagueId();

    // Fetch users and rosters in parallel
    const [usersResult, rostersResult] = await Promise.all([
      getLeagueUsers(leagueId),
      getLeagueRosters(leagueId),
    ]);

    if ("error" in usersResult) {
      throw new Error(`Sleeper users API error: ${usersResult.error.message}`);
    }
    if ("error" in rostersResult) {
      throw new Error(
        `Sleeper rosters API error: ${rostersResult.error.message}`
      );
    }

    const users = usersResult.data;
    const rosters = rostersResult.data;

    // Build user_id → { teamName, displayName, avatarUrl } map
    const userMap = new Map<
      string,
      { teamName: string; displayName: string; avatarUrl: string | null }
    >();
    for (const u of users) {
      userMap.set(u.user_id, {
        teamName:
          u.metadata?.team_name?.trim() || u.display_name,
        displayName: u.display_name,
        avatarUrl: resolveAvatarUrl(u),
      });
    }

    // We need the season record for this league
    const leagueResult = await getLeague(leagueId);
    if ("error" in leagueResult) {
      throw new Error(
        `Sleeper league API error: ${leagueResult.error.message}`
      );
    }
    const seasonYear = parseInt(leagueResult.data.season, 10);

    // Get or create the season record
    const [seasonRecord] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.seasonYear, seasonYear));

    if (!seasonRecord) {
      throw new Error(
        `Season ${seasonYear} not found in database. Run league sync first.`
      );
    }

    let rowCount = 0;

    for (const roster of rosters) {
      const ownerId = roster.owner_id;
      if (!ownerId) continue; // Skip unowned rosters

      // Resolve co-owner display name(s)
      const coOwners = roster.co_owners;
      const coOwnerDisplayName = coOwners?.length
        ? coOwners
            .map((id) => userMap.get(id)?.displayName ?? "Unknown")
            .join(" & ")
        : null;

      const userData = userMap.get(ownerId) ?? {
        teamName: "Unknown",
        displayName: "Unknown",
        avatarUrl: null,
      };
      const franchiseId = ownerId; // Use Sleeper user_id as franchise ID
      const rosterIdStr = String(roster.roster_id);

      // Generate a collision-safe slug from team name
      const slug = await uniqueSlug(userData.teamName, franchiseId);

      // Upsert franchise (name = team name from Sleeper)
      await db
        .insert(franchises)
        .values({
          id: franchiseId,
          slug,
          name: userData.teamName,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: franchises.id,
          set: {
            name: userData.teamName,
            slug,
            updatedAt: new Date(),
          },
        });

      // Compute points scored & against from roster settings
      const fpts = roster.settings.fpts ?? 0;
      const fptsDecimal = roster.settings.fpts_decimal ?? 0;
      const pointsScored = fpts + fptsDecimal / 100;

      const fptsAgainst = roster.settings.fpts_against ?? 0;
      const fptsAgainstDecimal = roster.settings.fpts_against_decimal ?? 0;
      const pointsAgainst = fptsAgainst + fptsAgainstDecimal / 100;

      const divisionNumber = roster.settings.division ?? null;
      const divisionName =
        divisionNumber != null
          ? resolveDivisionName(leagueResult.data.metadata, divisionNumber)
          : null;

      // Upsert franchise_season
      await db
        .insert(franchiseSeasons)
        .values({
          franchiseId,
          seasonId: seasonRecord.id,
          rosterId: rosterIdStr,
          userId: ownerId,
          ownerDisplayName: userData.displayName,
          coOwnerDisplayName,
          avatarUrl: userData.avatarUrl,
          division: divisionNumber,
          divisionName,
          wins: roster.settings.wins ?? 0,
          losses: roster.settings.losses ?? 0,
          ties: roster.settings.ties ?? 0,
          pointsScored,
          pointsAgainst,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [franchiseSeasons.franchiseId, franchiseSeasons.seasonId],
          set: {
            rosterId: rosterIdStr,
            userId: ownerId,
            ownerDisplayName: userData.displayName,
            coOwnerDisplayName,
            avatarUrl: userData.avatarUrl,
            division: divisionNumber,
            divisionName,
            wins: roster.settings.wins ?? 0,
            losses: roster.settings.losses ?? 0,
            ties: roster.settings.ties ?? 0,
            pointsScored,
            pointsAgainst,
            updatedAt: new Date(),
          },
        });

      rowCount++;
    }

    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "success", rowCount);
    return {
      dataType: "rosters",
      status: "success",
      rowCount,
      durationMs,
    };
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
// Step B2: Member Sync
// ---------------------------------------------------------------------------
// Upserts the members table from the current season's owners and co-owners.
// Members are never deleted (departed owners keep their smack posts); only
// display_name and franchise_id are refreshed. role, claim_code_hash, and
// code_generated_at belong to the claim/commish flow and are never touched by
// sync. Atomic per data type: logged separately as "members".

async function syncMembers(): Promise<SyncStepResult> {
  const startTime = Date.now();
  const logId = await logSyncStart("daily", "members");

  try {
    const leagueId = getLeagueId();

    const [usersResult, rostersResult] = await Promise.all([
      getLeagueUsers(leagueId),
      getLeagueRosters(leagueId),
    ]);

    if ("error" in usersResult) {
      throw new Error(`Sleeper users API error: ${usersResult.error.message}`);
    }
    if ("error" in rostersResult) {
      throw new Error(
        `Sleeper rosters API error: ${rostersResult.error.message}`
      );
    }

    // user_id → display name, for resolving co-owners whose only appearance is
    // in a roster's co_owners array.
    const displayNameByUserId = new Map<string, string>();
    for (const u of usersResult.data) {
      displayNameByUserId.set(u.user_id, u.display_name);
    }

    // Build the member set: primary owner + each co-owner, each mapped to the
    // franchise they currently control (the roster's franchise id = owner id).
    // Two-pass build so primary ownership wins over co-ownership regardless of
    // roster order (see buildMemberFranchiseMap).
    const memberFranchise = buildMemberFranchiseMap(rostersResult.data);

    let rowCount = 0;
    for (const [userId, franchiseId] of memberFranchise) {
      const displayName = displayNameByUserId.get(userId) ?? userId;

      await db
        .insert(members)
        .values({
          sleeperUserId: userId,
          displayName,
          franchiseId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: members.sleeperUserId,
          set: {
            displayName,
            franchiseId,
            updatedAt: new Date(),
          },
        });

      rowCount++;
    }

    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "success", rowCount);
    return {
      dataType: "members",
      status: "success",
      rowCount,
      durationMs,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "failure", 0, errorMessage);
    return {
      dataType: "members",
      status: "failure",
      rowCount: 0,
      durationMs,
      error: errorMessage,
    };
  }
}

// ---------------------------------------------------------------------------
// Step C: Player Database Sync
// ---------------------------------------------------------------------------

async function syncPlayers(): Promise<SyncStepResult> {
  const startTime = Date.now();
  const logId = await logSyncStart("daily", "players");

  try {
    const result = await getAllPlayers();

    if ("error" in result) {
      throw new Error(`Sleeper players API error: ${result.error.message}`);
    }

    const playersData = result.data;
    const playerEntries = Object.values(playersData);

    // Map to DB rows
    const playerRows = playerEntries.map((p) => ({
      id: p.player_id,
      fullName: p.full_name ?? null,
      firstName: p.first_name ?? null,
      lastName: p.last_name ?? null,
      position: p.position ?? null,
      nflTeam: p.team ?? null,
      status: p.status ?? null,
      injuryStatus: p.injury_status ?? null,
      age: p.age ?? null,
      yearsExp: p.years_exp ?? null,
      searchFullName: p.search_full_name ?? null,
      updatedAt: new Date(),
    }));

    // Batch insert in chunks of 500
    const batches = chunk(playerRows, 500);
    let totalUpserted = 0;

    for (const batch of batches) {
      await db
        .insert(players)
        .values(batch)
        .onConflictDoUpdate({
          target: players.id,
          set: {
            fullName: sql`excluded.full_name`,
            firstName: sql`excluded.first_name`,
            lastName: sql`excluded.last_name`,
            position: sql`excluded.position`,
            nflTeam: sql`excluded.nfl_team`,
            status: sql`excluded.status`,
            injuryStatus: sql`excluded.injury_status`,
            age: sql`excluded.age`,
            yearsExp: sql`excluded.years_exp`,
            searchFullName: sql`excluded.search_full_name`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
      totalUpserted += batch.length;
    }

    // --- Sync player stats (pts_ppr) ---
    try {
      const nflStateResult = await getNFLState();
      if (!("error" in nflStateResult)) {
        const nflState = nflStateResult.data;
        const currentSeason = parseInt(nflState.season, 10);
        // Use previous season stats if we're in pre_draft, pre-season, or off-season
        const seasonType = nflState.season_type;
        const useLastSeason =
          seasonType === "pre" ||
          seasonType === "off" ||
          nflState.week < 1;
        const statsSeason = useLastSeason ? currentSeason - 1 : currentSeason;

        const statsResult = await getPlayerStats(statsSeason);
        if (!("error" in statsResult)) {
          const statsData = statsResult.data;

          // Build update rows: only players with pts_ppr
          const statsRows = Object.entries(statsData)
            .filter(([, stats]) => stats.pts_ppr != null && stats.pts_ppr > 0)
            .map(([playerId, stats]) => ({
              id: playerId,
              pointsPpr: stats.pts_ppr ?? null,
              statsSeason: statsSeason,
            }));

          // Batch update in chunks of 500
          const statsBatches = chunk(statsRows, 500);
          for (const batch of statsBatches) {
            await db
              .insert(players)
              .values(
                batch.map((row) => ({
                  id: row.id,
                  pointsPpr: row.pointsPpr,
                  statsSeason: row.statsSeason,
                  updatedAt: new Date(),
                }))
              )
              .onConflictDoUpdate({
                target: players.id,
                set: {
                  pointsPpr: sql`excluded.points_ppr`,
                  statsSeason: sql`excluded.stats_season`,
                  updatedAt: sql`excluded.updated_at`,
                },
              });
          }

          console.log(
            `[sync] Updated ${statsRows.length} players with ${statsSeason} season stats`
          );
        } else {
          console.warn(
            `[sync] Failed to fetch player stats: ${statsResult.error.message}`
          );
        }
      }
    } catch (statsError) {
      // Don't fail the entire player sync if stats fail
      console.warn(
        `[sync] Player stats sync failed: ${statsError instanceof Error ? statsError.message : "Unknown error"}`
      );
    }

    // --- Sync upcoming-season projections (proj_points_ppr) ---
    let projectionRowCount = 0;
    try {
      const nflStateResult = await getNFLState();
      if (!("error" in nflStateResult)) {
        const nflState = nflStateResult.data;
        // Use the state's season directly: in preseason/pre_draft the NFL
        // state's `season` already IS the upcoming season, unlike the stats
        // block above which deliberately looks back a year.
        const projSeason = parseInt(nflState.season, 10);

        const projResult = await getSeasonProjections(projSeason);
        if (!("error" in projResult)) {
          const projRows = projResult.data
            .filter(
              (row) => row.stats.pts_ppr != null && row.stats.pts_ppr > 0
            )
            .map((row) => ({
              id: row.player_id,
              projPointsPpr: row.stats.pts_ppr ?? null,
              projSeason,
            }));

          // Batch update in chunks of 500
          const projBatches = chunk(projRows, 500);
          for (const batch of projBatches) {
            await db
              .insert(players)
              .values(
                batch.map((row) => ({
                  id: row.id,
                  projPointsPpr: row.projPointsPpr,
                  projSeason: row.projSeason,
                  updatedAt: new Date(),
                }))
              )
              .onConflictDoUpdate({
                target: players.id,
                set: {
                  projPointsPpr: sql`excluded.proj_points_ppr`,
                  projSeason: sql`excluded.proj_season`,
                  updatedAt: sql`excluded.updated_at`,
                },
              });
          }

          projectionRowCount = projRows.length;
          console.log(
            `[sync] Updated ${projectionRowCount} players with ${projSeason} season projections`
          );
        } else {
          console.warn(
            `[sync] Failed to fetch season projections: ${projResult.error.message}`
          );
        }
      }
    } catch (projError) {
      // Don't fail the entire player sync if projections fail
      console.warn(
        `[sync] Player projections sync failed: ${projError instanceof Error ? projError.message : "Unknown error"}`
      );
    }

    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "success", totalUpserted, undefined, {
      projectionRowCount,
    });
    return {
      dataType: "players",
      status: "success",
      rowCount: totalUpserted,
      durationMs,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "failure", 0, errorMessage);
    return {
      dataType: "players",
      status: "failure",
      rowCount: 0,
      durationMs,
      error: errorMessage,
    };
  }
}

// ---------------------------------------------------------------------------
// Step D: Draft Sync
// ---------------------------------------------------------------------------

async function syncDrafts(): Promise<SyncStepResult> {
  const startTime = Date.now();
  const logId = await logSyncStart("daily", "drafts");

  try {
    const leagueId = getLeagueId();

    // Get all drafts for this league
    const draftsResult = await getLeagueDrafts(leagueId);

    if ("error" in draftsResult) {
      throw new Error(
        `Sleeper drafts API error: ${draftsResult.error.message}`
      );
    }

    const drafts = draftsResult.data;

    // We need the season record for this league
    const leagueResult = await getLeague(leagueId);
    if ("error" in leagueResult) {
      throw new Error(
        `Sleeper league API error: ${leagueResult.error.message}`
      );
    }
    const seasonYear = parseInt(leagueResult.data.season, 10);

    // Get the season record
    const [seasonRecord] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.seasonYear, seasonYear));

    if (!seasonRecord) {
      throw new Error(
        `Season ${seasonYear} not found in database. Run league sync first.`
      );
    }

    // Build roster_id → franchise_id and user_id → franchise_id maps from franchise_seasons
    const franchiseSeasonRows = await db
      .select({
        rosterId: franchiseSeasons.rosterId,
        franchiseId: franchiseSeasons.franchiseId,
        userId: franchiseSeasons.userId,
      })
      .from(franchiseSeasons)
      .where(eq(franchiseSeasons.seasonId, seasonRecord.id));

    const rosterToFranchise = new Map<string, string>();
    const userToFranchise = new Map<string, string>();
    for (const row of franchiseSeasonRows) {
      rosterToFranchise.set(row.rosterId, row.franchiseId);
      userToFranchise.set(row.userId, row.franchiseId);
    }

    // Filter to completed drafts only
    const sortedDrafts = [...drafts]
      .filter((d) => d.status === "complete")
      .sort((a, b) => a.draft_id.localeCompare(b.draft_id));

    let totalUpserted = 0;

    for (let i = 0; i < sortedDrafts.length; i++) {
      const draft = sortedDrafts[i];

      // Determine draft type by round count: startup drafts have many rounds
      // (28+ for a full roster), while rookie drafts have 3-5 rounds.
      const rounds = typeof draft.settings?.rounds === "number"
        ? (draft.settings.rounds as number)
        : 0;
      const draftType = rounds > 10 ? "startup" : "rookie";

      // Fetch picks for this draft
      const picksResult = await getDraftPicks(draft.draft_id);

      if ("error" in picksResult) {
        console.warn(
          `[sync] Failed to fetch picks for draft ${draft.draft_id}: ${picksResult.error.message}`
        );
        continue;
      }

      const picks = picksResult.data;

      // Build slot -> original franchise mapping from draft_order
      // draft_order: { userId: slot }, so invert to { slot: franchiseId }
      const slotToOriginalFranchise = new Map<number, string>();
      if (draft.draft_order) {
        for (const [userId, slot] of Object.entries(draft.draft_order)) {
          const franchiseId = userToFranchise.get(userId);
          if (franchiseId) {
            slotToOriginalFranchise.set(slot, franchiseId);
          }
        }
      }

      // Build all pick rows for this draft
      const totalTeamsInDraft = draft.draft_order
        ? Object.keys(draft.draft_order).length
        : picks.reduce((max, p) => Math.max(max, p.roster_id), 0);

      const pickRows = picks.map((pick) => {
        const rosterIdStr = String(pick.roster_id);
        const franchiseId = rosterToFranchise.get(rosterIdStr) ?? null;

        // Determine the original franchise that held this pick slot
        // For linear drafts, pick position in round = ((pick_no - 1) % totalTeams) + 1
        // For snake drafts, odd rounds are forward, even rounds are reversed
        const pickInRound = ((pick.pick_no - 1) % totalTeamsInDraft) + 1;
        const isSnake = draftType === "startup"; // rookie drafts are linear
        const isEvenRound = pick.round % 2 === 0;
        const originalSlot = isSnake && isEvenRound
          ? totalTeamsInDraft - pickInRound + 1
          : pickInRound;
        const originalFranchiseId = slotToOriginalFranchise.get(originalSlot) ?? null;

        // Only store originalFranchiseId when it differs from franchiseId (pick was traded)
        const tradedOriginal = originalFranchiseId && originalFranchiseId !== franchiseId
          ? originalFranchiseId
          : null;

        // Build player name from metadata if available
        const playerName = pick.metadata
          ? [pick.metadata.first_name, pick.metadata.last_name]
              .filter(Boolean)
              .join(" ") || null
          : null;

        return {
          seasonId: seasonRecord.id,
          draftId: draft.draft_id,
          draftType,
          round: pick.round,
          pickNumber: pick.pick_no,
          rosterId: rosterIdStr,
          franchiseId,
          playerId: pick.player_id,
          playerName,
          originalFranchiseId: tradedOriginal,
          isLegacyEra: false,
        };
      });

      // Delete existing picks for this draft, then re-insert (same pattern as legacy-import)
      // This avoids duplicates since draft_picks has no unique constraint on (draft_id, pick_number)
      await db
        .delete(draftPicks)
        .where(eq(draftPicks.draftId, draft.draft_id));

      const batches = chunk(pickRows, 50);
      for (const batch of batches) {
        await db.insert(draftPicks).values(batch);
      }

      totalUpserted += pickRows.length;
    }

    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "success", totalUpserted);
    return {
      dataType: "drafts",
      status: "success",
      rowCount: totalUpserted,
      durationMs,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "failure", 0, errorMessage);
    return {
      dataType: "drafts",
      status: "failure",
      rowCount: 0,
      durationMs,
      error: errorMessage,
    };
  }
}

// ---------------------------------------------------------------------------
// Step E: Playoff Bracket Sync
// ---------------------------------------------------------------------------

async function syncPlayoffBracket(): Promise<SyncStepResult> {
  const startTime = Date.now();
  const logId = await logSyncStart("daily", "playoffs");

  try {
    const leagueId = getLeagueId();

    // Fetch the league to check season status
    const leagueResult = await getLeague(leagueId);
    if ("error" in leagueResult) {
      throw new Error(
        `Sleeper league API error: ${leagueResult.error.message}`
      );
    }

    const league = leagueResult.data;
    const seasonYear = parseInt(league.season, 10);

    // Only derive playoff results if the season is complete
    if (league.status !== "complete") {
      const durationMs = Date.now() - startTime;
      await logSyncComplete(logId, "success", 0);
      return {
        dataType: "playoffs",
        status: "success",
        rowCount: 0,
        durationMs,
      };
    }

    // Get the season record
    const [seasonRecord] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.seasonYear, seasonYear));

    if (!seasonRecord) {
      throw new Error(
        `Season ${seasonYear} not found in database. Run league sync first.`
      );
    }

    // Build roster_id → franchise_id mapping
    const rostersResult = await getLeagueRosters(leagueId);
    if ("error" in rostersResult) {
      throw new Error(
        `Sleeper rosters API error: ${rostersResult.error.message}`
      );
    }

    const rosterToFranchise = new Map<number, string>();
    for (const roster of rostersResult.data) {
      if (roster.owner_id) {
        rosterToFranchise.set(roster.roster_id, roster.owner_id);
      }
    }

    // Fetch both brackets
    const [winnersResult, losersResult] = await Promise.all([
      getWinnersBracket(leagueId),
      getLosersBracket(leagueId),
    ]);

    if ("error" in winnersResult) {
      throw new Error(
        `Sleeper winners bracket API error: ${winnersResult.error.message}`
      );
    }
    if ("error" in losersResult) {
      throw new Error(
        `Sleeper losers bracket API error: ${losersResult.error.message}`
      );
    }

    const results = derivePlayoffResults(
      winnersResult.data,
      losersResult.data,
      rosterToFranchise
    );

    // Update franchise_seasons.playoffResult for each roster
    let rowCount = 0;
    for (const [franchiseId, playoffResult] of results.franchiseResults) {
      await db
        .update(franchiseSeasons)
        .set({ playoffResult, updatedAt: new Date() })
        .where(
          sql`${franchiseSeasons.franchiseId} = ${franchiseId} AND ${franchiseSeasons.seasonId} = ${seasonRecord.id}`
        );
      rowCount++;
    }

    // Update seasons.championFranchiseId
    if (results.championFranchiseId) {
      await db
        .update(seasons)
        .set({
          championFranchiseId: results.championFranchiseId,
          updatedAt: new Date(),
        })
        .where(eq(seasons.id, seasonRecord.id));
    }

    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "success", rowCount);
    return {
      dataType: "playoffs",
      status: "success",
      rowCount,
      durationMs,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "failure", 0, errorMessage);
    return {
      dataType: "playoffs",
      status: "failure",
      rowCount: 0,
      durationMs,
      error: errorMessage,
    };
  }
}

// ---------------------------------------------------------------------------
// Main: Run Daily Sync
// ---------------------------------------------------------------------------

export async function runDailySync(): Promise<DailySyncSummary> {
  const startedAt = new Date().toISOString();

  // Run the five core syncs independently — a failure in one doesn't block
  // others. Members runs afterward: its franchise_id FK requires the franchise
  // rows that syncUsersAndRosters upserts, so it cannot run in the same
  // parallel batch on a cold database.
  const results = await Promise.allSettled([
    syncLeagueSettings(),
    syncUsersAndRosters(),
    syncPlayers(),
    syncDrafts(),
    syncPlayoffBracket(),
  ]);

  const dataTypes = ["league", "rosters", "players", "drafts", "playoffs"];
  const stepResults: SyncStepResult[] = results.map((r, i) => {
    if (r.status === "fulfilled") {
      return r.value;
    }
    // Promise itself rejected (unexpected)
    return {
      dataType: dataTypes[i],
      status: "failure" as const,
      rowCount: 0,
      durationMs: 0,
      error: r.reason instanceof Error ? r.reason.message : "Unknown error",
    };
  });

  // Members depend on franchises existing; run after the roster upsert.
  const membersResult = await Promise.allSettled([syncMembers()]);
  stepResults.push(
    membersResult[0].status === "fulfilled"
      ? membersResult[0].value
      : {
          dataType: "members",
          status: "failure" as const,
          rowCount: 0,
          durationMs: 0,
          error:
            membersResult[0].reason instanceof Error
              ? membersResult[0].reason.message
              : "Unknown error",
        },
  );

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    results: stepResults,
  };
}
