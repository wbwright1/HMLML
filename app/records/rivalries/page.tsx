import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { ScrollReveal } from "@/components/scroll-reveal";
import { EmptyState } from "@/components/empty-state";
import { getRivalries } from "@/lib/queries/records";
import type { RivalrySummary } from "@/lib/queries/records";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Rivalries | Harambe Memorial League Memorial League",
  description:
    "The fiercest rivalries and closest matchups in the Harambe Memorial League Memorial League.",
};

export default async function RivalriesPage() {
  let rivalries: RivalrySummary[] = [];

  try {
    rivalries = await getRivalries();
  } catch {
    // DB may not be connected
  }

  return (
    <>
      <PageSection label="Records" title="Rivalries.">
        <Link
          href="/records"
          className="text-body-sm text-text-tertiary hover:text-text-primary transition-colors"
        >
          &larr; All Records
        </Link>

        <p className="text-body-lg text-text-secondary max-w-prose">
          Every head-to-head pairing in league history, ranked
          by total games played and competitiveness.
        </p>

        {rivalries.length > 0 && (
          <p className="text-body-sm text-text-tertiary">
            <span className="font-mono tabular-nums">{rivalries.length}</span> rivalry pairings
          </p>
        )}
      </PageSection>

      <section className="pb-8 md:pb-12 space-y-6">
        {rivalries.length === 0 ? (
          <EmptyState
            icon="users"
            title="No Rivalry Data"
            description="Rivalry records will appear once matchup data has been synced."
          />
        ) : (
          rivalries.map((rivalry, index) => {
            const { franchiseA, franchiseB, record, totalGames } = rivalry;
            const isClose =
              Math.abs(record.wins - record.losses) <= 2 && totalGames >= 4;

            return (
              <ScrollReveal key={`${franchiseA.id}-${franchiseB.id}`} delay={index * 40}>
                <Link
                  href={`/records/head-to-head?a=${franchiseA.slug}&b=${franchiseB.slug}`}
                  className="block rounded-[14px] border border-border bg-surface p-5 transition-colors hover:border-border-strong hover:bg-surface-muted"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Team A */}
                    <div className="flex-1 min-w-0">
                      <FranchiseIdentity
                        franchise={{
                          slug: franchiseA.slug,
                          name: franchiseA.name,
                          abbreviation: franchiseA.abbreviation,
                          brandingColor: franchiseA.brandingColor,
                          avatarUrl: franchiseA.avatarUrl,
                        }}
                        variant="compact"
                      />
                    </div>

                    {/* Record */}
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <span className="font-mono text-lg font-black tabular-nums text-text-primary">
                        {record.wins} - {record.losses}
                        {record.ties > 0 ? ` - ${record.ties}` : ""}
                      </span>
                      <span className="text-xs text-text-tertiary">
                        <span className="font-mono tabular-nums">{totalGames}</span> game{totalGames !== 1 ? "s" : ""}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {isClose && (
                          <SuperlativeBadge text="Close Rivalry" variant="gold" />
                        )}
                        {record.streak && (
                          <SuperlativeBadge
                            text={record.streak}
                            variant="green"
                          />
                        )}
                      </div>
                    </div>

                    {/* Team B */}
                    <div className="flex-1 min-w-0 sm:text-right">
                      <FranchiseIdentity
                        franchise={{
                          slug: franchiseB.slug,
                          name: franchiseB.name,
                          abbreviation: franchiseB.abbreviation,
                          brandingColor: franchiseB.brandingColor,
                          avatarUrl: franchiseB.avatarUrl,
                        }}
                        variant="compact"
                      />
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
