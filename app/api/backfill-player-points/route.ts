import { NextRequest, NextResponse } from "next/server";
import { runPlayerPointsBackfill } from "@/lib/sync/backfill-player-points";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: { message: "Unauthorized", code: "UNAUTHORIZED" } },
      { status: 401 }
    );
  }

  const seasonYearParam = request.nextUrl.searchParams.get("seasonYear");
  const seasonYear = seasonYearParam ? parseInt(seasonYearParam, 10) : NaN;

  if (!Number.isInteger(seasonYear)) {
    return NextResponse.json(
      {
        error: {
          message: "Missing or invalid seasonYear query parameter",
          code: "INVALID_SEASON_YEAR",
        },
      },
      { status: 400 }
    );
  }

  try {
    const summary = await runPlayerPointsBackfill(seasonYear);

    if (summary.status === "failure") {
      return NextResponse.json(
        {
          error: {
            message: summary.error ?? "Backfill failed",
            code: "BACKFILL_FAILED",
          },
          summary,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: summary,
      syncedAt: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[backfill-player-points] Unhandled error:", message);
    return NextResponse.json(
      { error: { message, code: "BACKFILL_UNHANDLED" } },
      { status: 500 }
    );
  }
}
