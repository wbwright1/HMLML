import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { EmptyState } from "@/components/empty-state";
import { ChampionBanner } from "@/components/champion-banner";
import { StatHero } from "@/components/stat-hero";
import { OffseasonRecapCard } from "@/components/offseason-recap-card";
import { TransactionActivityCard } from "@/components/transaction-activity-card";
import { ChampionshipStars } from "@/components/championship-stars";
import { getSeasonStandings, getLastCompletedSeason } from "@/lib/queries/seasons";
import { getLeagueAtAGlance } from "@/lib/queries/homepage";
import { getOffseasonRecap, getRecentTransactions } from "@/lib/queries/offseason";
import type { getLatestSeason } from "@/lib/queries/matchups";

export async function OffseasonHub({
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
      {/* Hero */}
      <section className="pt-2 pb-4">
        <p className="text-kicker mb-3">
          Harambe Memorial League &middot; {championSeasonYear ?? new Date().getFullYear()}
        </p>
        <h1 className="text-display">The Offseason.</h1>
      </section>

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
            className="inline-flex items-center gap-2 text-body-sm text-accent-gold hover:brightness-110 font-medium"
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
