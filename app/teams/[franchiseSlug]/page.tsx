import { notFound } from "next/navigation";
import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { StatHero } from "@/components/stat-hero";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { getFranchiseBySlug } from "@/lib/queries/franchises";
import { getPlayoffLabel, getPlayoffBadgeVariant } from "@/lib/playoff-labels";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

interface FranchiseDetailPageProps {
  params: Promise<{ franchiseSlug: string }>;
}

export async function generateMetadata({ params }: FranchiseDetailPageProps) {
  const { franchiseSlug } = await params;

  let franchise: Awaited<ReturnType<typeof getFranchiseBySlug>> = null;
  try {
    franchise = await getFranchiseBySlug(franchiseSlug);
  } catch {
    // DB may not be connected in dev
  }

  if (!franchise) {
    return { title: "Franchise Not Found | Harambe Memorial League Memorial League" };
  }

  return {
    title: `${franchise.name} | Harambe Memorial League Memorial League`,
    description: `Career history and stats for ${franchise.name} in the Harambe Memorial League Memorial League.`,
  };
}

export default async function FranchiseDetailPage({
  params,
}: FranchiseDetailPageProps) {
  const { franchiseSlug } = await params;

  let franchise: Awaited<ReturnType<typeof getFranchiseBySlug>> = null;

  try {
    franchise = await getFranchiseBySlug(franchiseSlug);
  } catch {
    // DB may not be connected in dev
  }

  if (!franchise) {
    notFound();
  }

  // Determine current owner from most recent season
  const currentOwner =
    franchise.seasonHistory.length > 0
      ? franchise.seasonHistory[0].ownerDisplayName
      : undefined;

  const currentCoOwner =
    franchise.seasonHistory.length > 0
      ? franchise.seasonHistory[0].coOwnerDisplayName
      : undefined;

  // Win percentage
  const totalGames = franchise.totalWins + franchise.totalLosses;
  const winPct = totalGames > 0 ? (franchise.totalWins / totalGames) : 0;

  return (
    <>
      {/* Hero Section — dark canvas frame; brandingColor survives only as a
          subtle ring on the crest (see FranchiseIdentity's BrandedCrest). */}
      <section className="py-8 md:py-12 space-y-6">
        <Link
          href="/teams"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; All Teams
        </Link>

        <ScrollReveal>
          <FranchiseIdentity
            franchise={{
              slug: franchise.slug,
              name: franchise.name,
              abbreviation: franchise.abbreviation,
              brandingColor: franchise.brandingColor,
            }}
            championships={franchise.championships}
            ownerName={currentOwner ?? undefined}
            coOwnerName={currentCoOwner ?? undefined}
            variant="hero"
          />
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 pt-4">
            <StatHero
              value={`${franchise.totalWins}-${franchise.totalLosses}`}
              label="All-Time Record"
              context={`${(winPct * 100).toFixed(1)}% win rate`}
              variant="md"
            />
            <StatHero
              value={franchise.totalPointsScored.toFixed(1)}
              label="Total Points"
              context={`${franchise.seasonHistory.length} season${franchise.seasonHistory.length !== 1 ? "s" : ""}`}
              variant="md"
            />
            {franchise.championships > 0 && (
              <StatHero
                value={franchise.championships}
                label={franchise.championships === 1 ? "Championship" : "Championships"}
                variant="md"
              />
            )}
          </div>
        </ScrollReveal>

        {franchise.seasonHistory.length > 0 && (
          <ScrollReveal delay={200}>
            <div className="flex justify-center gap-6 pt-2">
              <Link
                href={`/teams/${franchise.slug}/roster`}
                className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-body-sm font-medium text-primary-foreground transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                View Current Roster
              </Link>
              <Link
                href={`/teams/${franchise.slug}/drafts`}
                className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-body-sm font-medium text-text-primary transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Draft History
              </Link>
              <Link
                href={`/trades?team=${franchise.slug}`}
                className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-body-sm font-medium text-text-primary transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Trade History
              </Link>
              <Link
                href={`/teams/${franchise.slug}/schedule`}
                className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-body-sm font-medium text-text-primary transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Schedule
              </Link>
            </div>
          </ScrollReveal>
        )}
      </section>

      {/* Season History */}
      <PageSection label="Year by Year" title="Season History">
        {franchise.seasonHistory.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No Season History"
            description="Season history will appear after data sync completes."
          />
        ) : (
          <div className="space-y-3">
            {franchise.seasonHistory.map((season, index) => (
              <ScrollReveal key={season.id} delay={index * 40}>
                <div className="rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/seasons/${season.seasonYear}`}
                          className="text-h3 hover:text-primary transition-colors"
                        >
                          {season.seasonYear}
                        </Link>
                        {season.isLegacyEra && (
                          <span className="text-caption text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            Legacy Era
                          </span>
                        )}
                      </div>
                      {season.ownerDisplayName && (
                        <p className="text-body-sm text-muted-foreground">
                          {season.ownerDisplayName}{season.coOwnerDisplayName ? ` & ${season.coOwnerDisplayName}` : ""}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-sm font-mono">
                      {/* Record */}
                      <span className="tabular-nums whitespace-nowrap">
                        <span className="font-bold text-text-primary">{season.wins ?? 0}</span>
                        <span className="text-xs text-muted-foreground ml-0.5">
                          W
                        </span>
                        <span className="text-muted-foreground mx-1">-</span>
                        <span className="text-text-secondary">{season.losses ?? 0}</span>
                        <span className="text-xs text-muted-foreground ml-0.5">
                          L
                        </span>
                        {(season.ties ?? 0) > 0 && (
                          <>
                            <span className="text-muted-foreground mx-1">
                              -
                            </span>
                            <span className="text-text-secondary">{season.ties}</span>
                            <span className="text-xs text-muted-foreground ml-0.5">
                              T
                            </span>
                          </>
                        )}
                      </span>

                      {/* Points scored */}
                      {(season.pointsScored ?? 0) > 0 && (
                        <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                          {(season.pointsScored ?? 0).toFixed(1)} pts
                        </span>
                      )}

                      {/* Standings finish */}
                      {season.standingsFinish != null && (
                        <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                          #{season.standingsFinish}
                        </span>
                      )}

                      {/* Playoff result */}
                      <PlayoffBadge result={season.playoffResult} />
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        )}
      </PageSection>
    </>
  );
}

function PlayoffBadge({ result }: { result: string | null }) {
  if (!result) return null;

  const label = getPlayoffLabel(result);
  if (!label) return null;

  return (
    <SuperlativeBadge
      text={label}
      variant={getPlayoffBadgeVariant(result)}
    />
  );
}
