import { getNflState } from "@/lib/queries/nfl-state";
import { getLatestSeason, getCurrentWeekMatchups } from "@/lib/queries/matchups";
import type { LivePillProps } from "@/components/live-pill";
import { Topbar } from "@/components/nav/topbar";
import { MobileHeader } from "@/components/nav/mobile-header";
import { MobileDock } from "@/components/nav/mobile-dock";

/**
 * Resolves the seasonal / live LivePill state server-side (no client polling in
 * the nav). Reuses the season detection from the retired SeasonalPillBadge and
 * layers a live-game count on top. Any failure degrades to a benign "offseason"
 * pill so the chrome always renders (E2E asserts nav renders on an empty DB).
 */
async function resolveLivePill(): Promise<LivePillProps> {
  try {
    const [nflState, latestSeason] = await Promise.all([
      getNflState(),
      getLatestSeason(),
    ]);

    const seasonType = nflState?.seasonType ?? null;
    const dbStatus = latestSeason?.status ?? null;
    const inSeason = seasonType === "regular" || seasonType === "post";

    // Count live games only during the regular/post season game windows.
    let liveCount = 0;
    let week = nflState?.week ?? undefined;
    if (inSeason) {
      const current = await getCurrentWeekMatchups();
      if (current) {
        week = current.week;
        liveCount = current.matchups.filter(
          (m) => m.status === "in_progress"
        ).length;
      }
    }

    if (liveCount > 0) {
      return { state: "live", liveCount, week };
    }

    if (seasonType === "regular") {
      return { state: "week", label: `Week ${week ?? 1}` };
    }
    if (seasonType === "post") {
      return { state: "playoffs" };
    }
    if (seasonType === "pre") {
      return { state: "preseason" };
    }
    if (dbStatus === "in_season") {
      return { state: "week", label: "In Season" };
    }
    if (dbStatus === "pre_draft" || dbStatus === "complete") {
      return { state: "preseason" };
    }
    return { state: "offseason" };
  } catch {
    return { state: "offseason" };
  }
}

export async function SiteNav() {
  const livePill = await resolveLivePill();

  return (
    <>
      {/* display:contents — landmark without a box, so the sticky bars resolve
          their sticky context against <body>, not a height-limited wrapper. */}
      <header className="contents">
        <Topbar livePill={livePill} />
        <MobileHeader livePill={livePill} />
      </header>
      <MobileDock />
    </>
  );
}
