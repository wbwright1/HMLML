import { NextRequest, NextResponse } from "next/server";
import { revalidateSite } from "@/lib/revalidate";

/**
 * Drops the whole ISR cache on demand.
 *
 * Exists for the post-deploy hook (.github/workflows/post-deploy-revalidate.yml):
 * `next build` is deliberately tolerant of a database outage so a data problem
 * can never block a deploy, which means a build during an outage can prerender
 * empty-state HTML. Revalidating right after the deploy lands means the next
 * request re-renders instead of the site sitting on hollow pages until the next
 * sync. See #211.
 *
 * Deliberately thin: it reuses the same revalidation entry point the sync jobs
 * call rather than introducing a second one.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: { message: "Unauthorized", code: "unauthorized" } },
      { status: 401 },
    );
  }

  revalidateSite("deploy");

  return NextResponse.json({
    data: { revalidated: true, scope: "site" },
    syncedAt: new Date().toISOString(),
  });
}
