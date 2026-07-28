import { getNflState } from "@/lib/queries/nfl-state";
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
import { getSessionMember } from "@/lib/auth";
import type { NavCrestMember } from "@/components/nav/nav-crest";

/**
 * Resolves the seasonal / live LivePill state server-side (no client polling in
 * the nav). Mirrors app/page.tsx's hub-state routing (lib/hub/season-state.ts)
 * so the topbar pill never disagrees with which hub layout is showing,
 * including the pre-Week-1 "everyone's 0-0" -> preseason override. Any failure
 * degrades to a benign "offseason" pill so the chrome always renders (E2E
 * asserts nav renders on an empty DB).
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

    const seasonType = resolveHubSeasonType({
      nflSeasonType,
      dbSeasonStatus: dbStatus,
      hasLiveMatchups,
      nothingPlayedYet,
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

/**
 * Resolves the current session to the minimal crest shape, degrading to null on
 * any failure (e.g. the members table not existing yet before migration 0008)
 * so the nav always renders.
 */
async function resolveNavMember(): Promise<NavCrestMember | null> {
  try {
    const member = await getSessionMember();
    if (!member) return null;
    return {
      franchiseSlug: member.franchiseSlug,
      franchiseName: member.franchiseName,
      franchiseAvatarUrl: member.franchiseAvatarUrl,
      displayName: member.displayName,
    };
  } catch {
    return null;
  }
}

export async function SiteNav() {
  const [livePill, member] = await Promise.all([
    resolveLivePill(),
    resolveNavMember(),
  ]);

  return (
    <>
      {/* display:contents — landmark without a box, so the sticky bars resolve
          their sticky context against <body>, not a height-limited wrapper. */}
      <header className="contents">
        <Topbar livePill={livePill} member={member} />
        {/* The mobile header stays pinned; only the bottom dock hides on
            scroll (per league feedback, the header is wanted at all times). */}
        <div className="sticky top-0 z-40 backdrop-blur-md lg:hidden">
          <MobileHeader livePill={livePill} member={member} />
        </div>
      </header>
      <ScrollChrome className="fixed inset-x-0 bottom-0 z-40 lg:hidden chrome-bottom">
        <MobileDock />
      </ScrollChrome>
    </>
  );
}
