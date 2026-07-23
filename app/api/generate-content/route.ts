import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seasons, syncLog } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { getNflState, type NflSeasonType } from "@/lib/queries/nfl-state";
import { getMatchupsByWeek } from "@/lib/queries/matchups";
import { getSeasonStandings } from "@/lib/queries/seasons";
import { resolveHubSeasonType, isPreWeekOne } from "@/lib/hub/season-state";
import { buildStatsContext } from "@/lib/content-gen/stats-context";
import { generateContent } from "@/lib/content-gen/generate";
import { replaceHubContent } from "@/lib/queries/hub-content";

export const maxDuration = 300;

const VALID_SEASON_TYPES: NflSeasonType[] = ["pre", "regular", "post", "off"];

interface RunTarget {
  seasonId: number;
  seasonYear: number;
  seasonType: NflSeasonType;
  week: number;
}

/**
 * Resolves which season/week/state to generate for. Explicit query params win
 * so the endpoint can be exercised against a seeded TEST season without touching
 * live state: `?seasonType` forces the resolved state (and therefore the write
 * scope), bypassing the hub-parity derivation below.
 *
 * When seasonType is NOT given, the state is derived exactly the way the hub
 * derives it (app/page.tsx): resolveHubSeasonType over the same inputs (raw NFL
 * season type, the latest season's db status, whether any current-week matchup
 * is live, and whether the season is pre-Week-1). This is load-bearing: the cron
 * must write to the same scope the hub reads, or the generated content is never
 * shown (e.g. a raw "regular" NFL state that the hub flips to "pre" because
 * nothing has been played yet).
 */
async function resolveTarget(request: NextRequest): Promise<RunTarget | null> {
  const params = request.nextUrl.searchParams;
  const seasonIdParam = params.get("seasonId");
  const seasonTypeParam = params.get("seasonType");
  const weekParam = params.get("week");

  // Load the season row (explicit id, else the latest by year).
  const parsedSeasonId = seasonIdParam ? parseInt(seasonIdParam, 10) : null;
  const [seasonRow] =
    parsedSeasonId != null && Number.isFinite(parsedSeasonId)
      ? await db
          .select({ id: seasons.id, seasonYear: seasons.seasonYear, status: seasons.status })
          .from(seasons)
          .where(eq(seasons.id, parsedSeasonId))
          .limit(1)
      : await db
          .select({ id: seasons.id, seasonYear: seasons.seasonYear, status: seasons.status })
          .from(seasons)
          .orderBy(desc(seasons.seasonYear))
          .limit(1);

  if (!seasonRow) return null;

  const seasonTypeOverride: NflSeasonType | null =
    seasonTypeParam && VALID_SEASON_TYPES.includes(seasonTypeParam as NflSeasonType)
      ? (seasonTypeParam as NflSeasonType)
      : null;

  const nflState = await getNflState();

  let week: number | null = weekParam ? parseInt(weekParam, 10) : null;
  if (week == null) week = nflState?.week ?? 1;
  if (!Number.isFinite(week) || week < 1) week = 1;

  let seasonType: NflSeasonType;
  if (seasonTypeOverride) {
    // Explicit override forces the resolved state (and the write scope).
    seasonType = seasonTypeOverride;
  } else {
    // Mirror the hub's derivation so the write scope matches the read scope.
    let hasLiveMatchups = false;
    let nothingPlayedYet = false;
    try {
      const [weekMatchups, standings] = await Promise.all([
        getMatchupsByWeek(seasonRow.id, week),
        getSeasonStandings(seasonRow.id),
      ]);
      hasLiveMatchups = weekMatchups.some((m) => m.status === "in_progress");
      nothingPlayedYet = isPreWeekOne(standings);
    } catch {
      // DB hiccup: fall through with the conservative defaults above.
    }
    seasonType = resolveHubSeasonType({
      nflSeasonType: nflState?.seasonType ?? null,
      dbSeasonStatus: seasonRow.status ?? null,
      hasLiveMatchups,
      nothingPlayedYet,
    });
  }

  return { seasonId: seasonRow.id, seasonYear: seasonRow.seasonYear, seasonType, week };
}

