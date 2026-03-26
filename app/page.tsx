import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { MatchupRow } from "@/components/matchup-row";
import { StatHero } from "@/components/stat-hero";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { EmptyState } from "@/components/empty-state";
import { ChampionBanner } from "@/components/champion-banner";
import { WeekBanner } from "@/components/week-banner";
import { TeamAwardCard } from "@/components/team-award-card";
import { PlayerAwardCard } from "@/components/player-award-card";
import { StingCard } from "@/components/sting-card";
import { DraftCountdown } from "@/components/draft-countdown";
import { DraftOrderCard } from "@/components/draft-order-card";
import { LiveMatchupCard } from "@/components/live-matchup-card";
import { WeeklySuperlativeCard } from "@/components/weekly-superlative-card";
import { StandingsSnapshotCard } from "@/components/standings-snapshot-card";
import { OffseasonRecapCard } from "@/components/offseason-recap-card";
import { TransactionActivityCard } from "@/components/transaction-activity-card";
import { ChampionshipStars } from "@/components/championship-stars";
import { ScorePoller } from "@/app/matchups/score-poller";
import { getCurrentWeekMatchups, getLatestSeason } from "@/lib/queries/matchups";
import { getSeasonStandings, getLastCompletedSeason } from "@/lib/queries/seasons";
import {
  getHomepageSuperlatives,
  getLastWeekResults,
  getLeagueAtAGlance,
} from "@/lib/queries/homepage";
import { getNflState } from "@/lib/queries/nfl-state";
import { getPreseasonAwards } from "@/lib/queries/preseason";
import { getWeeklySuperlatives } from "@/lib/queries/superlatives";
import { getOffseasonRecap, getRecentTransactions } from "@/lib/queries/offseason";
import type { NflSeasonType } from "@/lib/queries/nfl-state";

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

  // Determine hub state
  // Sleeper's season_type: "pre" (NFL preseason Aug), "regular", "post" (playoffs), "off" (NFL offseason)
  // Fantasy league mapping: NFL "off" maps to fantasy "preseason" when the latest season is
  // complete or pre_draft (new league year, pre-draft). Only show offseason if no season data exists.
  const nflSeasonType = nflState?.seasonType ?? null;
  const dbSeasonStatus = latestSeason?.status ?? null;

  let seasonType: NflSeasonType;
  if (nflSeasonType === "regular") {
    seasonType = "regular";
  } else if (nflSeasonType === "post") {
    seasonType = "post";
  } else if (nflSeasonType === "pre") {
    // NFL preseason (August): also fantasy preseason
    seasonType = "pre";
  } else if (dbSeasonStatus === "in_season") {
    // DB says in-season even though NFL API says off or is unavailable
    seasonType = "regular";
  } else if (dbSeasonStatus === "pre_draft" || dbSeasonStatus === "complete") {
    // NFL offseason + DB shows completed or pre-draft season = fantasy preseason
    seasonType = "pre";
  } else {
    // No season data or unknown state: offseason fallback
    seasonType = "off";
  }

  const hasLiveMatchups = matchupData?.matchups.some((m) => m.status === "in_progress") ?? false;
  const isGameWindow = seasonType === "regular" && hasLiveMatchups;

  // Route to the appropriate hub layout
  if (seasonType === "pre") {
    return (
      <PreseasonHub
        latestSeason={latestSeason}
        standings={standings}
      />
    );
  }

  if (seasonType === "regular") {
    return (
      <RegularSeasonHub
        matchupData={matchupData}
        latestSeason={latestSeason}
        standings={standings}
        isGameWindow={isGameWindow}
        nflWeek={nflState?.week ?? matchupData?.week ?? 1}
      />
    );
  }

  if (seasonType === "post") {
    return (
      <PlayoffsHub
        matchupData={matchupData}
        latestSeason={latestSeason}
        nflWeek={nflState?.week ?? matchupData?.week ?? 1}
        hasLiveGames={hasLiveMatchups}
      />
    );
  }

  // Offseason (default) — only if no season data exists
  return (
    <OffseasonHub
      latestSeason={latestSeason}
      standings={standings}
    />
  );
}

