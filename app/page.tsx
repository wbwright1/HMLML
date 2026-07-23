import { getCurrentWeekMatchups, getLatestSeason } from "@/lib/queries/matchups";
import { getSeasonStandings } from "@/lib/queries/seasons";
import { getNflState } from "@/lib/queries/nfl-state";
import { computeIsBetweenWeeks, getNextKickoff } from "@/lib/queries/kickoff";
import { resolveHubSeasonType, isPreWeekOne } from "@/lib/hub/season-state";
import type { NflSeasonType } from "@/lib/queries/nfl-state";
import { PreseasonHub } from "@/components/hub/preseason-hub";
import { RegularSeasonHub } from "@/components/hub/regular-season-hub";
import { PlayoffsHub } from "@/components/hub/playoffs-hub";
import { OffseasonHub } from "@/components/hub/offseason-hub";

export const dynamic = "force-dynamic";

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
  } catch {
    // DB or API may not be connected in dev
  }

  const hasLiveMatchups = matchupData?.matchups.some((m) => m.status === "in_progress") ?? false;

  // Pre-Week-1 (issue #17): a live season where every team is 0-0 with nothing
  // in progress renders the preseason hub, not an empty regular-season hub.
  const nothingPlayedYet = isPreWeekOne(standings);

  const seasonType = resolveHubSeasonType({
    nflSeasonType: nflState?.seasonType ?? null,
    dbSeasonStatus: latestSeason?.status ?? null,
    hasLiveMatchups,
    nothingPlayedYet,
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
