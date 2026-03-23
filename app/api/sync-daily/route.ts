import { NextRequest, NextResponse } from "next/server";
import { runDailySync } from "@/lib/sync/daily";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  // Verify CRON_SECRET for Vercel Cron authorization
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runDailySync();

    const hasFailure = summary.results.some((r) => r.status === "failure");
    const allFailed = summary.results.every((r) => r.status === "failure");

    if (allFailed) {
      return NextResponse.json(
        { error: "All sync steps failed", summary },
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
    console.error("[sync-daily] Unhandled error:", message);
    return NextResponse.json(
      { error: "Daily sync failed", message },
      { status: 500 }
    );
  }
}
