import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { matchups, franchises, seasons, franchiseSeasons } from "@/lib/db/schema";
import { eq, and, desc, ne } from "drizzle-orm";
import { getLeagueMatchups, getNFLState } from "@/lib/sleeper";
import { getLatestSuccessfulSync } from "@/lib/queries/sync-log";
import { logSyncStart, logSyncComplete } from "@/lib/queries/sync-log";
import { isPlausibleGameWindow } from "@/lib/game-window";

const NFL_STATE_CACHE_MS = 25_000; // Cache NFL state fetches in-memory

/** In-memory cache of the NFL season type to avoid a Sleeper call per poll. */
let cachedNflSeasonType: string | null = null;
let cachedNflStateTimestamp = 0;

/**
 * Whether the NFL is currently in its regular season or playoffs.
 *
 * The day/hour heuristic alone is season-blind: during the offseason a
 * Thursday-evening or weekend poll would otherwise be treated as a live game
 * window and trigger a Sleeper refresh that can overwrite completed matchups.
 * We gate the window on the NFL `season_type` ("regular" or "post").
 *
 * NFL state is not persisted in a queryable table, so we fetch it from Sleeper
 * but cache it in-memory (25s) to stay within the route's existing rate budget.
 * On a fetch failure we retain any previous cached value; with no value yet we
 * fail safe to `false`, keeping completed data protected.
 */
async function isRegularOrPostSeason(): Promise<boolean> {
  const now = Date.now();
  if (
    cachedNflSeasonType === null ||
    now - cachedNflStateTimestamp >= NFL_STATE_CACHE_MS
  ) {
    const result = await getNFLState();
    if (!("error" in result)) {
      cachedNflSeasonType = result.data.season_type;
      cachedNflStateTimestamp = now;
    }
    // On error: keep the previous (possibly stale) value rather than clobber it.
  }
  return cachedNflSeasonType === "regular" || cachedNflSeasonType === "post";
}

const STALE_THRESHOLD_MS = 25_000; // 25 seconds: sync if older

/** In-memory timestamp of the last refresh to rate-limit DB writes. */
let lastRefreshTimestamp = 0;

/**
 * During game windows, fetch fresh scores from Sleeper if our cached
 * data is more than 25 seconds old. This bridges the gap between the
 * hourly cron sync and the 30-second client poll requirement (FR30).
 *
 * An in-memory timestamp gate ensures anonymous GET requests cannot
 * trigger Sleeper API calls / DB writes more often than every 25 s.
 */
async function refreshScoresIfStale(
  leagueId: string,
  seasonId: number,
  week: number
): Promise<void> {
  try {
    // In-memory rate limit: skip expensive work if called too frequently
    const now = Date.now();
    if (now - lastRefreshTimestamp < STALE_THRESHOLD_MS) return;
    lastRefreshTimestamp = now;

    const lastSync = await getLatestSuccessfulSync("matchups");
    if (lastSync) {
      const age = Date.now() - new Date(lastSync.startedAt!).getTime();
      if (age < STALE_THRESHOLD_MS) return; // Still fresh
    }

    const logId = await logSyncStart("live", "matchups");
    const result = await getLeagueMatchups(leagueId, week);

    if ("error" in result) {
      await logSyncComplete(logId, "failure", 0, result.error.message);
      return;
    }

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

    let rowCount = 0;
    for (const m of result.data) {
      const rosterIdStr = String(m.roster_id);
      const franchiseId = rosterToFranchise.get(rosterIdStr);
      if (!franchiseId || m.matchup_id == null) continue;

      await db
        .insert(matchups)
        .values({
          seasonId,
          week,
          matchupId: m.matchup_id,
          franchiseId,
          rosterId: rosterIdStr,
          points: m.points ?? 0,
          status: (m.points ?? 0) > 0 ? "in_progress" : "scheduled",
        })
        .onConflictDoUpdate({
          target: [matchups.seasonId, matchups.week, matchups.rosterId],
          set: {
            points: m.points ?? 0,
            status: (m.points ?? 0) > 0 ? "in_progress" : "scheduled",
            updatedAt: new Date(),
          },
          // Never downgrade a finished matchup: leave "complete" rows (and
          // their final scores) untouched regardless of window logic.
          setWhere: ne(matchups.status, "complete"),
        });
      rowCount++;
    }

    await logSyncComplete(logId, "success", rowCount);
  } catch (e) {
    console.error("[live-scores] Background refresh error:", e);
  }
}

