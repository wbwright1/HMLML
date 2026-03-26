import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { ScrollReveal } from "@/components/scroll-reveal";
import { EmptyState } from "@/components/empty-state";
import { getRivalries } from "@/lib/queries/records";
import type { RivalrySummary } from "@/lib/queries/records";

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
      <PageSection label="Records" title="Rivalries">
        <Link
          href="/records"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; All Records
        </Link>

        <p className="text-body-lg text-muted-foreground max-w-prose">
          Every head-to-head pairing in league history — ranked
          by total games played and competitiveness.
        </p>

        {rivalries.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {rivalries.length} rivalry pairings
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
                  className="block rounded-xl border border-border bg-card p-5 transition-colors hover:bg-muted/50"
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
                        }}
                        variant="compact"
                      />
                    </div>

                    {/* Record */}
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <span className="text-lg font-black tabular-nums">
                        {record.wins} - {record.losses}
                        {record.ties > 0 ? ` - ${record.ties}` : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {totalGames} game{totalGames !== 1 ? "s" : ""}
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
