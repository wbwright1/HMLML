import { db } from "@/lib/db";
import {
  seasons,
  franchises,
  franchiseSeasons,
  matchups,
  draftPicks,
  transactions,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  getLeague,
  getLeagueUsers,
  getLeagueRosters,
  getLeagueMatchups,
  getLeagueDrafts,
  getDraftPicks,
  getLeagueTransactions,
  getWinnersBracket,
  getLosersBracket,
} from "@/lib/sleeper";
import { logSyncStart, logSyncComplete } from "@/lib/queries/sync-log";
import { derivePlayoffResults } from "@/lib/sync/derive-playoffs";
import type { SleeperLeague } from "@/lib/sleeper-schemas";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SeasonImportResult {
  seasonYear: number;
  leagueId: string;
  status: "success" | "partial" | "failure";
  counts: {
    franchises: number;
    franchiseSeasons: number;
    matchups: number;
    draftPicks: number;
    transactions: number;
  };
  errors: string[];
  durationMs: number;
}

export interface LegacyImportSummary {
  startedAt: string;
  completedAt: string;
  seasonsDiscovered: number;
  seasonsImported: number;
  seasonsFailed: number;
  seasonResults: SeasonImportResult[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getLeagueId(): string {
  const id = process.env.SLEEPER_LEAGUE_ID;
  if (!id) throw new Error("SLEEPER_LEAGUE_ID is not set");
  return id;
}

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

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Step 1: Discover all historical league seasons via chain traversal
// ---------------------------------------------------------------------------

interface DiscoveredSeason {
  leagueId: string;
  league: SleeperLeague;
}

async function discoverLeagueChain(
  startingLeagueId?: string
): Promise<DiscoveredSeason[]> {
  const chain: DiscoveredSeason[] = [];
  const visited = new Set<string>();

  // Start from provided league ID or current league
  let nextId: string | null = startingLeagueId ?? getLeagueId();

  console.log("[legacy-import] Discovering league chain...");

  while (nextId) {
    // Guard against circular chains
    if (visited.has(nextId)) {
      console.warn(
        `[legacy-import] Circular chain detected at league ${nextId}, stopping traversal`
      );
      break;
    }
    visited.add(nextId);

    const result = await getLeague(nextId);
    await delay(100);

    if ("error" in result) {
      console.error(
        `[legacy-import] Failed to fetch league ${nextId}: ${result.error.message}`
      );
      break;
    }

    chain.push({
      leagueId: nextId,
      league: result.data,
    });

    nextId = result.data.previous_league_id ?? null;
  }

  // Reverse so oldest season is first
  chain.reverse();

  console.log(
    `[legacy-import] Discovered ${chain.length} seasons: ${chain.map((s) => s.league.season).join(", ")}`
  );

  return chain;
}

// ---------------------------------------------------------------------------
// Step 2a: Import league settings for a season
// ---------------------------------------------------------------------------

async function importSeasonSettings(
  league: SleeperLeague
): Promise<{ seasonDbId: number }> {
  const seasonYear = parseInt(league.season, 10);

  const playoffWeekStart =
    typeof league.settings.playoff_week_start === "number"
      ? league.settings.playoff_week_start
      : null;

  const [seasonRecord] = await db
    .insert(seasons)
    .values({
      seasonYear,
      leagueId: league.league_id,
      previousLeagueId: league.previous_league_id,
      status: league.status,
      totalRosters: league.total_rosters,
      playoffWeekStart,
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
        settingsJson: {
          settings: league.settings,
          roster_positions: league.roster_positions,
          scoring_settings: league.scoring_settings,
        },
        updatedAt: new Date(),
      },
    })
    .returning({ id: seasons.id });

  return { seasonDbId: seasonRecord.id };
}

// ---------------------------------------------------------------------------
// Step 2b: Import users & rosters for a season
// ---------------------------------------------------------------------------

async function importUsersAndRosters(
  leagueId: string,
  seasonDbId: number,
  isLegacy: boolean
): Promise<{ franchiseCount: number; franchiseSeasonCount: number }> {
  const [usersResult, rostersResult] = await Promise.all([
    getLeagueUsers(leagueId),
    getLeagueRosters(leagueId),
  ]);
  await delay(100);

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

  // Build user_id → { teamName, displayName } map
  const userMap = new Map<
    string,
    { teamName: string; displayName: string }
  >();
  for (const u of users) {
    userMap.set(u.user_id, {
      teamName: u.metadata?.team_name?.trim() || u.display_name,
      displayName: u.display_name,
    });
  }

  let franchiseCount = 0;
  let franchiseSeasonCount = 0;

  for (const roster of rosters) {
    const ownerId = roster.owner_id;
    if (!ownerId) continue; // Skip unowned rosters

    const userData = userMap.get(ownerId) ?? {
      teamName: "Unknown",
      displayName: "Unknown",
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

    franchiseCount++;

    // Compute points scored & against from roster settings
    const fpts = roster.settings.fpts ?? 0;
    const fptsDecimal = roster.settings.fpts_decimal ?? 0;
    const pointsScored = fpts + fptsDecimal / 100;

    const fptsAgainst = roster.settings.fpts_against ?? 0;
    const fptsAgainstDecimal = roster.settings.fpts_against_decimal ?? 0;
    const pointsAgainst = fptsAgainst + fptsAgainstDecimal / 100;

    // Upsert franchise_season
    await db
      .insert(franchiseSeasons)
      .values({
        franchiseId,
        seasonId: seasonDbId,
        rosterId: rosterIdStr,
        userId: ownerId,
        ownerDisplayName: userData.displayName,
        wins: roster.settings.wins ?? 0,
        losses: roster.settings.losses ?? 0,
        ties: roster.settings.ties ?? 0,
        pointsScored,
        pointsAgainst,
        isLegacyEra: isLegacy,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [franchiseSeasons.franchiseId, franchiseSeasons.seasonId],
        set: {
          rosterId: rosterIdStr,
          userId: ownerId,
          ownerDisplayName: userData.displayName,
          wins: roster.settings.wins ?? 0,
          losses: roster.settings.losses ?? 0,
          ties: roster.settings.ties ?? 0,
          pointsScored,
          pointsAgainst,
          isLegacyEra: isLegacy,
          updatedAt: new Date(),
        },
      });

    franchiseSeasonCount++;
  }

  return { franchiseCount, franchiseSeasonCount };
}

// ---------------------------------------------------------------------------
// Step 2c: Import matchups for a season
// ---------------------------------------------------------------------------

async function importMatchups(
  leagueId: string,
  seasonDbId: number,
  league: SleeperLeague
): Promise<number> {
  // Build roster_id → franchise_id (owner_id) mapping
  const rostersResult = await getLeagueRosters(leagueId);
  await delay(100);

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

  const playoffWeekStart =
    typeof league.settings.playoff_week_start === "number"
      ? league.settings.playoff_week_start
      : 15; // default NFL playoff start

  let totalMatchups = 0;

  // Iterate weeks 1 through 18
  for (let week = 1; week <= 18; week++) {
    const matchupsResult = await getLeagueMatchups(leagueId, week);
    await delay(100);

    if ("error" in matchupsResult) {
      // Weeks beyond the season may return errors; skip silently
      console.warn(
        `[legacy-import] Week ${week} matchups error for ${leagueId}: ${matchupsResult.error.message}`
      );
      continue;
    }

    const weekMatchups = matchupsResult.data;
    if (!weekMatchups || weekMatchups.length === 0) continue;

    // Group by matchup_id to determine winners
    const matchupGroups = new Map<
      number,
      { rosterId: number; points: number }[]
    >();

    for (const m of weekMatchups) {
      if (m.matchup_id === null) continue;
      const group = matchupGroups.get(m.matchup_id) ?? [];
      group.push({
        rosterId: m.roster_id,
        points: m.points ?? 0,
      });
      matchupGroups.set(m.matchup_id, group);
    }

    // Determine winners per matchup group
    const winnerMap = new Map<number, number | null>(); // rosterId → winnerId
    for (const [, group] of matchupGroups) {
      if (group.length === 2) {
        const [a, b] = group;
        if (a.points > b.points) {
          winnerMap.set(a.rosterId, a.rosterId);
          winnerMap.set(b.rosterId, a.rosterId);
        } else if (b.points > a.points) {
          winnerMap.set(a.rosterId, b.rosterId);
          winnerMap.set(b.rosterId, b.rosterId);
        } else {
          // Tie
          winnerMap.set(a.rosterId, null);
          winnerMap.set(b.rosterId, null);
        }
      }
    }

    const isPlayoffWeek = week >= playoffWeekStart;

    // Build rows for batch upsert
    const rows = weekMatchups
      .filter((m) => m.matchup_id !== null)
      .map((m) => {
        const franchiseId = rosterToFranchise.get(m.roster_id);
        if (!franchiseId) return null;

        const winnerId = winnerMap.get(m.roster_id);
        const isWinner =
          winnerId === undefined
            ? null
            : winnerId === null
              ? null // tie
              : winnerId === m.roster_id;

        return {
          seasonId: seasonDbId,
          week,
          matchupId: m.matchup_id!,
          franchiseId,
          rosterId: String(m.roster_id),
          points: m.points ?? 0,
          isWinner,
          isPlayoff: isPlayoffWeek,
          status: "complete" as const,
          updatedAt: new Date(),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length === 0) continue;

    // Batch upsert matchups in chunks
    const batches = chunk(rows, 50);
    for (const batch of batches) {
      await db
        .insert(matchups)
        .values(batch)
        .onConflictDoUpdate({
          target: [matchups.seasonId, matchups.week, matchups.rosterId],
          set: {
            matchupId: sql`excluded.matchup_id`,
            franchiseId: sql`excluded.franchise_id`,
            points: sql`excluded.points`,
            isWinner: sql`excluded.is_winner`,
            isPlayoff: sql`excluded.is_playoff`,
            status: sql`excluded.status`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
      totalMatchups += batch.length;
    }
  }

  return totalMatchups;
}

// ---------------------------------------------------------------------------
// Step 2d: Import draft data for a season
// ---------------------------------------------------------------------------

async function importDrafts(
  leagueId: string,
  seasonDbId: number,
  isLegacy: boolean
): Promise<number> {
  const draftsResult = await getLeagueDrafts(leagueId);
  await delay(100);

  if ("error" in draftsResult) {
    throw new Error(`Sleeper drafts API error: ${draftsResult.error.message}`);
  }

  const draftsData = draftsResult.data;
  if (!draftsData || draftsData.length === 0) return 0;

  // Build roster_id → franchise_id mapping
  const rostersResult = await getLeagueRosters(leagueId);
  await delay(100);

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

  let totalPicks = 0;

  for (const draft of draftsData) {
    const picksResult = await getDraftPicks(draft.draft_id);
    await delay(100);

    if ("error" in picksResult) {
      console.warn(
        `[legacy-import] Draft ${draft.draft_id} picks error: ${picksResult.error.message}`
      );
      continue;
    }

    const picks = picksResult.data;
    if (!picks || picks.length === 0) continue;

    // Determine draft type by round count: startup drafts have many rounds
    // (28+ for a full roster), while rookie drafts have 3-5 rounds.
    // Sleeper's draft.type is "snake" or "linear" (format), not "startup"/"rookie".
    const rounds = typeof draft.settings?.rounds === "number"
      ? (draft.settings.rounds as number)
      : 0;
    const draftType = rounds > 10 ? "startup" : "rookie";

    const rows = picks.map((pick) => {
      const franchiseId = rosterToFranchise.get(pick.roster_id) ?? null;
      const playerName = pick.metadata
        ? [pick.metadata.first_name, pick.metadata.last_name]
            .filter(Boolean)
            .join(" ") || null
        : null;

      return {
        seasonId: seasonDbId,
        draftId: draft.draft_id,
        draftType,
        round: pick.round,
        pickNumber: pick.pick_no,
        rosterId: String(pick.roster_id),
        franchiseId,
        playerId: pick.player_id,
        playerName,
        isLegacyEra: isLegacy,
      };
    });

    // Batch upsert — draft_picks has no unique constraint for upsert,
    // so we delete existing picks for this draft and re-insert
    // This is still idempotent: running again produces same result
    await db
      .delete(draftPicks)
      .where(eq(draftPicks.draftId, draft.draft_id));

    const batches = chunk(rows, 50);
    for (const batch of batches) {
      await db.insert(draftPicks).values(batch);
      totalPicks += batch.length;
    }
  }

  return totalPicks;
}

// ---------------------------------------------------------------------------
// Step 2e: Import transactions for a season
// ---------------------------------------------------------------------------

async function importTransactions(
  leagueId: string,
  seasonDbId: number
): Promise<number> {
  let totalTransactions = 0;

  // Iterate weeks 1 through 18
  for (let week = 1; week <= 18; week++) {
    const txResult = await getLeagueTransactions(leagueId, week);
    await delay(100);

    if ("error" in txResult) {
      // Weeks beyond the season may return errors; skip
      console.warn(
        `[legacy-import] Week ${week} transactions error for ${leagueId}: ${txResult.error.message}`
      );
      continue;
    }

    const txns = txResult.data;
    if (!txns || txns.length === 0) continue;

    const rows = txns.map((tx) => ({
      seasonId: seasonDbId,
      transactionId: tx.transaction_id,
      type: tx.type,
      status: tx.status,
      week: tx.week ?? week,
      rosterIds: tx.roster_ids,
      adds: tx.adds,
      drops: tx.drops,
      draftPicksInvolved: tx.draft_picks,
      createdAtSleeper: tx.created,
    }));

    const batches = chunk(rows, 50);
    for (const batch of batches) {
      await db
        .insert(transactions)
        .values(batch)
        .onConflictDoUpdate({
          target: transactions.transactionId,
          set: {
            seasonId: sql`excluded.season_id`,
            type: sql`excluded.type`,
            status: sql`excluded.status`,
            week: sql`excluded.week`,
            rosterIds: sql`excluded.roster_ids`,
            adds: sql`excluded.adds`,
            drops: sql`excluded.drops`,
            draftPicksInvolved: sql`excluded.draft_picks_involved`,
            createdAtSleeper: sql`excluded.created_at_sleeper`,
          },
        });
      totalTransactions += batch.length;
    }
  }

  return totalTransactions;
}

// ---------------------------------------------------------------------------
// Step 2f: Import playoff bracket results for a season
// ---------------------------------------------------------------------------

async function importPlayoffBracket(
  leagueId: string,
  seasonDbId: number
): Promise<void> {
  // Build roster_id → franchise_id (owner_id) mapping
  const rostersResult = await getLeagueRosters(leagueId);
  await delay(100);

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
  await delay(100);

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
  for (const [franchiseId, playoffResult] of results.franchiseResults) {
    await db
      .update(franchiseSeasons)
      .set({ playoffResult, updatedAt: new Date() })
      .where(
        sql`${franchiseSeasons.franchiseId} = ${franchiseId} AND ${franchiseSeasons.seasonId} = ${seasonDbId}`
      );
  }

  // Update seasons.championFranchiseId
  if (results.championFranchiseId) {
    await db
      .update(seasons)
      .set({
        championFranchiseId: results.championFranchiseId,
        updatedAt: new Date(),
      })
      .where(eq(seasons.id, seasonDbId));
  }

  console.log(
    `[legacy-import] Playoff bracket: champion=${results.championFranchiseId ?? "TBD"}, runner_up=${results.runnerUpFranchiseId ?? "TBD"}, ${results.franchiseResults.size} results`
  );
}

// ---------------------------------------------------------------------------
// Step 3: Import a single season (discrete unit of work)
// ---------------------------------------------------------------------------

async function importSeason(
  discovered: DiscoveredSeason
): Promise<SeasonImportResult> {
  const startTime = Date.now();
  const seasonYear = parseInt(discovered.league.season, 10);
  const leagueId = discovered.leagueId;
  // Mark as legacy era based on roster count (10-team seasons are legacy)
  const isLegacy = (discovered.league.total_rosters ?? 12) < 12;
  const errors: string[] = [];
  const counts = {
    franchises: 0,
    franchiseSeasons: 0,
    matchups: 0,
    draftPicks: 0,
    transactions: 0,
  };

  const logId = await logSyncStart("legacy_import", `season_${seasonYear}`);

  console.log(
    `[legacy-import] Importing season ${seasonYear} (league ${leagueId}, legacy=${isLegacy})...`
  );

  try {
    // 2a: League settings
    const { seasonDbId } = await importSeasonSettings(discovered.league);

    // 2b: Users & rosters
    try {
      const rosterResult = await importUsersAndRosters(
        leagueId,
        seasonDbId,
        isLegacy
      );
      counts.franchises = rosterResult.franchiseCount;
      counts.franchiseSeasons = rosterResult.franchiseSeasonCount;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      errors.push(`Users/Rosters: ${msg}`);
      console.error(
        `[legacy-import] Season ${seasonYear} users/rosters error: ${msg}`
      );
    }

    // 2c: Matchups
    try {
      counts.matchups = await importMatchups(
        leagueId,
        seasonDbId,
        discovered.league
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      errors.push(`Matchups: ${msg}`);
      console.error(
        `[legacy-import] Season ${seasonYear} matchups error: ${msg}`
      );
    }

    // 2d: Drafts
    try {
      counts.draftPicks = await importDrafts(leagueId, seasonDbId, isLegacy);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      errors.push(`Drafts: ${msg}`);
      console.error(
        `[legacy-import] Season ${seasonYear} drafts error: ${msg}`
      );
    }

    // 2e: Transactions
    try {
      counts.transactions = await importTransactions(leagueId, seasonDbId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      errors.push(`Transactions: ${msg}`);
      console.error(
        `[legacy-import] Season ${seasonYear} transactions error: ${msg}`
      );
    }

    // 2f: Playoff bracket results (only for completed seasons)
    try {
      if (discovered.league.status === "complete") {
        await importPlayoffBracket(leagueId, seasonDbId);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      errors.push(`Playoff bracket: ${msg}`);
      console.error(
        `[legacy-import] Season ${seasonYear} playoff bracket error: ${msg}`
      );
    }

    const durationMs = Date.now() - startTime;
    const status = errors.length > 0 ? "partial" : "success";
    const totalRows =
      counts.franchises +
      counts.franchiseSeasons +
      counts.matchups +
      counts.draftPicks +
      counts.transactions;

    await logSyncComplete(
      logId,
      status,
      totalRows,
      errors.length > 0 ? errors.join("; ") : undefined
    );

    console.log(
      `[legacy-import] Season ${seasonYear} ${status}: ${JSON.stringify(counts)} (${durationMs}ms)`
    );

    return {
      seasonYear,
      leagueId,
      status,
      counts,
      errors,
      durationMs,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    const durationMs = Date.now() - startTime;

    await logSyncComplete(logId, "failure", 0, errorMessage);

    console.error(
      `[legacy-import] Season ${seasonYear} FAILED: ${errorMessage}`
    );

    return {
      seasonYear,
      leagueId,
      status: "failure",
      counts,
      errors: [errorMessage],
      durationMs,
    };
  }
}

// ---------------------------------------------------------------------------
// Main: Run Legacy Import
// ---------------------------------------------------------------------------

export async function runLegacyImport(
  startingLeagueId?: string
): Promise<LegacyImportSummary> {
  const startedAt = new Date().toISOString();
  const topLevelLogId = await logSyncStart("legacy_import", "full_import");

  console.log("[legacy-import] Starting legacy data import...");

  try {
    // Step 1: Discover all historical seasons
    const chain = await discoverLeagueChain(startingLeagueId);

    if (chain.length === 0) {
      await logSyncComplete(topLevelLogId, "success", 0);
      return {
        startedAt,
        completedAt: new Date().toISOString(),
        seasonsDiscovered: 0,
        seasonsImported: 0,
        seasonsFailed: 0,
        seasonResults: [],
      };
    }

    const seasonResults: SeasonImportResult[] = [];

    // Step 2: Import each season (oldest to newest)
    for (let i = 0; i < chain.length; i++) {
      const result = await importSeason(chain[i]);
      seasonResults.push(result);

      // Delay between seasons to respect rate limits
      if (i < chain.length - 1) {
        await delay(500);
      }
    }

    const summary: LegacyImportSummary = {
      startedAt,
      completedAt: new Date().toISOString(),
      seasonsDiscovered: chain.length,
      seasonsImported: seasonResults.filter(
        (r) => r.status === "success" || r.status === "partial"
      ).length,
      seasonsFailed: seasonResults.filter((r) => r.status === "failure").length,
      seasonResults,
    };

    const totalRows = seasonResults.reduce(
      (sum, r) =>
        sum +
        r.counts.franchises +
        r.counts.franchiseSeasons +
        r.counts.matchups +
        r.counts.draftPicks +
        r.counts.transactions,
      0
    );

    const overallStatus =
      summary.seasonsFailed === summary.seasonsDiscovered
        ? "failure"
        : summary.seasonsFailed > 0
          ? "partial"
          : "success";

    await logSyncComplete(
      topLevelLogId,
      overallStatus,
      totalRows,
      summary.seasonsFailed > 0
        ? `${summary.seasonsFailed}/${summary.seasonsDiscovered} seasons failed`
        : undefined
    );

    console.log(
      `[legacy-import] Complete. ${summary.seasonsImported}/${summary.seasonsDiscovered} seasons imported, ${summary.seasonsFailed} failed.`
    );

    return summary;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    await logSyncComplete(topLevelLogId, "failure", 0, errorMessage);
    throw e;
  }
}
