import { NextRequest, NextResponse } from "next/server";
import { runHourlySync } from "@/lib/sync/hourly";

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

  try {
    const summary = await runHourlySync();

    const hasFailure = summary.results.some((r) => r.status === "failure");
    const allFailed = summary.results.every((r) => r.status === "failure");

    if (allFailed) {
      return NextResponse.json(
        { error: "All hourly sync steps failed", summary },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      partial: hasFailure,
      summary,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[sync-hourly] Unhandled error:", message);
    return NextResponse.json(
      { error: "Hourly sync failed", message },
      { status: 500 }
    );
  }
}
