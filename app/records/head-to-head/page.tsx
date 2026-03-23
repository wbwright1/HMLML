import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { H2HHero } from "@/components/h2h-hero";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { ScrollReveal } from "@/components/scroll-reveal";
import {
  getAllFranchiseOptions,
  getHeadToHead,
  getHeadToHeadHistory,
} from "@/lib/queries/records";
import { FranchisePairSelector } from "@/app/records/head-to-head/franchise-selector";

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
      <PageSection label="Records" title="Head-to-Head">
        <Link
          href="/records"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; All Records
        </Link>

        <p className="text-body-lg text-muted-foreground max-w-prose">
          Select two franchises to compare their all-time head-to-head record.
        </p>

        <FranchisePairSelector
          franchises={franchises}
          selectedSlugA={slugA}
          selectedSlugB={slugB}
        />
      </PageSection>

      {!bothSelected && franchises.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-body-lg text-muted-foreground">
            No franchise data available yet. Check back once data has been synced.
          </p>
        </div>
      )}

      {!bothSelected && franchises.length > 0 && (
        <div className="py-12 text-center">
          <p className="text-body text-muted-foreground">
            Pick two teams above to see their rivalry history.
          </p>
        </div>
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
                    className="text-right"
                    style={{ minWidth: "5rem" }}
                  >
                    <span
                      className="text-h3 font-bold block"
                      style={{ color: "#1A1A1A" }}
                    >
                      {history
                        .reduce((sum, g) => sum + g.pointsA, 0)
                        .toFixed(1)}
                    </span>
                    <span
                      className="text-xs block"
                      style={{ color: "#6B6560" }}
                    >
                      {teamA.name}
                    </span>
                  </span>

                  <span
                    className="text-sm font-medium uppercase tracking-widest"
                    style={{ color: "#6B6560" }}
                  >
                    Total Points
                  </span>

                  <span
                    className="text-left"
                    style={{ minWidth: "5rem" }}
                  >
                    <span
                      className="text-h3 font-bold block"
                      style={{ color: "#1A1A1A" }}
                    >
                      {history
                        .reduce((sum, g) => sum + g.pointsB, 0)
                        .toFixed(1)}
                    </span>
                    <span
                      className="text-xs block"
                      style={{ color: "#6B6560" }}
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
              <p className="text-body-lg text-muted-foreground">
                No matchup history found between these two franchises.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-2">
                  {history.length} game{history.length !== 1 ? "s" : ""} played
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
                          className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  {game.seasonYear} — Week {game.week}
                                </span>
                                {game.isPlayoff && (
                                  <SuperlativeBadge
                                    text="Playoff"
                                    variant="gold"
                                  />
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-4 text-sm tabular-nums">
                              <span
                                className={
                                  aWon
                                    ? "font-bold"
                                    : "text-muted-foreground"
                                }
                                style={{
                                  color: aWon ? "#2D5A3D" : "#C4402F",
                                }}
                              >
                                {teamA.name} {game.pointsA.toFixed(1)}
                              </span>
                              <span className="text-muted-foreground">-</span>
                              <span
                                className={
                                  !aWon
                                    ? "font-bold"
                                    : "text-muted-foreground"
                                }
                                style={{
                                  color: !aWon ? "#2D5A3D" : "#C4402F",
                                }}
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
