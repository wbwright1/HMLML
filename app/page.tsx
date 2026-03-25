import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { MatchupRow } from "@/components/matchup-row";
import { StatHero } from "@/components/stat-hero";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { EmptyState } from "@/components/empty-state";
import { ScorePoller } from "@/app/matchups/score-poller";
import { getCurrentWeekMatchups, getLatestSeason } from "@/lib/queries/matchups";
import { getSeasonStandings } from "@/lib/queries/seasons";
import { getHomepageSuperlatives, getLastWeekResults, getLeagueAtAGlance } from "@/lib/queries/homepage";

export default async function HomePage() {
  let matchupData: Awaited<ReturnType<typeof getCurrentWeekMatchups>> = null;
  let latestSeason: Awaited<ReturnType<typeof getLatestSeason>> = null;
  let standings: Awaited<ReturnType<typeof getSeasonStandings>> = [];

  try {
    [matchupData, latestSeason] = await Promise.all([
      getCurrentWeekMatchups(),
      getLatestSeason(),
    ]);

    if (latestSeason) {
      standings = await getSeasonStandings(latestSeason.id);
    }
  } catch {
    // DB may not be connected in dev — fall through to empty states
  }

  // Superlative stats
  const superlatives = latestSeason
    ? await getHomepageSuperlatives(latestSeason.id)
    : null;

  // Season narrative: in-season = last week results, offseason = league at a glance
  const isInSeason = latestSeason?.status === "in_season";
  const lastWeekResults =
    isInSeason && matchupData
      ? await getLastWeekResults(latestSeason!.id, matchupData.week)
      : null;
  const leagueGlance = !isInSeason ? await getLeagueAtAGlance() : null;

  const hasLiveMatchups =
    matchupData?.matchups.some((m) => m.status === "in_progress") ?? false;

  return (
    <>
      {/* Story 3.1: League Identity Hero */}
      <section
        className="py-24 space-y-4 text-center"
        style={{ backgroundColor: "rgba(45, 90, 61, 0.04)" }}
      >
        <p className="text-caption uppercase tracking-widest text-muted-foreground">
          Est. 2017
        </p>
        <h1 className="text-display">Harambe Memorial League</h1>
        <p className="text-body-lg text-muted-foreground">
          12 Teams. Dynasty Format. Harambe&rsquo;s Legacy.
        </p>
        {latestSeason && matchupData && (
          <p className="text-body-sm text-muted-foreground">
            {latestSeason.seasonYear} Season — Week {matchupData.week}
          </p>
        )}
        {latestSeason && !matchupData && (
          <p className="text-body-sm text-muted-foreground">
            {latestSeason.seasonYear} Season
          </p>
        )}
      </section>

      {/* Story 3.2: Superlative Stats Row */}
      {superlatives && (
        <ScrollReveal>
          <section className="py-12">
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
                  context={`Week ${superlatives.latestCompletedWeek}`}
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
          </section>
        </ScrollReveal>
      )}

      {/* Story 3.5: Season Narrative Block */}
      {lastWeekResults && lastWeekResults.results.length > 0 && (
        <ScrollReveal>
          <PageSection label="Last Week" title={`Week ${lastWeekResults.week} Results`}>
            <div className="space-y-2">
              {lastWeekResults.results.map((result, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-card px-4 py-3 text-sm"
                >
                  <span>
                    <span className="font-semibold">{result.winner}</span>
                    <span className="text-muted-foreground"> def. </span>
                    <span className="text-muted-foreground">{result.loser}</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground whitespace-nowrap ml-4">
                    {result.winnerScore.toFixed(1)} - {result.loserScore.toFixed(1)}
                  </span>
                </div>
              ))}
              {lastWeekResults.results.length > 0 && (
                <p className="text-caption text-muted-foreground pt-2">
                  Biggest blowout: {lastWeekResults.results[0].winner} by{" "}
                  {lastWeekResults.results[0].margin.toFixed(1)} pts
                </p>
              )}
            </div>
          </PageSection>
        </ScrollReveal>
      )}

      {!isInSeason && leagueGlance && leagueGlance.reigningChampion && (
        <ScrollReveal>
          <PageSection label="Offseason" title="League at a Glance">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              <StatHero
                value={leagueGlance.reigningChampion.championName}
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

      {/* Story 3.3: Full Week Matchups */}
      {matchupData && matchupData.matchups.length > 0 && (
        <ScrollReveal delay={100}>
          <PageSection
            label={`${matchupData.seasonYear} Season`}
            title={`Week ${matchupData.week} Matchups`}
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

            <ScorePoller initialIsGameWindow={hasLiveMatchups} />
          </PageSection>
        </ScrollReveal>
      )}

      {/* Story 3.4: Standings with Personality */}
      {standings.length > 0 && latestSeason && (
        <ScrollReveal delay={200}>
          <PageSection
            label={`${latestSeason.seasonYear} Season`}
            title="Standings"
          >
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-3 pr-4 text-xs uppercase tracking-wider text-muted-foreground font-medium w-12">
                      #
                    </th>
                    <th className="pb-3 pr-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                      Team
                    </th>
                    <th className="pb-3 pr-4 text-xs uppercase tracking-wider text-muted-foreground font-medium text-center">
                      Record
                    </th>
                    <th className="pb-3 text-xs uppercase tracking-wider text-muted-foreground font-medium text-right">
                      Points
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((entry, i) => {
                    const isLeader = i === 0;
                    return (
                      <tr
                        key={entry.id}
                        className="border-b border-border/50 last:border-0"
                        style={{ borderLeft: `3px solid ${entry.franchiseBrandingColor ?? "var(--border)"}` }}
                      >
                        <td className="py-3 pr-4 text-sm text-muted-foreground tabular-nums">
                          {entry.standingsFinish ?? i + 1}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <Link href={`/teams/${entry.franchiseSlug}`}>
                              <p className="text-sm font-semibold hover:text-primary transition-colors">
                                {entry.franchiseName}
                              </p>
                            </Link>
                            {isLeader && (
                              <SuperlativeBadge text="1st Place" variant="gold" />
                            )}
                          </div>
                          {entry.ownerDisplayName && (
                            <p className="text-xs text-muted-foreground">
                              {entry.ownerDisplayName}{entry.coOwnerDisplayName ? ` & ${entry.coOwnerDisplayName}` : ""}
                            </p>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-center whitespace-nowrap">
                          <span className={`text-sm tabular-nums ${isLeader ? "font-bold" : ""}`}>
                            {entry.wins ?? 0}-{entry.losses ?? 0}
                            {(entry.ties ?? 0) > 0 ? `-${entry.ties}` : ""}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <span className="text-sm tabular-nums">
                            {entry.pointsScored != null
                              ? entry.pointsScored.toFixed(1)
                              : "-"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile card view */}
            <div className="md:hidden space-y-3">
              {standings.map((entry, i) => {
                const isLeader = i === 0;
                return (
                  <Link
                    key={entry.id}
                    href={`/teams/${entry.franchiseSlug}`}
                    className="block rounded-xl border border-border bg-card p-4 hover:bg-muted/50 transition-colors"
                    style={{ borderLeftWidth: "3px", borderLeftColor: entry.franchiseBrandingColor ?? "var(--border)" }}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-lg tabular-nums font-bold mt-0.5 text-muted-foreground">
                        {entry.standingsFinish ?? i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold truncate">
                            {entry.franchiseName}
                          </p>
                          {isLeader && (
                            <SuperlativeBadge text="1st Place" variant="gold" />
                          )}
                        </div>
                        {entry.ownerDisplayName && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {entry.ownerDisplayName}{entry.coOwnerDisplayName ? ` & ${entry.coOwnerDisplayName}` : ""}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-4 mt-2 text-sm">
                          <span className="tabular-nums">
                            <span className={isLeader ? "font-bold" : "font-bold"}>{entry.wins ?? 0}</span>
                            <span className="text-muted-foreground">W</span>
                            <span className="text-muted-foreground mx-0.5">-</span>
                            <span>{entry.losses ?? 0}</span>
                            <span className="text-muted-foreground">L</span>
                            {(entry.ties ?? 0) > 0 && (
                              <>
                                <span className="text-muted-foreground mx-0.5">-</span>
                                <span>{entry.ties}</span>
                                <span className="text-muted-foreground">T</span>
                              </>
                            )}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            {entry.pointsScored != null
                              ? entry.pointsScored.toFixed(1)
                              : "-"}{" "}
                            PF
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="mt-4">
              <Link
                href={`/seasons/${latestSeason.seasonYear}`}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                View full season details &rarr;
              </Link>
            </div>
          </PageSection>
        </ScrollReveal>
      )}

      {/* Fallback when no data is available */}
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
