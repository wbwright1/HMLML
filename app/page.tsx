import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { MatchupRow } from "@/components/matchup-row";
import { StatHero } from "@/components/stat-hero";
import { ScorePoller } from "@/app/matchups/score-poller";
import { getCurrentWeekMatchups, getLatestSeason } from "@/lib/queries/matchups";
import { getSeasonStandings } from "@/lib/queries/seasons";

export default async function HomePage() {
  // Fetch current week matchups and latest season standings in parallel
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

  // Featured superlative stat: highest-scoring team this season
  const topScorer = standings.length > 0
    ? standings.reduce((best, entry) =>
        (entry.pointsScored ?? 0) > (best.pointsScored ?? 0) ? entry : best
      , standings[0])
    : null;

  const hasLiveMatchups =
    matchupData?.matchups.some((m) => m.status === "in_progress") ?? false;

  return (
    <>
      {/* Hero Section */}
      <PageSection label="Est. 2017" title="Harambe Memorial League Memorial League">
        <p className="text-body-lg text-muted-foreground max-w-prose">
          The official home of the HMLML — dynasty fantasy football history,
          records, and live scores.
        </p>
      </PageSection>

      {/* Featured Superlative Stat */}
      {topScorer && (
        <ScrollReveal>
          <PageSection label="Season Leader" title="Points Scored">
            <div className="flex justify-center">
              <StatHero
                value={topScorer.pointsScored?.toFixed(1) ?? "0"}
                label={topScorer.franchiseName ?? "Unknown"}
                badge="Most Points Scored"
                context={`${topScorer.wins ?? 0}W - ${topScorer.losses ?? 0}L`}
                variant="lg"
              />
            </div>
          </PageSection>
        </ScrollReveal>
      )}

      {/* Current Week Matchups */}
      {matchupData && matchupData.matchups.length > 0 && (
        <ScrollReveal delay={100}>
          <PageSection
            label={`${matchupData.seasonYear} Season`}
            title={`Week ${matchupData.week}`}
          >
            <div className="space-y-3">
              {matchupData.matchups.slice(0, 5).map((matchup) => {
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

              {matchupData.matchups.length > 5 && (
                <Link
                  href="/matchups"
                  className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
                >
                  View all matchups &rarr;
                </Link>
              )}
            </div>

            {/* Live score polling during game windows */}
            <ScorePoller initialIsGameWindow={hasLiveMatchups} />
          </PageSection>
        </ScrollReveal>
      )}

      {/* Current Season Standings */}
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
                  {standings.map((entry, i) => (
                    <tr
                      key={entry.id}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="py-3 pr-4 text-sm text-muted-foreground tabular-nums">
                        {entry.standingsFinish ?? i + 1}
                      </td>
                      <td className="py-3 pr-4">
                        <Link href={`/teams/${entry.franchiseSlug}`}>
                          <p className="text-sm font-semibold hover:text-primary transition-colors">
                            {entry.franchiseName}
                          </p>
                        </Link>
                        {entry.ownerDisplayName && (
                          <p className="text-xs text-muted-foreground">
                            {entry.ownerDisplayName}
                          </p>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-center whitespace-nowrap">
                        <span className="text-sm tabular-nums">
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
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card view */}
            <div className="md:hidden space-y-3">
              {standings.map((entry, i) => (
                <Link
                  key={entry.id}
                  href={`/teams/${entry.franchiseSlug}`}
                  className="block rounded-xl border border-border bg-card p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg tabular-nums font-bold mt-0.5 text-muted-foreground">
                      {entry.standingsFinish ?? i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {entry.franchiseName}
                      </p>
                      {entry.ownerDisplayName && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {entry.ownerDisplayName}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-4 mt-2 text-sm">
                        <span className="tabular-nums">
                          <span className="font-bold">{entry.wins ?? 0}</span>
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
              ))}
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
        <PageSection label="Getting Started" title="Welcome">
          <p className="text-body-lg text-muted-foreground max-w-prose">
            Data is being synced from Sleeper. Check back soon for live scores,
            standings, and league history.
          </p>
        </PageSection>
      )}
    </>
  );
}
