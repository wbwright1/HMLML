import Link from "next/link";
import { TeamLink } from "@/components/team-link";
import { EditorialBody } from "@/components/editorial-emphasis";
import { PageSection } from "@/components/page-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { EmptyState } from "@/components/empty-state";
import { ChampionBanner } from "@/components/champion-banner";
import { StatHero } from "@/components/stat-hero";
import { OffseasonRecapCard } from "@/components/offseason-recap-card";
import { TransactionActivityCard } from "@/components/transaction-activity-card";
import { ChampionshipStars } from "@/components/championship-stars";
import {
  OffseasonReceiptCard,
  type ReceiptFranchise,
} from "@/components/hub/offseason-receipt-card";
import { ReigningHonors } from "@/components/hub/reigning-honors";
import {
  SmackFeed,
  smackItemsFromPosts,
  smackItemsFromSeeds,
} from "@/components/smack-feed";
import { SmackComposerSlot } from "@/components/smack-composer-slot";
import { getSeasonStandings, getLastCompletedSeason } from "@/lib/queries/seasons";
import { getLeagueAtAGlance } from "@/lib/queries/homepage";
import { getOffseasonRecap, getRecentTransactions } from "@/lib/queries/offseason";
import { getAllFranchises } from "@/lib/queries/franchises";
import { getHubEditorial } from "@/lib/content";
import { getPublishedHubContent } from "@/lib/queries/hub-content";
import { getRecentSmackPosts, anySmackPostsExist } from "@/lib/queries/smack";
import type { getLatestSeason } from "@/lib/queries/matchups";

function titleCaseSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

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

  // Season-scoped Site Desk editorial (offseason receipts, hero dek, smack),
  // written by the generate-content cron and keyed to the latest season the
  // cron targets. The hub only surfaces a module when the DB actually holds
  // GENERATED rows for it; with no rows the static recap below is unchanged,
  // so this is purely additive. Every read degrades independently.
  const editorialSeasonId = latestSeason?.id;
  const editorial = await getHubEditorial({ seasonId: editorialSeasonId });

  let hasGeneratedReceipts = false;
  let hasGeneratedSmack = false;
  const franchiseBySlug = new Map<string, ReceiptFranchise>();
  if (editorialSeasonId != null) {
    try {
      const grouped = await getPublishedHubContent(editorialSeasonId, null);
      hasGeneratedReceipts = (grouped.offseason_receipt?.length ?? 0) > 0;
      hasGeneratedSmack = (grouped.smack_post?.length ?? 0) > 0;
    } catch {
      // No generated content available; static recap stands on its own.
    }
  }
  if (hasGeneratedReceipts) {
    try {
      const franchises = await getAllFranchises();
      for (const f of franchises ?? []) {
        franchiseBySlug.set(f.slug, {
          slug: f.slug,
          name: f.name,
          abbreviation: f.abbreviation ?? null,
          brandingColor: f.brandingColor ?? null,
          avatarUrl: null,
        });
      }
    } catch {
      // Crest lookup failed; the card falls back to a slug-derived monogram.
    }
  }
  const resolveReceiptFranchise = (slug: string): ReceiptFranchise =>
    franchiseBySlug.get(slug) ?? {
      slug,
      name: titleCaseSlug(slug),
      abbreviation: null,
      brandingColor: null,
      avatarUrl: null,
    };

  // Smack feed: real member posts win when any exist; Site Desk seeds/generated
  // posts only stand in when the board is genuinely empty. The section is shown
  // only when there is something real to show (member posts OR generated smack),
  // so a quiet offseason keeps the static recap layout untouched.
  const [smackResult] = await Promise.allSettled([
    Promise.all([getRecentSmackPosts(4), anySmackPostsExist()]),
  ]);
  const [realSmack, anySmack] =
    smackResult.status === "fulfilled" ? smackResult.value : [[], false];
  const smackFromDesk = realSmack.length === 0 && !anySmack;
  const showSmack = realSmack.length > 0 || hasGeneratedSmack;
  const smackItems = smackFromDesk
    ? smackItemsFromSeeds(editorial.smackPosts.slice(0, 4))
    : smackItemsFromPosts(realSmack);

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
        {editorial.heroDek && (
          <p className="mt-4 text-body-lg text-text-secondary max-w-xl">
            <EditorialBody body={editorial.heroDek} />
          </p>
        )}
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
                    <TeamLink slug={leagueGlance.reigningChampion.championSlug}>
                      {leagueGlance.reigningChampion.championName}
                    </TeamLink>
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
                  label={
                    <TeamLink slug={leagueGlance.mostChampionships.franchiseSlug}>
                      {leagueGlance.mostChampionships.franchiseName}
                    </TeamLink>
                  }
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
                      href: offseasonRecap.longestStreak.franchiseSlug
                        ? `/teams/${offseasonRecap.longestStreak.franchiseSlug}`
                        : undefined,
                    }]
                  : []),
              ]}
            />
          </PageSection>
        </ScrollReveal>
      )}

      {/* Reigning Honors: the just-completed season's league-award winners,
          linking to the Trophy Case. Self-gating: renders nothing (no header,
          no shell) until awards are seeded. */}
      {completedSeason && (
        <ReigningHonors
          seasonId={completedSeason.id}
          seasonYear={completedSeason.seasonYear}
          kicker="Reigning Honors"
        />
      )}

      {/* Offseason Receipts (generated Site Desk content; hidden when none) */}
      {hasGeneratedReceipts && editorial.offseasonReceipts.length > 0 && (
        <ScrollReveal>
          <PageSection label="Site Desk" title="Offseason Receipts">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {editorial.offseasonReceipts.map((receipt, i) => (
                <OffseasonReceiptCard
                  key={`${receipt.category}-${i}`}
                  receipt={receipt}
                  franchise={resolveReceiptFranchise(receipt.franchiseSlug)}
                />
              ))}
            </div>
          </PageSection>
        </ScrollReveal>
      )}

      {/* The Smack Feed (real posts win; Site Desk stands in only when empty) */}
      {showSmack && (
        <ScrollReveal>
          <PageSection
            label={smackFromDesk ? "Site Desk" : "The League"}
            title="The Smack Feed"
          >
            <div className="space-y-4">
              <SmackComposerSlot />
              {smackItems.length > 0 ? (
                <SmackFeed
                  items={smackItems}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                />
              ) : (
                <p className="card-surface block p-4 text-body-sm text-text-tertiary">
                  Nothing on the board right now.
                </p>
              )}
            </div>
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