// =============================================================================
// PRESEASON HUB
// =============================================================================

async function PreseasonHub({
  latestSeason,
  standings,
}: {
  latestSeason: Awaited<ReturnType<typeof getLatestSeason>>;
  standings: Awaited<ReturnType<typeof getSeasonStandings>>;
}) {
  // Find the most recent completed season for awards and champion data.
  // latestSeason might be a new empty season (e.g., 2026 pre_draft with no games),
  // so we explicitly query for the last completed season.
  let awards: Awaited<ReturnType<typeof getPreseasonAwards>> = null;
  let championData: {
    seasonYear: number;
    franchiseName: string;
    franchiseSlug: string;
    record?: string;
    defeatedOpponent?: string;
  } | null = null;

  try {
    // Use last completed season for awards (not the potentially empty latest season)
    const completedSeason = await getLastCompletedSeason();
    const awardSeasonId = completedSeason?.id ?? latestSeason?.id;
    const awardSeasonYear = completedSeason?.seasonYear ?? latestSeason?.seasonYear;

    if (awardSeasonId) {
      // Run awards and standings in parallel since both depend only on completedSeason
      const needsStandings = completedSeason && completedSeason.id !== latestSeason?.id;
      const [awardsResult, completedStandingsResult] = await Promise.all([
        getPreseasonAwards(awardSeasonId),
        needsStandings ? getSeasonStandings(completedSeason.id) : Promise.resolve(null),
      ]);
      awards = awardsResult;
      const completedStandings = completedStandingsResult ?? standings;

      const champion = completedStandings.find((s) => s.playoffResult === "champion");
      const runnerUp = completedStandings.find((s) => s.playoffResult === "runner_up");
      if (champion && awardSeasonYear) {
        const record = `${champion.wins ?? 0}-${champion.losses ?? 0}`;
        championData = {
          seasonYear: awardSeasonYear,
          franchiseName: champion.franchiseName,
          franchiseSlug: champion.franchiseSlug,
          record,
          defeatedOpponent: runnerUp?.franchiseName,
        };
      }
    }
  } catch {
    // Awards data may not be available
  }

  return (
    <>
      {/* Champion Banner */}
      {championData && (
        <ChampionBanner
          seasonYear={championData.seasonYear}
          franchiseName={championData.franchiseName}
          franchiseSlug={championData.franchiseSlug}
          record={championData.record}
          defeatedOpponent={championData.defeatedOpponent}
        />
      )}

      {/* Draft Countdown */}
      {process.env.NEXT_PUBLIC_DRAFT_DATE && (
        <ScrollReveal>
          <PageSection label="Upcoming" title="Draft Day">
            <DraftCountdown draftDate={process.env.NEXT_PUBLIC_DRAFT_DATE} />
          </PageSection>
        </ScrollReveal>
      )}

      {/* Team Awards */}
      {awards && awards.teamAwards.length > 0 && (
        <ScrollReveal>
          <PageSection label="Last Season" title="Team Awards">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {awards.teamAwards.map((award) => (
                <TeamAwardCard key={award.label} {...award} />
              ))}
            </div>
          </PageSection>
        </ScrollReveal>
      )}

      {/* Player Awards */}
      {awards && awards.playerAwards.length > 0 && (
        <ScrollReveal>
          <PageSection label="Last Season" title="Player Awards">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {awards.playerAwards.map((award) => (
                <PlayerAwardCard key={award.category} {...award} />
              ))}
            </div>
          </PageSection>
        </ScrollReveal>
      )}

      {/* Wall of Shame (Sting Cards) */}
      {awards && awards.stingStats.length > 0 && (
        <ScrollReveal>
          <PageSection label="Wall of Shame" title="The Sting Report">
            <div className="space-y-3">
              {awards.stingStats.map((sting) => (
                <StingCard key={sting.label} {...sting} />
              ))}
            </div>
          </PageSection>
        </ScrollReveal>
      )}

      {/* Draft Order */}
      {awards && awards.draftOrder.length > 0 && (
        <ScrollReveal>
          <PageSection label="Upcoming" title="Draft Order">
            <DraftOrderCard picks={awards.draftOrder} seasonYear={latestSeason?.seasonYear ?? new Date().getFullYear()} />
          </PageSection>
        </ScrollReveal>
      )}

      {/* Fallback */}
      {!awards && !championData && (
        <EmptyState
          icon="calendar"
          title="Preseason Mode"
          description="The league is gearing up for a new season. Awards and draft info will appear once last season's data is synced."
        />
      )}
    </>
  );
}

