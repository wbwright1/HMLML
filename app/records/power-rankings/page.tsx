import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { PageSection } from "@/components/page-section";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { ScrollReveal } from "@/components/scroll-reveal";
import { EmptyState } from "@/components/empty-state";
import { getPowerRankings } from "@/lib/queries/records";
import type { PowerRankingEntry } from "@/lib/queries/records";

export const dynamic = "force-dynamic";

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
      <PageSection label="Records" title="Power Rankings.">
        <BackLink href="/records" label="All Records" />

        <p className="text-body-lg text-text-secondary max-w-prose">
          Ranked on the last 4 weeks: recent results, scoring trend, and injuries. Not season-long record.
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
                  className="block rounded-[14px] border border-border bg-surface p-5 transition-colors hover:border-border-strong hover:bg-surface-muted"
                >
                  <div className="flex flex-wrap items-center gap-4">
                    {/* Rank */}
                    <span
                      className={`font-mono text-2xl font-black tabular-nums w-10 text-center shrink-0 ${
                        entry.rank <= 3
                          ? "text-accent-gold"
                          : "text-text-tertiary"
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
                          avatarUrl: entry.avatarUrl,
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
                        {entry.injuryCount > 0 && (
                          <SuperlativeBadge
                            text={`${entry.injuryCount} Banged Up`}
                            variant="brown"
                          />
                        )}
                      </div>
                    </div>

                    {/* Form vs standings */}
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      {entry.formDelta === 0 ? (
                        <span className="flex items-center gap-1 font-mono text-sm tabular-nums text-text-tertiary">
                          <span aria-hidden>–</span>
                          <span>0</span>
                        </span>
                      ) : entry.formDelta > 0 ? (
                        <span className="flex items-center gap-1 font-mono text-sm font-bold tabular-nums text-accent-green">
                          <span aria-hidden>▲</span>
                          <span>{entry.formDelta}</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 font-mono text-sm tabular-nums text-accent-warm">
                          <span aria-hidden>▼</span>
                          <span>{Math.abs(entry.formDelta)}</span>
                        </span>
                      )}
                      <span className="text-caption text-text-tertiary normal-case tracking-normal">
                        vs standings (#{entry.standingsRank})
                      </span>
                    </div>

                    {/* Stats */}
                    <div className="flex flex-col items-end gap-1 text-sm shrink-0">
                      <span className="font-mono tabular-nums whitespace-nowrap">
                        <span className="font-bold text-text-primary">{entry.wins}</span>
                        <span className="text-xs text-text-tertiary ml-0.5">
                          W
                        </span>
                        <span className="text-text-tertiary mx-1">-</span>
                        <span className="text-text-primary">{entry.losses}</span>
                        <span className="text-xs text-text-tertiary ml-0.5">
                          L
                        </span>
                        {entry.ties > 0 && (
                          <>
                            <span className="text-text-tertiary mx-1">
                              -
                            </span>
                            <span className="text-text-primary">{entry.ties}</span>
                            <span className="text-xs text-text-tertiary ml-0.5">
                              T
                            </span>
                          </>
                        )}
                      </span>
                      <div className="flex items-center gap-3 font-mono">
                        <span className="text-xs text-text-tertiary tabular-nums">
                          {winPct.toFixed(0)}%
                        </span>
                        <span className="hidden sm:inline text-xs text-text-tertiary tabular-nums">
                          {entry.pointsScored.toFixed(1)} PF
                        </span>
                        <span
                          className={`hidden sm:inline text-xs tabular-nums ${
                            pointsDiff >= 0
                              ? "text-accent-green"
                              : "text-text-tertiary"
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
