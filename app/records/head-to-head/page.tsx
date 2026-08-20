import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { PageSection } from "@/components/page-section";
import { H2HHero } from "@/components/h2h-hero";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { ScrollReveal } from "@/components/scroll-reveal";
import {
  getAllFranchiseOptions,
  getHeadToHead,
  getHeadToHeadHistory,
} from "@/lib/queries/records";
import { EmptyState } from "@/components/empty-state";
import { FranchisePairSelector } from "@/app/records/head-to-head/franchise-selector";

// Dynamically rendered: ?a= and ?b= drive the pairing query, and awaiting searchParams opts a route out
// of static rendering, so a `revalidate` export here would be inert. Caching
// these needs unstable_cache around the queries (tracked as follow-up work;
// mind that it serializes Date fields to strings behind unchanged types).

export const metadata = {
  title: "Head-to-Head Records | Harambe Memorial League Memorial League",
  description:
    "Compare any two franchises head-to-head in the Harambe Memorial League Memorial League.",
};

interface HeadToHeadPageProps {
  searchParams: Promise<{ a?: string; b?: string }>;
}

export default async function HeadToHeadPage({
  searchParams,
}: HeadToHeadPageProps) {
  const { a: slugA, b: slugB } = await searchParams;

  let franchises: Awaited<ReturnType<typeof getAllFranchiseOptions>> = [];
  try {
    franchises = await getAllFranchiseOptions();
  } catch {
    // DB may not be connected
  }

  // Resolve selected franchises
  const teamA = slugA ? franchises.find((f) => f.slug === slugA) : undefined;
  const teamB = slugB ? franchises.find((f) => f.slug === slugB) : undefined;

  const bothSelected = teamA && teamB;

  let record: Awaited<ReturnType<typeof getHeadToHead>> | null = null;
  let history: Awaited<ReturnType<typeof getHeadToHeadHistory>> = [];

  if (bothSelected) {
    try {
      [record, history] = await Promise.all([
        getHeadToHead(teamA.id, teamB.id),
        getHeadToHeadHistory(teamA.id, teamB.id),
      ]);
    } catch {
      // Query error
    }
  }

  return (
    <>
      <PageSection label="Records" title="Head-to-Head.">
        <BackLink href="/records" label="All Records" />

        <p className="text-body-lg text-text-secondary max-w-prose">
          Select two franchises to compare their all-time head-to-head record.
        </p>

        <FranchisePairSelector
          franchises={franchises}
          selectedSlugA={slugA}
          selectedSlugB={slugB}
        />
      </PageSection>

      {!bothSelected && franchises.length === 0 && (
        <EmptyState
          icon="users"
          title="No Data Available"
          description="Franchise data isn't available yet. Check back once data has been synced."
        />
      )}

      {!bothSelected && franchises.length > 0 && (
        <EmptyState
          icon="search"
          title="Select Two Franchises"
          description="Choose two franchises above to see their head-to-head history."
        />
      )}

      {bothSelected && record && (
        <>
          <section className="py-12">
            <ScrollReveal>
              <H2HHero
                teamA={teamA}
                teamB={teamB}
                record={{ wins: record.wins, losses: record.losses }}
                streak={record.streak ?? undefined}
              />
            </ScrollReveal>

            {history.length > 0 && (
              <ScrollReveal delay={100}>
                <div
                  className="mt-8 flex items-center justify-center gap-8"
                  aria-label={`Total points: ${teamA.name} ${history.reduce((sum, g) => sum + g.pointsA, 0).toFixed(1)}, ${teamB.name} ${history.reduce((sum, g) => sum + g.pointsB, 0).toFixed(1)}`}
                >
                  <span
                    className="text-right min-w-[5rem]"
                  >
                    <span
                      className="text-h3 font-mono font-bold tabular-nums block text-text-primary"
                    >
                      {history
                        .reduce((sum, g) => sum + g.pointsA, 0)
                        .toFixed(1)}
                    </span>
                    <span
                      className="text-xs block text-text-tertiary"
                    >
                      {teamA.name}
                    </span>
                  </span>

                  <span className="text-kicker">
                    Total Points
                  </span>

                  <span
                    className="text-left min-w-[5rem]"
                  >
                    <span
                      className="text-h3 font-mono font-bold tabular-nums block text-text-primary"
                    >
                      {history
                        .reduce((sum, g) => sum + g.pointsB, 0)
                        .toFixed(1)}
                    </span>
                    <span
                      className="text-xs block text-text-tertiary"
                    >
                      {teamB.name}
                    </span>
                  </span>
                </div>
              </ScrollReveal>
            )}
          </section>

          <PageSection label="Game Log" title="Match History">
            {history.length === 0 ? (
              <EmptyState
                icon="chart"
                title="No Match History"
                description="No matchup history found between these two franchises."
              />
            ) : (
              <>
                <p className="text-body-sm text-text-tertiary mb-2">
                  <span className="font-mono tabular-nums">{history.length}</span> game{history.length !== 1 ? "s" : ""} played
                  all-time
                </p>
                <div className="space-y-2">
                  {history.map((game, index) => {
                    const aWon = game.winnerFranchiseId === teamA.id;
                    return (
                      <ScrollReveal
                        key={`${game.seasonYear}-${game.week}-${index}`}
                        delay={index * 30}
                      >
                        <Link
                          href={`/seasons/${game.seasonYear}/week/${game.week}`}
                          className="block rounded-[14px] border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-muted"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-body-sm font-medium text-text-primary">
                                  <span className="font-mono tabular-nums">{game.seasonYear}</span> &middot; Week{" "}
                                  <span className="font-mono tabular-nums">{game.week}</span>
                                </span>
                                {game.isPlayoff && (
                                  <SuperlativeBadge
                                    text="Playoff"
                                    variant="gold"
                                  />
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-4 font-mono text-sm tabular-nums">
                              <span
                                className={
                                  aWon
                                    ? "font-bold text-accent-gold"
                                    : "text-text-tertiary"
                                }
                              >
                                {teamA.name} {game.pointsA.toFixed(1)}
                              </span>
                              <span className="text-text-tertiary">-</span>
                              <span
                                className={
                                  !aWon
                                    ? "font-bold text-accent-gold"
                                    : "text-text-tertiary"
                                }
                              >
                                {game.pointsB.toFixed(1)} {teamB.name}
                              </span>
                            </div>
                          </div>
                        </Link>
                      </ScrollReveal>
                    );
                  })}
                </div>
              </>
            )}
          </PageSection>
        </>
      )}
    </>
  );
}