export async function GET() {
  try {
    const [latestSeason] = await db
      .select()
      .from(seasons)
      .orderBy(desc(seasons.seasonYear))
      .limit(1);

    if (!latestSeason) {
      return NextResponse.json({
        data: { scores: [], isGameWindow: false },
        syncedAt: new Date().toISOString(),
      });
    }

    const [latestMatchup] = await db
      .select({ week: matchups.week })
      .from(matchups)
      .where(eq(matchups.seasonId, latestSeason.id))
      .orderBy(desc(matchups.week))
      .limit(1);

    if (!latestMatchup) {
      return NextResponse.json({
        data: { scores: [], isGameWindow: false },
        syncedAt: new Date().toISOString(),
      });
    }

    const currentWeek = latestMatchup.week;
    // Gate the game window on BOTH the day/hour heuristic AND the NFL season
    // phase. The cheap day/hour check short-circuits first, so we only fetch
    // NFL state (cached in-memory) when a poll actually lands in a window.
    const gameWindow =
      isPlausibleGameWindow() && (await isRegularOrPostSeason());

    // During game windows, refresh scores from Sleeper if stale. Use the
    // league id stored on the latest season row, not the env var: the sync
    // layer auto-advances the league chain across seasons, but the env var
    // stays fixed, so once the chain advances it would point at the STALE
    // previous league. Sleeper reuses roster_id 1-12 across seasons, so a
    // refresh against the wrong league would still "match" rows here and
    // silently overwrite the new season's matchups with old data.
    if (gameWindow && latestSeason.leagueId) {
      await refreshScoresIfStale(
        latestSeason.leagueId,
        latestSeason.id,
        currentWeek
      );
    }

    // Read current scores from DB
    const rows = await db
      .select({
        matchupId: matchups.matchupId,
        franchiseId: matchups.franchiseId,
        rosterId: matchups.rosterId,
        points: matchups.points,
        status: matchups.status,
        franchiseName: franchises.name,
      })
      .from(matchups)
      .innerJoin(franchises, eq(matchups.franchiseId, franchises.id))
      .where(
        and(
          eq(matchups.seasonId, latestSeason.id),
          eq(matchups.week, currentWeek)
        )
      );

    const grouped = new Map<number, typeof rows>();
    for (const row of rows) {
      if (!grouped.has(row.matchupId)) {
        grouped.set(row.matchupId, []);
      }
      grouped.get(row.matchupId)!.push(row);
    }

    const scores = [];
    for (const [matchupId, pair] of grouped) {
      if (pair.length < 2) continue;
      const [home, away] = [...pair].sort((a, b) =>
        a.rosterId.localeCompare(b.rosterId)
      );
      // Pair status: complete only when BOTH sides are final; live as soon as
      // either side is in progress. Consumers (the nav live pill, the matchup
      // detail poller) key their live chrome off this.
      const pairStatus =
        home.status === "complete" && away.status === "complete"
          ? "complete"
          : home.status === "in_progress" || away.status === "in_progress"
            ? "in_progress"
            : "scheduled";
      scores.push({
        matchupId,
        status: pairStatus,
        homeTeamId: home.franchiseId,
        homeTeamName: home.franchiseName,
        homeScore: home.points ?? 0,
        awayTeamId: away.franchiseId,
        awayTeamName: away.franchiseName,
        awayScore: away.points ?? 0,
      });
    }

    return NextResponse.json({
      data: {
        scores,
        isGameWindow: gameWindow,
        liveCount: scores.filter((s) => s.status === "in_progress").length,
        week: currentWeek,
        seasonYear: latestSeason.seasonYear,
      },
      syncedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[live-scores] Error:", e);
    return NextResponse.json({
      data: { scores: [], isGameWindow: false },
      syncedAt: new Date().toISOString(),
    });
  }
}
