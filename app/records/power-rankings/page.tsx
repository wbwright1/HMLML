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

/** Trend vs. season standings: sage ▲ for climbers, rust ▼ for sliders, neutral
 * dash for even. Never color alone; the glyph + value always ride together. */
function FormIndicator({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="flex items-center gap-1 font-mono text-sm tabular-nums text-text-tertiary">
        <span aria-hidden>–</span>
        <span>0</span>
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span className="flex items-center gap-1 font-mono text-sm font-bold tabular-nums text-accent-green">
        <span aria-hidden>▲</span>
        <span>{delta}</span>
        <span className="sr-only">spots ahead of standings</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 font-mono text-sm font-bold tabular-nums text-accent-warm">
      <span aria-hidden>▼</span>
      <span>{Math.abs(delta)}</span>
      <span className="sr-only">spots behind standings</span>
    </span>
  );
}

/** W-L(-T) record, mono with muted letter suffixes. */
function Record({ entry }: { entry: PowerRankingEntry }) {
  return (
    <span className="font-mono tabular-nums whitespace-nowrap">
      <span className="font-bold text-text-primary">{entry.wins}</span>
      <span className="text-xs text-text-tertiary ml-0.5">W</span>
      <span className="text-text-tertiary mx-1">-</span>
      <span className="text-text-primary">{entry.losses}</span>
      <span className="text-xs text-text-tertiary ml-0.5">L</span>
      {entry.ties > 0 && (
        <>
          <span className="text-text-tertiary mx-1">-</span>
          <span className="text-text-primary">{entry.ties}</span>
          <span className="text-xs text-text-tertiary ml-0.5">T</span>
        </>
      )}
    </span>
  );
}

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

      <section className="pb-8 md:pb-12 space-y-3 md:space-y-6">
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

            const badges = (
              <>
                {entry.rank === 1 && (
                  <SuperlativeBadge text="Current Leader" variant="green" />
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
              </>
            );
            const hasBadges =
              entry.rank === 1 ||
              entry.championships > 0 ||
              entry.injuryCount > 0;

            const rankColor =
              entry.rank <= 3 ? "text-accent-gold" : "text-text-tertiary";

            const franchise = {
              slug: entry.slug,
              name: entry.name,
              abbreviation: entry.abbreviation,
              brandingColor: entry.brandingColor,
              avatarUrl: entry.avatarUrl,
            };

            return (
              <ScrollReveal key={entry.id} delay={index * 40}>
                <Link
                  href={`/teams/${entry.slug}`}
                  className="block rounded-[14px] border border-border bg-surface p-4 md:p-5 transition-colors hover:border-border-strong hover:bg-surface-muted"
                >
                  {/* ------- Mobile: stacked card (hidden on md+) ------- */}
                  <div className="md:hidden">
                    {/* Row 1: rank · franchise · trend */}
                    <div className="flex items-center gap-3">
                      <span
                        className={`font-mono text-3xl font-black tabular-nums w-9 text-center shrink-0 ${rankColor}`}
                      >
                        {entry.rank}
                      </span>
                      <div className="flex-1 min-w-0">
                        <FranchiseIdentity
                          franchise={franchise}
                          championships={entry.championships}
                          variant="compact"
                        />
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <FormIndicator delta={entry.formDelta} />
                        <span className="text-[10px] text-text-muted tabular-nums whitespace-nowrap">
                          std #{entry.standingsRank}
                        </span>
                      </div>
                    </div>

                    {/* Row 2: badges */}
                    {hasBadges && (
                      <div className="flex flex-wrap gap-1 mt-3">{badges}</div>
                    )}

                    {/* Row 3: stat strip */}
                    <div className="mt-3 pt-3 border-t border-divider flex items-center justify-between gap-2 font-mono text-xs">
                      <Record entry={entry} />
                      <div className="flex items-center gap-3 text-text-tertiary tabular-nums">
                        <span>{winPct.toFixed(0)}%</span>
                        <span>{entry.pointsScored.toFixed(1)} PF</span>
                        <span
                          className={
                            pointsDiff >= 0
                              ? "text-accent-green"
                              : "text-accent-warm"
                          }
                        >
                          {pointsDiff >= 0 ? "+" : ""}
                          {pointsDiff.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ------- Desktop: single row (hidden below md) ------- */}
                  <div className="hidden md:flex md:flex-wrap md:items-center md:gap-4">
                    {/* Rank */}
                    <span
                      className={`font-mono text-2xl font-black tabular-nums w-10 text-center shrink-0 ${rankColor}`}
                    >
                      {entry.rank}
                    </span>

                    {/* Franchise */}
                    <div className="flex-1 min-w-0">
                      <FranchiseIdentity
                        franchise={franchise}
                        championships={entry.championships}
                        variant="compact"
                      />
                      {hasBadges && (
                        <div className="flex flex-wrap gap-1 mt-1">{badges}</div>
                      )}
                    </div>

                    {/* Form vs standings */}
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <FormIndicator delta={entry.formDelta} />
                      <span className="text-caption text-text-tertiary normal-case tracking-normal">
                        vs standings (#{entry.standingsRank})
                      </span>
                    </div>

                    {/* Stats */}
                    <div className="flex flex-col items-end gap-1 text-sm shrink-0">
                      <Record entry={entry} />
                      <div className="flex items-center gap-3 font-mono">
                        <span className="text-xs text-text-tertiary tabular-nums">
                          {winPct.toFixed(0)}%
                        </span>
                        <span className="text-xs text-text-tertiary tabular-nums">
                          {entry.pointsScored.toFixed(1)} PF
                        </span>
                        <span
                          className={`text-xs tabular-nums ${
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
