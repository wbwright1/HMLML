import { getCurrentWeekMatchups, getLatestSeason } from "@/lib/queries/matchups";
import { rethrowUnlessTolerable } from "@/lib/db-guard";
import { getSeasonStandings } from "@/lib/queries/seasons";
import { getNflState, isWeekOneLeadWindowActive } from "@/lib/queries/nfl-state";
import { computeIsBetweenWeeks, getNextKickoff } from "@/lib/queries/kickoff";
import { resolveHubSeasonType, isPreWeekOne } from "@/lib/hub/season-state";
import type { NflSeasonType } from "@/lib/queries/nfl-state";
import { PreseasonHub } from "@/components/hub/preseason-hub";
import { RegularSeasonHub } from "@/components/hub/regular-season-hub";
import { PlayoffsHub } from "@/components/hub/playoffs-hub";
import { OffseasonHub } from "@/components/hub/offseason-hub";

// ISR: rendered once, then served from cache until a successful sync calls
// revalidatePath("/", "layout"). Time window is only a backstop (lib/cache.ts).
export const revalidate = 3600;

export default async function HomePage() {
  // Fetch NFL state and core data in parallel
  let nflState: { seasonType: NflSeasonType; week: number; season: string } | null = null;
  let matchupData: Awaited<ReturnType<typeof getCurrentWeekMatchups>> = null;
  let latestSeason: Awaited<ReturnType<typeof getLatestSeason>> = null;
  let standings: Awaited<ReturnType<typeof getSeasonStandings>> = [];

  try {
    [nflState, matchupData, latestSeason] = await Promise.all([
      getNflState(),
      getCurrentWeekMatchups(),
      getLatestSeason(),
    ]);

    if (latestSeason) {
      standings = await getSeasonStandings(latestSeason.id);
    }
  } catch (e) {
    rethrowUnlessTolerable(e);
    // DB or API may not be connected in dev
  }

  const hasLiveMatchups = matchupData?.matchups.some((m) => m.status === "in_progress") ?? false;

  // Pre-Week-1 (issue #17): a live season where every team is 0-0 with nothing
  // in progress renders the preseason hub, not an empty regular-season hub.
  const nothingPlayedYet = isPreWeekOne(standings);

  // Kickoff-week window: from the Sunday before the week-1 kickoff, the 0-0
  // demotion above stops firing and the regular-season hub takes over.
  //
  // This call is deliberately OUTSIDE the page's data-fetch try/catch. On a DB
  // failure it throws (lib/queries/nfl-state.ts), Next serves the error
  // boundary, and ISR keeps the last good entry. Wrapping it would let a
  // transient failure ISR-cache the preseason hub during kickoff week, which is
  // the exact bug lib/db-guard.ts exists to prevent. Do not "fix" this.
  const windowSeasonYear =
    latestSeason?.seasonYear ?? (nflState ? Number(nflState.season) : null);
  const weekOneLeadWindow =
    windowSeasonYear != null && (await isWeekOneLeadWindowActive(windowSeasonYear));

  const seasonType = resolveHubSeasonType({
    nflSeasonType: nflState?.seasonType ?? null,
    dbSeasonStatus: latestSeason?.status ?? null,
    hasLiveMatchups,
    nothingPlayedYet,
    weekOneLeadWindow,
  });

  const isGameWindow = seasonType === "regular" && hasLiveMatchups;

  // Route to the appropriate hub layout
  if (seasonType === "pre") {
    return <PreseasonHub latestSeason={latestSeason} />;
  }

  if (seasonType === "regular") {
    // Between-weeks sub-state (the Tue/Wed lull): the slate is set but no game
    // has kicked off. When true, we surface the next-kickoff countdown target.
    const isBetweenWeeks = computeIsBetweenWeeks({
      seasonType,
      matchupStatuses: matchupData?.matchups.map((m) => m.status) ?? [],
    });

    let nextKickoff: Date | null = null;
    if (isBetweenWeeks) {
      const seasonYear = matchupData?.seasonYear ?? latestSeason?.seasonYear;
      const week = matchupData?.week ?? nflState?.week;
      if (seasonYear && week) {
        nextKickoff = await getNextKickoff(seasonYear, week);
      }
    }

    return (
      <RegularSeasonHub
        matchupData={matchupData}
        latestSeason={latestSeason}
        standings={standings}
        isGameWindow={isGameWindow}
        nflWeek={Math.max(1, nflState?.week ?? matchupData?.week ?? 1)}
        isBetweenWeeks={isBetweenWeeks}
        nextKickoff={nextKickoff}
      />
    );
  }

  if (seasonType === "post") {
    return (
      <PlayoffsHub
        matchupData={matchupData}
        latestSeason={latestSeason}
        nflWeek={Math.max(1, nflState?.week ?? matchupData?.week ?? 1)}
        hasLiveGames={hasLiveMatchups}
      />
    );
  }

  // Offseason (default): only if no season data exists
  return (
    <OffseasonHub
      latestSeason={latestSeason}
      standings={standings}
    />
  );
}
