import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { ScrollReveal } from "@/components/scroll-reveal";
import { EmptyState } from "@/components/empty-state";
import { getPowerRankings } from "@/lib/queries/records";
import type { PowerRankingEntry } from "@/lib/queries/records";

export const metadata = {
  title: "Power Rankings | Harambe Memorial League Memorial League",
  description:
    "Current season power rankings for the Harambe Memorial League Memorial League.",
};

export default async function PowerRankingsPage() {
  let rankings: PowerRankingEntry[] = [];

  try {
    rankings = await getPowerRankings();
  } catch {
    // DB may not be connected
  }

  return (
    <>
      <PageSection label="Records" title="Power Rankings">
        <Link
          href="/records"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; All Records
        </Link>

        <p className="text-body-lg text-muted-foreground max-w-prose">
          Current season rankings based on record and points scored.
        </p>
      </PageSection>

      <section className="pb-8 md:pb-12 space-y-6">
        {rankings.length === 0 ? (
          <EmptyState
            icon="chart"
            title="No Power Rankings"
            description="Rankings appear once the season is underway."
          />
        ) : (
          rankings.map((entry, index) => {
            const total = entry.wins + entry.losses + entry.ties;
            const winPct = total > 0 ? (entry.wins / total) * 100 : 0;
            const pointsDiff = entry.pointsScored - entry.pointsAgainst;

            return (
              <ScrollReveal key={entry.id} delay={index * 40}>
                <Link
                  href={`/teams/${entry.slug}`}
                  className="block rounded-xl border border-border bg-card p-5 transition-colors hover:bg-muted/50"
                  style={{ borderLeftWidth: "3px", borderLeftColor: entry.brandingColor ?? "var(--border)" }}
                >
                  <div className="flex flex-wrap items-center gap-4">
                    {/* Rank */}
                    <span
                      className={`text-2xl font-black tabular-nums w-10 text-center shrink-0 ${
                        entry.rank <= 3
                          ? "text-gold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {entry.rank}
                    </span>

                    {/* Franchise */}
                    <div className="flex-1 min-w-0">
                      <FranchiseIdentity
                        franchise={{
                          slug: entry.slug,
                          name: entry.name,
                          abbreviation: entry.abbreviation,
                          brandingColor: entry.brandingColor,
                        }}
                        championships={entry.championships}
                        variant="compact"
                      />
                      {/* Badges for top performers */}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {entry.rank === 1 && (
                          <SuperlativeBadge
                            text="Current Leader"
                            variant="green"
                          />
                        )}
                        {entry.championships > 0 && (
                          <SuperlativeBadge
                            text={`${entry.championships}x Champ`}
                            variant="gold"
                          />
                        )}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex flex-col items-end gap-1 text-sm shrink-0">
                      <span className="tabular-nums whitespace-nowrap">
                        <span className="font-bold">{entry.wins}</span>
                        <span className="text-xs text-muted-foreground ml-0.5">
                          W
                        </span>
                        <span className="text-muted-foreground mx-1">-</span>
                        <span>{entry.losses}</span>
                        <span className="text-xs text-muted-foreground ml-0.5">
                          L
                        </span>
                        {entry.ties > 0 && (
                          <>
                            <span className="text-muted-foreground mx-1">
                              -
                            </span>
                            <span>{entry.ties}</span>
                            <span className="text-xs text-muted-foreground ml-0.5">
                              T
                            </span>
                          </>
                        )}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {winPct.toFixed(0)}%
                        </span>
                        <span className="hidden sm:inline text-xs text-muted-foreground tabular-nums">
                          {entry.pointsScored.toFixed(1)} PF
                        </span>
                        <span
                          className={`hidden sm:inline text-xs tabular-nums ${
                            pointsDiff >= 0
                              ? "text-primary"
                              : "text-muted-foreground"
                          }`}
                        >
                          {pointsDiff >= 0 ? "+" : ""}
                          {pointsDiff.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              </ScrollReveal>
            );
          })
        )}
      </section>
    </>
  );
}