// =============================================================================
// REGULAR SEASON HUB
// =============================================================================

async function RegularSeasonHub({
  matchupData,
  latestSeason,
  standings,
  isGameWindow,
  nflWeek,
}: {
  matchupData: Awaited<ReturnType<typeof getCurrentWeekMatchups>>;
  latestSeason: Awaited<ReturnType<typeof getLatestSeason>>;
  standings: Awaited<ReturnType<typeof getSeasonStandings>>;
  isGameWindow: boolean;
  nflWeek: number;
}) {
  const week = matchupData?.week ?? nflWeek;
  const seasonYear = matchupData?.seasonYear ?? latestSeason?.seasonYear ?? new Date().getFullYear();

  // Fetch superlatives and last week results
  let superlatives: Awaited<ReturnType<typeof getHomepageSuperlatives>> | null = null;
  let weeklySuperlatives: Awaited<ReturnType<typeof getWeeklySuperlatives>> | null = null;
  let lastWeekResults: Awaited<ReturnType<typeof getLastWeekResults>> | null = null;

  if (latestSeason) {
    try {
      [superlatives, lastWeekResults] = await Promise.all([
        getHomepageSuperlatives(latestSeason.id),
        week > 1 ? getLastWeekResults(latestSeason.id, week) : null,
      ]);

      // Get weekly superlatives for the latest completed week
      const completedWeek = week > 1 ? week - 1 : week;
      weeklySuperlatives = await getWeeklySuperlatives(latestSeason.id, completedWeek);
    } catch {
      // Data may not be available
    }
  }

  // Determine banner state
  const allComplete = matchupData?.matchups.every((m) => m.status === "complete") ?? false;
  const gamesInProgress = matchupData?.matchups.filter((m) => m.status === "in_progress").length ?? 0;
  const bannerState = isGameWindow ? "game-window" : allComplete ? "complete" : "pre-kickoff";

  return (
    <>
      {/* Week Banner */}
      <WeekBanner
        week={week}
        seasonYear={seasonYear}
        state={bannerState}
        gamesInProgress={gamesInProgress}
      />

      {/* Game Window: Show all matchups */}
      {isGameWindow && matchupData && matchupData.matchups.length > 0 && (
        <ScrollReveal>
          <PageSection
            label={`${seasonYear} Season`}
            title={`Week ${week} Matchups`}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {matchupData.matchups.map((matchup) => (
                <LiveMatchupCard
                  key={matchup.matchupId}
                  matchupId={matchup.matchupId}
                  homeTeam={{
                    name: matchup.homeTeam.franchiseName,
                    slug: matchup.homeTeam.franchiseSlug,
                    score: matchup.homeTeam.points,
                    brandingColor: matchup.homeTeam.franchiseBrandingColor,
                  }}
                  awayTeam={{
                    name: matchup.awayTeam.franchiseName,
                    slug: matchup.awayTeam.franchiseSlug,
                    score: matchup.awayTeam.points,
                    brandingColor: matchup.awayTeam.franchiseBrandingColor,
                  }}
                  status={
                    matchup.status === "in_progress"
                      ? "live"
                      : matchup.status === "complete"
                        ? "final"
                        : "upcoming"
                  }
                  week={week}
                  seasonYear={seasonYear}
                />
              ))}
            </div>
            <ScorePoller initialIsGameWindow={isGameWindow} />
          </PageSection>
        </ScrollReveal>
      )}

      {/* Outside Game Window: Standings + Superlatives */}
      {!isGameWindow && (
        <>
          {/* Matchup Results (if complete) */}
          {matchupData && matchupData.matchups.length > 0 && (
            <ScrollReveal>
              <PageSection
                label={`${seasonYear} Season`}
                title={`Week ${week} Matchups`}
              >
                <div className="space-y-3">
                  {matchupData.matchups.map((matchup) => {
                    const variant =
                      matchup.status === "in_progress"
                        ? "live"
                        : matchup.status === "complete"
                          ? "final"
                          : "preview";
                    return (
                      <MatchupRow
                        key={matchup.matchupId}
                        matchup={{
                          homeTeam: matchup.homeTeam,
                          awayTeam: matchup.awayTeam,
                          homeScore: matchup.homeTeam.points,
                          awayScore: matchup.awayTeam.points,
                          status: matchup.status,
                          matchupId: matchup.matchupId,
                        }}
                        variant={variant}
                      />
                    );
                  })}
                </div>
              </PageSection>
            </ScrollReveal>
          )}

          {/* Standings Snapshot */}
          {standings.length > 0 && (
            <ScrollReveal>
              <PageSection label="Current" title="Standings">
                <StandingsSnapshotCard
                  standings={standings.map((s, i) => ({
                    rank: s.standingsFinish ?? i + 1,
                    franchiseName: s.franchiseName,
                    franchiseSlug: s.franchiseSlug,
                    record: `${s.wins ?? 0}-${s.losses ?? 0}`,
                    brandingColor: s.franchiseBrandingColor,
                  }))}
                  week={week}
                  seasonYear={seasonYear}
                />
              </PageSection>
            </ScrollReveal>
          )}

          {/* Weekly Superlatives */}
          {weeklySuperlatives && (
            <ScrollReveal>
              <PageSection label="This Week's Damage" title="Superlatives">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {weeklySuperlatives.closestWin && (
                    <WeeklySuperlativeCard
                      type="closest-win"
                      label="Closest Win"
                      stat={`${weeklySuperlatives.closestWin.margin.toFixed(1)} pts`}
                      context="Nail-biter of the week"
                      teams={weeklySuperlatives.closestWin}
                      week={week > 1 ? week - 1 : week}
                      seasonYear={seasonYear}
                    />
                  )}
                  {weeklySuperlatives.biggestBlowout && (
                    <WeeklySuperlativeCard
                      type="biggest-blowout"
                      label="Biggest Blowout"
                      stat={`${weeklySuperlatives.biggestBlowout.margin.toFixed(1)} pts`}
                      context="Mercy rule material"
                      teams={weeklySuperlatives.biggestBlowout}
                      week={week > 1 ? week - 1 : week}
                      seasonYear={seasonYear}
                    />
                  )}
                  {weeklySuperlatives.highestScorer && (
                    <WeeklySuperlativeCard
                      type="highest-scorer"
                      label="Highest Scorer"
                      stat={`${weeklySuperlatives.highestScorer.points.toFixed(1)} pts`}
                      context={weeklySuperlatives.highestScorer.franchiseName}
                      week={week > 1 ? week - 1 : week}
                      seasonYear={seasonYear}
                    />
                  )}
                  {weeklySuperlatives.lowestScorer && (
                    <WeeklySuperlativeCard
                      type="lowest-scorer"
                      label="Lowest Scorer"
                      stat={`${weeklySuperlatives.lowestScorer.points.toFixed(1)} pts`}
                      context={weeklySuperlatives.lowestScorer.franchiseName}
                      week={week > 1 ? week - 1 : week}
                      seasonYear={seasonYear}
                    />
                  )}
                </div>
              </PageSection>
            </ScrollReveal>
          )}

          {/* Season Superlatives */}
          {superlatives && (
            <ScrollReveal>
              <PageSection label="Season Stats" title="Superlatives">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                  {superlatives.highestScore && (
                    <StatHero
                      value={superlatives.highestScore.points?.toFixed(1) ?? "0"}
                      label={superlatives.highestScore.franchiseName ?? "Unknown"}
                      badge="High Score"
                      context={`Week ${superlatives.highestScore.week}`}
                      variant="md"
                    />
                  )}
                  {superlatives.longestStreak && superlatives.longestStreak.streak > 1 && (
                    <StatHero
                      value={`${superlatives.longestStreak.streak}W`}
                      label={superlatives.longestStreak.franchiseName}
                      badge="Win Streak"
                      variant="md"
                    />
                  )}
                  {superlatives.closestMatchup && (
                    <StatHero
                      value={superlatives.closestMatchup.margin.toFixed(1)}
                      label={`${superlatives.closestMatchup.teamA} vs ${superlatives.closestMatchup.teamB}`}
                      badge="Closest Matchup"
                      variant="md"
                    />
                  )}
                  {superlatives.mostAllTimeWins && (
                    <StatHero
                      value={superlatives.mostAllTimeWins.totalWins}
                      label={superlatives.mostAllTimeWins.franchiseName}
                      badge="Most All-Time Wins"
                      variant="md"
                    />
                  )}
                </div>
              </PageSection>
            </ScrollReveal>
          )}

          {/* Last Week Results */}
          {lastWeekResults && lastWeekResults.results.length > 0 && (
            <ScrollReveal>
              <PageSection label="Last Week" title={`Week ${lastWeekResults.week} Results`}>
                <div className="space-y-2">
                  {lastWeekResults.results.map((result) => (
                    <div
                      key={`${result.winner}-${result.loser}`}
                      className="flex items-center justify-between rounded-lg border border-border/50 bg-surface px-4 py-3 text-sm"
                    >
                      <span>
                        <span className="font-semibold">{result.winner}</span>
                        <span className="text-text-tertiary"> def. </span>
                        <span className="text-text-tertiary">{result.loser}</span>
                      </span>
                      <span className="tabular-nums text-text-tertiary whitespace-nowrap ml-4">
                        {result.winnerScore.toFixed(1)} - {result.loserScore.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </PageSection>
            </ScrollReveal>
          )}
        </>
      )}

      {/* Fallback */}
      {!matchupData && standings.length === 0 && (
        <EmptyState
          icon="chart"
          title="Syncing League Data"
          description="We're pulling data from Sleeper. Standings, matchups, and history will appear here once the first sync completes."
        />
      )}
    </>
  );
}

// =============================================================================
// PLAYOFFS HUB
// =============================================================================

async function PlayoffsHub({
  matchupData,
  latestSeason,
  nflWeek,
  hasLiveGames,
}: {
  matchupData: Awaited<ReturnType<typeof getCurrentWeekMatchups>>;
  latestSeason: Awaited<ReturnType<typeof getLatestSeason>>;
  nflWeek: number;
  hasLiveGames: boolean;
}) {
  const week = matchupData?.week ?? nflWeek;
  const seasonYear = matchupData?.seasonYear ?? latestSeason?.seasonYear ?? new Date().getFullYear();
  const gamesInProgress = matchupData?.matchups.filter((m) => m.status === "in_progress").length ?? 0;

  // Determine playoff round name
  const playoffWeekStart = latestSeason?.playoffWeekStart ?? 15;
  const roundOffset = week - playoffWeekStart;
  const roundNames = ["Wild Card Round", "Semifinal", "Championship"];
  const playoffRound = roundNames[Math.min(roundOffset, roundNames.length - 1)] ?? `Playoff Week ${week}`;

  return (
    <>
      {/* Week Banner (Playoff Variant) */}
      <WeekBanner
        week={week}
        seasonYear={seasonYear}
        state="playoff"
        gamesInProgress={gamesInProgress}
        playoffRound={playoffRound}
      />

      {/* Playoff Matchups */}
      {matchupData && matchupData.matchups.length > 0 && (
        <ScrollReveal>
          <PageSection
            label={`${seasonYear} Playoffs`}
            title={playoffRound}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {matchupData.matchups.map((matchup) => (
                <LiveMatchupCard
                  key={matchup.matchupId}
                  matchupId={matchup.matchupId}
                  homeTeam={{
                    name: matchup.homeTeam.franchiseName,
                    slug: matchup.homeTeam.franchiseSlug,
                    score: matchup.homeTeam.points,
                    brandingColor: matchup.homeTeam.franchiseBrandingColor,
                  }}
                  awayTeam={{
                    name: matchup.awayTeam.franchiseName,
                    slug: matchup.awayTeam.franchiseSlug,
                    score: matchup.awayTeam.points,
                    brandingColor: matchup.awayTeam.franchiseBrandingColor,
                  }}
                  status={
                    matchup.status === "in_progress"
                      ? "live"
                      : matchup.status === "complete"
                        ? "final"
                        : "upcoming"
                  }
                  week={week}
                  seasonYear={seasonYear}
                />
              ))}
            </div>

            {hasLiveGames && (
              <ScorePoller initialIsGameWindow={hasLiveGames} />
            )}
          </PageSection>
        </ScrollReveal>
      )}

      {/* Link to full bracket */}
      <ScrollReveal>
        <div className="text-center py-8">
          <Link
            href={`/playoffs/${seasonYear}`}
            className="inline-flex items-center gap-2 text-sm text-accent-green hover:underline font-medium"
          >
            View Full Playoff Bracket &rarr;
          </Link>
        </div>
      </ScrollReveal>

      {/* Fallback */}
      {(!matchupData || matchupData.matchups.length === 0) && (
        <EmptyState
          icon="trophy"
          title="Playoffs Underway"
          description="Playoff matchups will appear here once they begin."
        />
      )}
    </>
  );
}

// =============================================================================
// OFFSEASON HUB
// =============================================================================

async function OffseasonHub({
  latestSeason,
  standings,
}: {
  latestSeason: Awaited<ReturnType<typeof getLatestSeason>>;
  standings: Awaited<ReturnType<typeof getSeasonStandings>>;
}) {
  let leagueGlance: Awaited<ReturnType<typeof getLeagueAtAGlance>> | null = null;
  let offseasonRecap: Awaited<ReturnType<typeof getOffseasonRecap>> | null = null;
  let recentTransactions: Awaited<ReturnType<typeof getRecentTransactions>> = [];
  let completedSeason: Awaited<ReturnType<typeof getLastCompletedSeason>> | null = null;
  let completedStandings: Awaited<ReturnType<typeof getSeasonStandings>> = [];

  try {
    [leagueGlance, completedSeason] = await Promise.all([
      getLeagueAtAGlance(),
      getLastCompletedSeason(),
    ]);

    // Use completed season for recap; fall back to latest season for transactions
    const recapSeasonId = completedSeason?.id ?? latestSeason?.id;
    const txnSeasonId = latestSeason?.id ?? completedSeason?.id;

    if (recapSeasonId || txnSeasonId) {
      [offseasonRecap, recentTransactions] = await Promise.all([
        recapSeasonId ? getOffseasonRecap(recapSeasonId) : null,
        txnSeasonId ? getRecentTransactions(txnSeasonId) : [],
      ]);
    }

    // Get standings for the completed season to find champion
    if (completedSeason) {
      completedStandings = await getSeasonStandings(completedSeason.id);
    }
  } catch {
    // Data may not be available
  }

  // Champion banner data from the completed season
  const championStandings = completedStandings.length > 0 ? completedStandings : standings;
  const champion = championStandings.find((s) => s.playoffResult === "champion");
  const runnerUp = championStandings.find((s) => s.playoffResult === "runner_up");
  const championSeasonYear = completedSeason?.seasonYear ?? latestSeason?.seasonYear;

  return (
    <>
      {/* Champion Banner */}
      {champion && championSeasonYear && (
        <ChampionBanner
          seasonYear={championSeasonYear}
          franchiseName={champion.franchiseName}
          franchiseSlug={champion.franchiseSlug}
          record={`${champion.wins ?? 0}-${champion.losses ?? 0}`}
          defeatedOpponent={runnerUp?.franchiseName}
        />
      )}

      {/* League at a Glance */}
      {leagueGlance && leagueGlance.reigningChampion && (
        <ScrollReveal>
          <PageSection label="Offseason" title="League at a Glance">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              <StatHero
                value={
                  <span className="flex flex-col items-center gap-1">
                    <span>{leagueGlance.reigningChampion.championName}</span>
                    {leagueGlance.reigningChampionshipCount > 0 && (
                      <ChampionshipStars count={leagueGlance.reigningChampionshipCount} variant="inline" />
                    )}
                  </span>
                }
                label={`${leagueGlance.reigningChampion.seasonYear} Champion`}
                badge="Reigning Champ"
                variant="md"
              />
              <StatHero
                value={leagueGlance.totalSeasons}
                label="Seasons Played"
                variant="md"
              />
              <StatHero
                value={leagueGlance.totalMatchups}
                label="Total Matchups"
                variant="md"
              />
              {leagueGlance.mostChampionships && (
                <StatHero
                  value={leagueGlance.mostChampionships.championships}
                  label={leagueGlance.mostChampionships.franchiseName}
                  badge="Most Championships"
                  variant="md"
                />
              )}
            </div>
          </PageSection>
        </ScrollReveal>
      )}

      {/* Offseason Recap */}
      {offseasonRecap && (
        <ScrollReveal>
          <PageSection label="Season Wrap" title="Recap">
            <OffseasonRecapCard
              seasonYear={offseasonRecap.seasonYear}
              items={[
                ...(offseasonRecap.champion
                  ? [{
                      label: "Champion",
                      value: offseasonRecap.champion.name,
                      href: offseasonRecap.champion.slug
                        ? `/teams/${offseasonRecap.champion.slug}`
                        : undefined,
                    }]
                  : []),
                ...(offseasonRecap.mostPF
                  ? [{
                      label: "Most Points",
                      value: `${offseasonRecap.mostPF.franchiseName} (${offseasonRecap.mostPF.points.toFixed(1)})`,
                      href: `/teams/${offseasonRecap.mostPF.franchiseSlug}`,
                    }]
                  : []),
                ...(offseasonRecap.biggestBlowout
                  ? [{
                      label: "Biggest Blowout",
                      value: `${offseasonRecap.biggestBlowout.winner} by ${offseasonRecap.biggestBlowout.margin.toFixed(1)}`,
                    }]
                  : []),
                ...(offseasonRecap.longestStreak
                  ? [{
                      label: "Longest Win Streak",
                      value: `${offseasonRecap.longestStreak.franchiseName} (${offseasonRecap.longestStreak.streak}W)`,
                    }]
                  : []),
              ]}
            />
          </PageSection>
        </ScrollReveal>
      )}

      {/* Transaction Activity */}
      {recentTransactions.length > 0 && (
        <ScrollReveal>
          <PageSection label="Activity" title="Recent Moves">
            <TransactionActivityCard transactions={recentTransactions} />
          </PageSection>
        </ScrollReveal>
      )}

      {/* All-Time Records Link */}
      <ScrollReveal>
        <div className="text-center py-8">
          <Link
            href="/records"
            className="inline-flex items-center gap-2 text-sm text-accent-green hover:underline font-medium"
          >
            View All-Time Records &rarr;
          </Link>
        </div>
      </ScrollReveal>

      {/* Fallback */}
      {!leagueGlance?.reigningChampion && !champion && (
        <EmptyState
          icon="chart"
          title="Syncing League Data"
          description="We're pulling data from Sleeper. Standings, matchups, and history will appear here once the first sync completes."
        />
      )}
    </>
  );
}
