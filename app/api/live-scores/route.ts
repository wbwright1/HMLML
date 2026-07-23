import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { matchups, franchises, seasons, franchiseSeasons } from "@/lib/db/schema";
import { eq, and, desc, ne } from "drizzle-orm";
import { getLeagueMatchups, getNFLState } from "@/lib/sleeper";
import { getLatestSuccessfulSync } from "@/lib/queries/sync-log";
import { logSyncStart, logSyncComplete } from "@/lib/queries/sync-log";

/**
 * Determines if it's currently a game window.
 * NFL games typically occur:
 * - Thursday 8pm ET
 * - Sunday 1pm-11pm ET
 * - Monday 8pm ET
 * We use a broad window approach.
 */
function isCurrentlyGameWindow(): boolean {
  // Use Intl-based ET calculation so DST is handled correctly on any server
  const etString = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
  });
  const etDate = new Date(etString);
  const etHour = etDate.getHours();
  const day = etDate.getDay();

  if (day === 4 && etHour >= 19) return true;
  if (day === 0 && etHour >= 11) return true;
  if (day === 1 && etHour >= 19) return true;
  if (day === 6 && etHour >= 13) return true;

  return false;
}

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

const STALE_THRESHOLD_MS = 25_000; // 25 seconds — sync if older

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
    // In-memory rate limit — skip expensive work if called too frequently
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
      isCurrentlyGameWindow() && (await isRegularOrPostSeason());

    // During game windows, refresh scores from Sleeper if stale
    if (gameWindow && process.env.SLEEPER_LEAGUE_ID) {
      await refreshScoresIfStale(
        process.env.SLEEPER_LEAGUE_ID,
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
      const [home, away] = pair;
      scores.push({
        matchupId,
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
