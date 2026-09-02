import { db } from "@/lib/db";
import {
  seasons,
  franchises,
  franchiseSeasons,
  members,
  players,
  draftPicks,
  playerValues,
} from "@/lib/db/schema";
import { and, desc, eq, lt, ne, sql } from "drizzle-orm";
import { gradeBookProps } from "@/lib/sync/book-props";
import {
  getLeague,
  getLeagueUsers,
  getUserLeagues,
  getLeagueRosters,
  getLeagueDrafts,
  getDraftPicks,
  getAllPlayers,
  getPlayerStats,
  getSeasonProjections,
  getWinnersBracket,
  getLosersBracket,
} from "@/lib/sleeper";
import { getCurrentValues } from "@/lib/fantasycalc";
import type { SleeperLeague } from "@/lib/sleeper-schemas";
import { resolveNflState } from "@/lib/sync/nfl-state";
import { logSyncStart, logSyncComplete } from "@/lib/queries/sync-log";
import { loadSeasonScoringSettings } from "@/lib/queries/seasons";
import { computeProjectedPoints } from "@/lib/lineup-slots";
import { derivePlayoffResults } from "@/lib/sync/derive-playoffs";
import { persistBracketMatches } from "@/lib/sync/playoff-brackets";
import { buildMemberFranchiseMap } from "@/lib/sync/member-franchise";
import { resolveDivisionName } from "@/lib/divisions";
import {
  buildTakenSet,
  resolveAbbreviation,
} from "@/lib/franchise-abbreviations";
import {
  buildTakenColorSet,
  resolveBrandingColor,
} from "@/lib/franchise-colors";
import { runAtomic } from "@/lib/db/atomic";
import { chunk } from "@/lib/chunk";
import { ensurePlayersExist } from "@/lib/sync/ensure-players";
import { repriceFutures, gradeFutures } from "@/lib/sync/book-futures";
import { resolveFuturesSeason } from "@/lib/queries/book-futures";
import { resolveBookWeek } from "@/lib/queries/book";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SyncStepResult {
  dataType: string;
  status: "success" | "failure";
  rowCount: number;
  durationMs: number;
  error?: string;
  // Non-fatal advisory (e.g. SLEEPER_LEAGUE_ID auto-advanced to a newer season).
  note?: string;
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
export function resolveAvatarUrl(user: {
  avatar: string | null;
  metadata?: { avatar?: string | null } | null;
}): string | null {
  const teamAvatar = user.metadata?.avatar?.trim();
  if (teamAvatar) return teamAvatar;
  if (user.avatar) return `https://sleepercdn.com/avatars/thumbs/${user.avatar}`;
  return null;
}

// ---------------------------------------------------------------------------
// Step A: League Settings Sync
// ---------------------------------------------------------------------------

async function syncLeagueSettings(leagueId: string): Promise<SyncStepResult> {
  const startTime = Date.now();
  const logId = await logSyncStart("daily", "league");

  try {
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

async function syncUsersAndRosters(leagueId: string): Promise<SyncStepResult> {
  const startTime = Date.now();
  const logId = await logSyncStart("daily", "rosters");

  try {
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

    // Abbreviations and branding colors are derived, not synced (Sleeper has
    // no such fields), so collision resolution must be deterministic: seed the
    // taken sets from the curated maps plus everything already persisted, and
    // walk rosters in a stable order so a re-run never reshuffles anyone's
    // letters or colors.
    const persistedBranding = await db
      .select({
        id: franchises.id,
        abbreviation: franchises.abbreviation,
        brandingColor: franchises.brandingColor,
      })
      .from(franchises);
    const abbreviationById = new Map(
      persistedBranding.map((f) => [f.id, f.abbreviation])
    );
    const takenAbbreviations = buildTakenSet(
      persistedBranding.map((f) => f.abbreviation)
    );
    const colorById = new Map(
      persistedBranding.map((f) => [f.id, f.brandingColor])
    );
    const takenColors = buildTakenColorSet(
      persistedBranding.map((f) => f.brandingColor)
    );

    const orderedRosters = [...rosters].sort((a, b) =>
      String(a.owner_id ?? "").localeCompare(String(b.owner_id ?? ""))
    );

    for (const roster of orderedRosters) {
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

      // Release this franchise's own current abbreviation so it can keep it,
      // then claim whatever it resolves to.
      const ownAbbreviation = abbreviationById.get(franchiseId);
      if (ownAbbreviation) takenAbbreviations.delete(ownAbbreviation);
      const abbreviation = resolveAbbreviation(
        franchiseId,
        userData.teamName,
        takenAbbreviations
      );
      takenAbbreviations.add(abbreviation);
      abbreviationById.set(franchiseId, abbreviation);

      // Same dance for the branding color: release this franchise's own
      // current color so it can keep it, then claim whatever it resolves to.
      const ownColor = colorById.get(franchiseId);
      if (ownColor) takenColors.delete(ownColor);
      const brandingColor = resolveBrandingColor(franchiseId, takenColors);
      takenColors.add(brandingColor);
      colorById.set(franchiseId, brandingColor);

      // Upsert franchise (name = team name from Sleeper)
      await db
        .insert(franchises)
        .values({
          id: franchiseId,
          slug,
          name: userData.teamName,
          abbreviation,
          brandingColor,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: franchises.id,
          set: {
            name: userData.teamName,
            slug,
            abbreviation,
            brandingColor,
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

async function syncMembers(leagueId: string): Promise<SyncStepResult> {
  const startTime = Date.now();
  const logId = await logSyncStart("daily", "members");

  try {
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

    // One NFL-state fetch shared by the stats and projections blocks below.
    // A null here means the state fetch failed; both blocks then skip quietly
    // (neither ever fails the players step).
    let sharedNflState: { season: string; season_type: string; week: number } | null = null;
    try {
      // Degrade to the last-synced DB state when /state/nfl is unavailable, so
      // stats/projections still run instead of being skipped entirely.
      const resolved = await resolveNflState();
      if (resolved) sharedNflState = resolved.state;
    } catch (stateError) {
      console.warn(
        `[sync] NFL state fetch failed: ${stateError instanceof Error ? stateError.message : "Unknown error"}`
      );
    }

    // --- Sync player stats (pts_ppr) ---
    try {
      if (sharedNflState) {
        const nflState = sharedNflState;
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
      if (sharedNflState) {
        // Use the state's season directly: in preseason/pre_draft the NFL
        // state's `season` already IS the upcoming season, unlike the stats
        // block above which deliberately looks back a year.
        const projSeason = parseInt(sharedNflState.season, 10);

        // Weight Sleeper's raw projection stat lines by the league's own
        // scoring settings so the stored value matches how the players tab
        // scores weekly projections, not Sleeper's full-PPR pts_ppr default.
        // Falls back to the latest season's settings when projSeason has no
        // row yet; computeProjectedPoints degrades to the appropriate point
        // total if the settings are still null.
        const scoringSettings = await loadSeasonScoringSettings(projSeason);

        const projResult = await getSeasonProjections(projSeason);
        if (!("error" in projResult)) {
          const projRows = projResult.data
            .map((row) => ({
              id: row.player_id,
              projPointsPpr: computeProjectedPoints(scoringSettings, row.stats),
              projSeason,
            }))
            .filter(
              (row) =>
                row.projPointsPpr != null &&
                row.projPointsPpr > 0 &&
                // Only touch players that exist in the players snapshot just
                // upserted above; the upsert's INSERT branch would otherwise
                // create nameless player rows for ids Sleeper projects but
                // does not list in /players/nfl.
                playersData[row.id] != null
            );

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

async function syncDrafts(leagueId: string): Promise<SyncStepResult> {
  const startTime = Date.now();
  const logId = await logSyncStart("daily", "drafts");

  try {
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

      // draftType is the roster-category label (startup vs rookie), a proxy
      // still reasonably derived from round count: startup drafts have many
      // rounds (28+ for a full roster), rookie drafts have 3-5.
      const rounds = typeof draft.settings?.rounds === "number"
        ? (draft.settings.rounds as number)
        : 0;
      const draftType = rounds > 10 ? "startup" : "rookie";

      // Snake vs linear is a distinct property (the pick order mechanic) and
      // drives pick-provenance below. Use Sleeper's real `type` field; only
      // fall back to the round heuristic if it is missing/unexpected.
      const sleeperDraftType =
        typeof draft.type === "string" ? draft.type.toLowerCase() : "";
      const isSnake =
        sleeperDraftType === "snake"
          ? true
          : sleeperDraftType === "linear" || sleeperDraftType === "auction"
            ? false
            : draftType === "startup";

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
        const isEvenRound = pick.round % 2 === 0;
        const originalSlot = isSnake && isEvenRound
          ? totalTeamsInDraft - pickInRound + 1
          : pickInRound;
        // Always store the original slot owner, even when it's the same
        // franchise that drafted the player ("came home" picks): the grader
        // needs originalFranchiseId populated on every row to resolve what a
        // kept pick became. Fall back to the drafter's own franchiseId when
        // the slot can't be mapped (e.g. missing draft_order data).
        const originalFranchiseId =
          slotToOriginalFranchise.get(originalSlot) ?? franchiseId;

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
          originalFranchiseId,
          isLegacyEra: false,
        };
      });

      // draft_picks.player_id carries the same FK to players.id that broke the
      // hourly rosters step (issue #269), and this is a live hazard rather than
      // a theoretical one: syncDrafts and syncPlayers run concurrently inside
      // runDailySync's Promise.allSettled, so a rookie drafted since the last
      // snapshot can land here before (or without) his players row.
      const stubbedPickPlayerIds = await ensurePlayersExist(
        pickRows
          .map((p) => p.playerId)
          .filter((id): id is string => Boolean(id))
      );
      if (stubbedPickPlayerIds.length > 0) {
        console.warn(
          `[sync-daily] Stubbed ${stubbedPickPlayerIds.length} unknown drafted player ids into players: ${stubbedPickPlayerIds.join(", ")}`
        );
      }

      // Delete existing picks for this draft, then re-insert (draft_picks has
      // no unique constraint on (draft_id, pick_number), so upsert isn't an
      // option). Wrapped in a transaction so a mid-loop insert failure can't
      // leave the draft with its picks wiped and not replaced.
      const batches = chunk(pickRows, 50);
      await runAtomic((tx) => [
        tx.delete(draftPicks).where(eq(draftPicks.draftId, draft.draft_id)),
        ...batches.map((batch) => tx.insert(draftPicks).values(batch)),
      ]);

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

async function syncPlayoffBracket(leagueId: string): Promise<SyncStepResult> {
  const startTime = Date.now();
  const logId = await logSyncStart("daily", "playoffs");

  try {
    // Fetch the league to check season status
    const leagueResult = await getLeague(leagueId);
    if ("error" in leagueResult) {
      throw new Error(
        `Sleeper league API error: ${leagueResult.error.message}`
      );
    }

    const league = leagueResult.data;
    const seasonYear = parseInt(league.season, 10);

    // A season that is not yet complete still gets its BRACKET persisted: the
    // playoffs page has to render live and TBD matches while they are being
    // played, and an early return here would leave it empty for the entire
    // postseason. What stays gated on `complete` is the derived
    // franchise_seasons.playoff_result, which is only meaningful once the
    // bracket has finished resolving.
    const isComplete = league.status === "complete";

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

    let rowCount = 0;

    // Derived standings-facing results only once the season has finished.
    // Sleeper serves a pre-seeded bracket SHELL for an upcoming season, and a
    // half-played one mid-postseason; neither may write playoff_result.
    if (isComplete) {
      // Update franchise_seasons.playoffResult for each roster
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
    }

    // Persist the raw bracket (both sides) plus the Toilet Bowl champion in one
    // transaction, so the bracket page renders real pairings instead of
    // guessing them from flat matchup rows. Runs for in-progress seasons too;
    // deriveToiletBowlChampion returns null until the p=1 final is decided, so
    // an unfinished season stores its TBD bracket and crowns nobody.
    rowCount += await persistBracketMatches(
      seasonRecord.id,
      winnersResult.data,
      losersResult.data,
      results.toiletBowlChampionFranchiseId,
    );

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
// Step F: Player Values Sync (FantasyCalc)
// ---------------------------------------------------------------------------
// Dynasty trade-value snapshots, one row per (asset, day, source). Values
// never feed trade grades (lib/queries/trade-grades.ts); they power a
// separate "value-then-vs-now" display on trade cards.

async function syncPlayerValues(): Promise<SyncStepResult> {
  const startTime = Date.now();
  const logId = await logSyncStart("daily", "player_values");

  try {
    const result = await getCurrentValues();

    if ("error" in result) {
      throw new Error(`FantasyCalc API error: ${result.error.message}`);
    }

    const today = new Date().toISOString().slice(0, 10);

    // Skip entries with no sleeperId (unresolvable assets); keep pick entries
    // (they carry FantasyCalc pseudo-ids like "FP_2026_1" in sleeperId).
    const rows = result.data
      .filter((v) => v.player.sleeperId != null && v.player.sleeperId !== "")
      .map((v) => ({
        assetId: v.player.sleeperId as string,
        position: v.player.position,
        name: v.player.name,
        value: v.value,
        overallRank: v.overallRank,
        positionRank: v.positionRank ?? null,
        trend30Day: v.trend30Day ?? null,
        redraftValue: v.redraftValue ?? null,
        tier: v.maybeTier ?? null,
        source: "fantasycalc",
        snapshotDate: today,
      }));

    const batches = chunk(rows, 500);
    let totalUpserted = 0;

    for (const batch of batches) {
      await db
        .insert(playerValues)
        .values(batch)
        .onConflictDoUpdate({
          target: [
            playerValues.assetId,
            playerValues.snapshotDate,
            playerValues.source,
          ],
          set: {
            position: sql`excluded.position`,
            name: sql`excluded.name`,
            value: sql`excluded.value`,
            overallRank: sql`excluded.overall_rank`,
            positionRank: sql`excluded.position_rank`,
            trend30Day: sql`excluded.trend_30day`,
            redraftValue: sql`excluded.redraft_value`,
            tier: sql`excluded.tier`,
          },
        });
      totalUpserted += batch.length;
    }

    // Retention: thin fantasycalc dailies older than 30 days down to weekly
    // (keep Mondays), matching the weekly cadence of the dynastyprocess
    // historical rows, which are never touched. The latest snapshot is always
    // kept even if the sync has been down long enough for it to age past the
    // cutoff, so "value now" lookups never regress to an older Monday.
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const thinned = await db
      .delete(playerValues)
      .where(
        and(
          eq(playerValues.source, "fantasycalc"),
          lt(playerValues.snapshotDate, cutoff),
          sql`extract(dow from ${playerValues.snapshotDate}) <> 1`,
          ne(
            playerValues.snapshotDate,
            sql`(select max(snapshot_date) from player_values where source = 'fantasycalc')`
          )
        )
      )
      .returning({ id: playerValues.id });

    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "success", totalUpserted);
    return {
      dataType: "player_values",
      status: "success",
      rowCount: totalUpserted,
      durationMs,
      note: thinned.length > 0 ? `thinned ${thinned.length} stale daily rows` : undefined,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "failure", 0, errorMessage);
    return {
      dataType: "player_values",
      status: "failure",
      rowCount: 0,
      durationMs,
      error: errorMessage,
    };
  }
}

// ---------------------------------------------------------------------------
// Step G: The Book's futures (champion, toilet bowl, MVP, ROTY)
// ---------------------------------------------------------------------------

/**
 * Re-prices the four season-long markets and settles them once the season's
 * outcomes are real (see lib/sync/book-futures.ts for the pricing, lock and
 * grading rules).
 *
 * Daily rather than hourly on purpose: these markets move on standings and
 * banked points, which change once a week, and the Monte Carlo behind the team
 * boards is not worth running twenty-four times to say the same thing.
 *
 * Runs LAST in the daily sync, because it prices off what the earlier steps
 * just wrote: rosters (standings and starters), players (rookie status and
 * projections) and playoffs (the champion and Toilet Bowl the grading pass
 * reads). Logs its own sync_log row, so a pricing failure is visible and never
 * takes league data down with it.
 */
async function syncBookFutures(): Promise<SyncStepResult> {
  const startTime = Date.now();
  const logId = await logSyncStart("daily", "book_futures");

  try {
    const season = await resolveFuturesSeason();
    if (!season) {
      const durationMs = Date.now() - startTime;
      await logSyncComplete(logId, "success", 0);
      return {
        dataType: "book_futures",
        status: "success",
        rowCount: 0,
        durationMs,
        note: "No season to price futures for yet.",
      };
    }

    // The same week resolver the board and the server action use, so the
    // projections behind a futures price and the ones behind a weekly line are
    // never taken from two different weeks.
    const bookWeek = await resolveBookWeek();
    const week =
      bookWeek && bookWeek.seasonId === season.seasonId ? bookWeek.week : 1;

    const priced = await repriceFutures(season, week);
    // Grading after pricing: a market that just closed is stamped by the
    // pricing pass, and this settles it in the same run when the season is done.
    const graded = await gradeFutures(season);

    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "success", priced.rowCount, undefined, {
      week,
      marketsPriced: priced.priced,
      marketsLockedNow: priced.lockedNow,
      marketsAlreadyLocked: priced.alreadyLocked,
      rowsGraded: graded.rowCount,
      marketsGraded: graded.markets,
    });
    return {
      dataType: "book_futures",
      status: "success",
      rowCount: priced.rowCount,
      durationMs,
      note:
        graded.markets > 0
          ? `${graded.markets} market(s) settled.`
          : priced.alreadyLocked > 0
            ? `${priced.alreadyLocked} market(s) closed, left at their booked price.`
            : undefined,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "failure", 0, errorMessage);
    return {
      dataType: "book_futures",
      status: "failure",
      rowCount: 0,
      durationMs,
      error: errorMessage,
    };
  }
}

// ---------------------------------------------------------------------------
// League chain auto-advance
// ---------------------------------------------------------------------------

/**
 * Finds the league id for the season after `currentLeague`, if one exists that
 * chains from `currentId` via previous_league_id. Sleeper leagues carry no
 * forward pointer, so we look at the current league's members' leagues for the
 * next season and match on previous_league_id. Returns null when no successor
 * is found (normal in the offseason before next year's league is created).
 */
async function findNextLeagueId(
  currentId: string,
  currentLeague: SleeperLeague
): Promise<string | null> {
  const nextSeason = String(parseInt(currentLeague.season, 10) + 1);

  const usersResult = await getLeagueUsers(currentId);
  if ("error" in usersResult) return null;

  for (const user of usersResult.data) {
    const leaguesResult = await getUserLeagues(user.user_id, nextSeason);
    if ("error" in leaguesResult) continue;
    const match = leaguesResult.data.find(
      (l) => l.previous_league_id === currentId
    );
    if (match) return match.league_id;
  }

  return null;
}

/**
 * Resolves the league id the sync should actually target. The configured
 * SLEEPER_LEAGUE_ID is treated as a chain anchor: when its season is complete
 * and a successor league exists, we follow the chain forward so the sync tracks
 * the current season without a manual env edit. Always safe: any lookup failure
 * falls back to the configured id, and the result carries a non-fatal note when
 * an advance (or a notable no-op) happened.
 */
async function resolveActiveLeagueId(
  envLeagueId: string
): Promise<{ leagueId: string; note?: string }> {
  let currentId = envLeagueId;

  // Hop cap guards against an unexpected cycle and bounds API usage.
  for (let hop = 0; hop < 5; hop++) {
    const leagueResult = await getLeague(currentId);
    if ("error" in leagueResult) {
      // Can't inspect this league; stay on the last good id.
      return currentId === envLeagueId
        ? { leagueId: currentId }
        : {
            leagueId: currentId,
            note: `Auto-advanced SLEEPER_LEAGUE_ID from ${envLeagueId} to ${currentId}`,
          };
    }

    const league = leagueResult.data;
    if (league.status !== "complete") {
      // Reached the active (non-complete) league in the chain.
      return currentId === envLeagueId
        ? { leagueId: currentId }
        : {
            leagueId: currentId,
            note: `Auto-advanced SLEEPER_LEAGUE_ID from ${envLeagueId} to ${currentId}`,
          };
    }

    const nextId = await findNextLeagueId(currentId, league);
    if (!nextId) {
      // Complete league with no successor yet (normal offseason state).
      return currentId === envLeagueId
        ? {
            leagueId: currentId,
            note: `Configured league ${currentId} is complete; no successor league found yet, staying on it`,
          }
        : {
            leagueId: currentId,
            note: `Auto-advanced SLEEPER_LEAGUE_ID from ${envLeagueId} to ${currentId}`,
          };
    }

    currentId = nextId;
  }

  return {
    leagueId: currentId,
    note: `Auto-advanced SLEEPER_LEAGUE_ID from ${envLeagueId} to ${currentId} (hop cap reached)`,
  };
}

// ---------------------------------------------------------------------------
// Step: Grade The Book's props (Tuesday-morning-ish, whenever a week's actuals
// are complete)
// ---------------------------------------------------------------------------

/**
 * Grades any book_props week whose actuals have come in complete. No Sleeper
 * call needed: just the latest season row, matching resolveBookWeek's "latest
 * season" convention in lib/queries/book.ts.
 */
async function syncBookPropGrading(): Promise<SyncStepResult> {
  const startTime = Date.now();
  const logId = await logSyncStart("daily", "book_props");

  try {
    const [latest] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .orderBy(desc(seasons.seasonYear))
      .limit(1);

    if (!latest) {
      const durationMs = Date.now() - startTime;
      await logSyncComplete(logId, "success", 0);
      return {
        dataType: "book_props",
        status: "success",
        rowCount: 0,
        durationMs,
        note: "No season in the database yet; nothing to grade.",
      };
    }

    const result = await gradeBookProps(latest.id);
    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "success", result.propsGraded, undefined, {
      weeksGraded: result.weeksGraded,
      skipped: result.skipped,
    });
    return {
      dataType: "book_props",
      status: "success",
      rowCount: result.propsGraded,
      durationMs,
      note:
        result.skipped > 0
          ? `${result.skipped} prop(s) skipped (incomplete matchup data)`
          : undefined,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    const durationMs = Date.now() - startTime;
    await logSyncComplete(logId, "failure", 0, errorMessage);
    return {
      dataType: "book_props",
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

  // Resolve the active league id first (auto-advancing past a completed season
  // when a successor league exists); everything downstream targets this id.
  const { leagueId, note: leagueNote } = await resolveActiveLeagueId(
    getLeagueId()
  );

  // League settings MUST run first and complete before the dependent syncs:
  // syncUsersAndRosters / syncDrafts / syncPlayoffBracket all require the
  // season row that syncLeagueSettings creates, so on a cold database (a brand
  // new league id) running them in parallel would fail. syncPlayers is
  // independent of the season row and can run alongside the dependents.
  const leagueResult = await syncLeagueSettings(leagueId);
  if (leagueNote) leagueResult.note = leagueNote;

  const results = await Promise.allSettled([
    syncUsersAndRosters(leagueId),
    syncPlayers(),
    syncDrafts(leagueId),
    syncPlayoffBracket(leagueId),
    syncPlayerValues(),
    syncBookPropGrading(),
  ]);

  const dataTypes = [
    "rosters",
    "players",
    "drafts",
    "playoffs",
    "player_values",
    "book_props",
  ];
  const stepResults: SyncStepResult[] = [leagueResult];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      stepResults.push(r.value);
      return;
    }
    // Promise itself rejected (unexpected)
    stepResults.push({
      dataType: dataTypes[i],
      status: "failure" as const,
      rowCount: 0,
      durationMs: 0,
      error: r.reason instanceof Error ? r.reason.message : "Unknown error",
    });
  });

  // Members depend on franchises existing; run after the roster upsert.
  const membersResult = await Promise.allSettled([syncMembers(leagueId)]);
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

  // Futures price off everything above (standings, players, playoff results),
  // so they go last and never race the steps they read.
  const futuresResult = await Promise.allSettled([syncBookFutures()]);
  stepResults.push(
    futuresResult[0].status === "fulfilled"
      ? futuresResult[0].value
      : {
          dataType: "book_futures",
          status: "failure" as const,
          rowCount: 0,
          durationMs: 0,
          error:
            futuresResult[0].reason instanceof Error
              ? futuresResult[0].reason.message
              : "Unknown error",
        },
  );

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    results: stepResults,
  };
}
