import { revalidatePath } from "next/cache";
import { SITE_REVALIDATE_PATH } from "@/lib/cache";

/**
 * Invalidates every ISR-cached page after a sync has landed new data.
 *
 * revalidatePath("/", "layout") clears everything beneath the root layout in one
 * call, which is the right granularity here: any sync can move data on any page
 * (the hub alone reads standings, matchups, kickoff, awards and lore), and there
 * is no finer split worth maintaining.
 *
 * Never throws. A revalidation failure must not turn a successful sync into a
 * 500, because the cron workflow files a GitHub issue on failure and a stale
 * page is a far smaller problem than a false alarm; the time-based window
 * (lib/cache.ts) picks up the slack.
 */
export function revalidateSite(source: string): void {
  try {
    revalidatePath(SITE_REVALIDATE_PATH, "layout");
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(`[${source}] revalidatePath failed (data still synced):`, message);
  }
}
