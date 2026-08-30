import { getNflState, isWeekOneLeadWindowActive } from "@/lib/queries/nfl-state";
import { getLatestSeason, getCurrentWeekMatchups } from "@/lib/queries/matchups";
import { getSeasonStandings } from "@/lib/queries/seasons";
import { computeIsBetweenWeeks, getNextKickoff } from "@/lib/queries/kickoff";
import { resolveHubSeasonType, isPreWeekOne } from "@/lib/hub/season-state";
import {
  formatPreseasonKickoffLabel,
  formatBetweenWeeksKickoffLabel,
} from "@/lib/hub/live-pill-label";
import type { LivePillProps } from "@/components/live-pill";
import { Topbar } from "@/components/nav/topbar";
import { MobileHeader } from "@/components/nav/mobile-header";
import { MobileDock } from "@/components/nav/mobile-dock";
import { ScrollChrome } from "@/components/nav/scroll-chrome";

/**
 * Resolves the seasonal / live LivePill state server-side (no client polling in
 * the nav). Mirrors app/page.tsx's hub-state routing (lib/hub/season-state.ts)
 * so the topbar pill never disagrees with which hub layout is showing,
 * including the pre-Week-1 "everyone's 0-0" -> preseason override. Any failure
 * degrades to a benign "offseason" pill so the chrome always renders (E2E
 * asserts nav renders on an empty DB).
 *
 * The swallow below is deliberate and stays swallowing even though #252 turned
 * getCurrentWeekMatchups into a thrower. SiteNav is rendered by the root
 * layout, so a throw here would take down every route including the error
 * boundary's own chrome. It masks nothing: getCurrentWeekMatchups (and
 * getNflState, and getLatestSeason) are React cache()d, so the page's own call
 * replays the identical rejection and still reaches the error boundary.
 */
async function resolveLivePill(): Promise<LivePillProps> {
  try {
    const [nflState, latestSeason, current] = await Promise.all([
      getNflState(),
      getLatestSeason(),
      getCurrentWeekMatchups(),
    ]);

    const nflSeasonType = nflState?.seasonType ?? null;
    const dbStatus = latestSeason?.status ?? null;

    const matchupStatuses = current?.matchups.map((m) => m.status) ?? [];
    const hasLiveMatchups = matchupStatuses.some((s) => s === "in_progress");
    const liveCount = matchupStatuses.filter((s) => s === "in_progress").length;
    const week = current?.week ?? nflState?.week;

    // Standings power only the pre-Week-1 "nothing played yet" override. Read
    // whenever a season exists (matching app/page.tsx), since the override also
    // fires via the dbSeasonStatus fallback path (NFL state unavailable, DB says
    // in_season). getSeasonStandings is React-cache()'d, so this shares the
    // page's read; it stays a dependent await because it needs latestSeason.id.
    const standings = latestSeason
      ? await getSeasonStandings(latestSeason.id).catch(() => [])
      : [];
    const nothingPlayedYet = isPreWeekOne(standings);

    // Same kickoff-week window as app/page.tsx (shared React-cache'd read), so
    // the pill flips to the WK 1 state on the same request the hub does.
    const windowSeasonYear =
      latestSeason?.seasonYear ?? (nflState ? Number(nflState.season) : null);
    const weekOneLeadWindow =
      windowSeasonYear != null && (await isWeekOneLeadWindowActive(windowSeasonYear));

    const seasonType = resolveHubSeasonType({
      nflSeasonType,
      dbSeasonStatus: dbStatus,
      hasLiveMatchups,
      nothingPlayedYet,
      weekOneLeadWindow,
    });

    // Live state only during the games window of the regular season or playoffs;
    // never let a stray in-progress row flip a pre/off pill to "live".
    if (liveCount > 0 && (seasonType === "regular" || seasonType === "post")) {
      return { state: "live", liveCount, week };
    }

    if (seasonType === "pre") {
      const seasonYear = latestSeason?.seasonYear ?? new Date().getFullYear();
      const kickoffTarget = latestSeason ? await getNextKickoff(seasonYear, 1) : null;
      if (kickoffTarget) {
        return {
          state: "preseason",
          label: formatPreseasonKickoffLabel(kickoffTarget, new Date()),
          staticDot: true,
        };
      }
      return { state: "preseason" };
    }

    if (seasonType === "regular") {
      const isBetweenWeeks = computeIsBetweenWeeks({
        seasonType,
        matchupStatuses,
      });
      const seasonYear = current?.seasonYear ?? latestSeason?.seasonYear;
      if (isBetweenWeeks && week && seasonYear) {
        const kickoffTarget = await getNextKickoff(seasonYear, week);
        if (kickoffTarget) {
          return {
            state: "week",
            label: formatBetweenWeeksKickoffLabel(week, kickoffTarget),
            staticDot: true,
          };
        }
      }
      return { state: "week", label: `Week ${week ?? 1}` };
    }

    if (seasonType === "post") {
      return { state: "playoffs" };
    }

    return { state: "offseason" };
  } catch {
    return { state: "offseason" };
  }
}

export async function SiteNav() {
  // NOTE: everything resolved here must stay free of cookies()/headers().
  // A dynamic API in the root layout opts every route on the site out of static
  // rendering, which silently defeats ISR sitewide. The session-dependent crest
  // is a client island (components/nav/nav-crest-island.tsx) for that reason.
  const livePill = await resolveLivePill();

  return (
    <>
      {/* display:contents — landmark without a box, so the sticky bars resolve
          their sticky context against <body>, not a height-limited wrapper. */}
      <header className="contents">
        <Topbar livePill={livePill} />
        {/* The mobile header stays pinned; only the bottom dock hides on
            scroll (per league feedback, the header is wanted at all times). */}
        <div className="sticky top-0 z-40 backdrop-blur-md lg:hidden">
          <MobileHeader livePill={livePill} />
        </div>
      </header>
      <ScrollChrome className="fixed inset-x-0 bottom-0 z-40 lg:hidden chrome-bottom">
        <MobileDock />
      </ScrollChrome>
    </>
  );
}