async function runGeneration(request: NextRequest) {
  const startTime = Date.now();
  const startedAt = new Date();

  const target = await resolveTarget(request);
  if (!target) {
    await db.insert(syncLog).values({
      syncType: "generate-content",
      dataType: "hub_content",
      status: "failure",
      rowCount: 0,
      durationMs: Date.now() - startTime,
      errorMessage: "No season found to generate content for",
      startedAt,
      completedAt: new Date(),
    });
    return NextResponse.json(
      { error: { message: "No season found to generate content for", code: "no_season" } },
      { status: 500 },
    );
  }

  // No hub state reads generated content during the playoffs or the offseason,
  // and kindsForSeason maps them to no kinds. Skip generation cleanly rather
  // than write mis-scoped rows.
  if (target.seasonType === "post" || target.seasonType === "off") {
    const durationMs = Date.now() - startTime;
    await db.insert(syncLog).values({
      syncType: "generate-content",
      dataType: "hub_content",
      status: "success",
      rowCount: 0,
      durationMs,
      detailsJson: {
        skipped: "unsupported-season-state",
        seasonId: target.seasonId,
        seasonType: target.seasonType,
        week: null,
      },
      startedAt,
      completedAt: new Date(),
    });
    return NextResponse.json({
      data: {
        seasonId: target.seasonId,
        seasonType: target.seasonType,
        week: null,
        path: "skipped",
        rowCount: 0,
        kinds: [],
      },
      syncedAt: new Date().toISOString(),
    });
  }

  try {
    const ctx = await buildStatsContext(target);
    const generated = await generateContent(ctx);

    // Regular-season content is week-scoped; preseason/offseason is season-scoped.
    const week = ctx.seasonType === "regular" ? ctx.week : null;
    const rowCount = await replaceHubContent(
      target.seasonId,
      week,
      generated.kinds,
      generated.rows,
      "auto",
    );

    const durationMs = Date.now() - startTime;
    await db.insert(syncLog).values({
      syncType: "generate-content",
      dataType: "hub_content",
      status: "success",
      rowCount,
      durationMs,
      detailsJson: {
        path: generated.source,
        seasonId: target.seasonId,
        seasonType: ctx.seasonType,
        week,
        kinds: generated.kinds,
        templateFilledKinds: generated.templateFilledKinds ?? [],
        // Content diversity/dedup observability: how many candidate rows the
        // validate + selectDiverseSubset layer dropped (invalid or
        // duplicate), and which kinds had to relax their cap to avoid
        // shipping an empty module.
        diversityDroppedCount: generated.diversityStats?.droppedCount ?? 0,
        diversityRelaxedKinds: generated.diversityStats?.relaxedKinds ?? [],
      },
      startedAt,
      completedAt: new Date(),
    });

    return NextResponse.json({
      data: {
        seasonId: target.seasonId,
        seasonType: ctx.seasonType,
        week,
        path: generated.source,
        rowCount,
        kinds: generated.kinds,
      },
      syncedAt: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[generate-content] error:", message);
    await db.insert(syncLog).values({
      syncType: "generate-content",
      dataType: "hub_content",
      status: "failure",
      rowCount: 0,
      durationMs: Date.now() - startTime,
      errorMessage: message,
      startedAt,
      completedAt: new Date(),
    });
    return NextResponse.json(
      { error: { message: "Content generation failed", code: "generation_failed" } },
      { status: 500 },
    );
  }
}

function authorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  return Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;
}

// Vercel Cron issues GET; the acceptance test issues POST. Both share one path.
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: { message: "Unauthorized", code: "unauthorized" } },
      { status: 401 },
    );
  }
  return runGeneration(request);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: { message: "Unauthorized", code: "unauthorized" } },
      { status: 401 },
    );
  }
  return runGeneration(request);
}
