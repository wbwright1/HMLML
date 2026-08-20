import { revalidatePath, revalidateTag } from "next/cache";
import { SITE_REVALIDATE_PATH, LEAGUE_DATA_TAG } from "@/lib/cache";

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
    // revalidatePath clears the full-route cache but NOT unstable_cache Data
    // Cache entries; those need their tag. The wrapped queries serve the
    // searchParams-driven pages, which have no route cache to clear.
    // "max" is the cache-life profile Next 16 requires as the second argument:
    // it covers the longest-lived entries, so the purge can never be narrower
    // than what we actually wrote.
    revalidateTag(LEAGUE_DATA_TAG, "max");
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(`[${source}] revalidation failed (data still synced):`, message);
  }
}
