import Link from "next/link";
import { rethrowUnlessTolerable } from "@/lib/db-guard";
import { BackLink } from "@/components/back-link";
import { PageSection } from "@/components/page-section";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { ScrollReveal } from "@/components/scroll-reveal";
import { EmptyState } from "@/components/empty-state";
import { NamedRivalryCard } from "@/components/named-rivalry-card";
import { RivalryChip } from "@/components/rivalry-chip";
import { getAllFranchiseOptions, getRivalries } from "@/lib/queries/records";
import type { RivalrySummary } from "@/lib/queries/records";
import { getNamedRivalriesOrEmpty } from "@/lib/queries/named-rivalries-optional";
import {
  buildRivalryLookup,
  findNamedRivalry,
  type NamedRivalry,
} from "@/lib/queries/rivalries";
import { seriesRecordFor } from "@/lib/rivalry-display";

// ISR: rendered once, then served from cache until a successful sync calls
// revalidatePath("/", "layout"). Time window is only a backstop (lib/cache.ts).
export const revalidate = 3600;

export const metadata = {
  title: "Rivalries | Harambe Memorial League Memorial League",
  description:
    "The fiercest rivalries and closest matchups in the Harambe Memorial League Memorial League.",
};

export default async function RivalriesPage() {
  let rivalries: RivalrySummary[] = [];

  try {
    rivalries = await getRivalries();
  } catch (e) {
    rethrowUnlessTolerable(e);
    // DB may not be connected
  }

  // Named rivalries are optional lore over the auto list: a failed read shows
  // the list without them. Franchise options supply crest data for a named
  // pair that has not met yet (getRivalries only knows pairs that have played).
  let named: NamedRivalry[] = [];
  let franchiseOptions: Awaited<ReturnType<typeof getAllFranchiseOptions>> = [];
  try {
    named = await getNamedRivalriesOrEmpty();
    if (named.length > 0) franchiseOptions = await getAllFranchiseOptions();
  } catch {
    named = [];
  }
  const franchiseById = new Map(franchiseOptions.map((f) => [f.id, f]));
  const namedLookup = buildRivalryLookup(named);
  const featured = named.flatMap((r) => {
    const a = franchiseById.get(r.franchiseAId);
    const b = franchiseById.get(r.franchiseBId);
    if (!a || !b) return [];
    return [{ rivalry: r, a, b, record: seriesRecordFor(rivalries, a.id, b.id) }];
  });

  return (
    <>
      <PageSection label="Records" title="Rivalries.">
        <BackLink href="/records" label="All Records" />

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

      {featured.length > 0 && (
        <PageSection label="Lore" title="Named Rivalries">
          <div className="grid gap-4 md:grid-cols-2">
            {featured.map(({ rivalry, a, b, record }, index) => (
              <ScrollReveal key={rivalry.id} delay={index * 40}>
                <NamedRivalryCard
                  lore={rivalry}
                  teamA={a}
                  teamB={b}
                  record={record}
                />
              </ScrollReveal>
            ))}
          </div>
        </PageSection>
      )}

      <section className="pb-8 md:pb-12 space-y-6">
        {featured.length > 0 && rivalries.length > 0 && (
          <h2 className="text-kicker">Every Pairing</h2>
        )}
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
            const namedPair = findNamedRivalry(
              namedLookup,
              franchiseA.id,
              franchiseB.id,
            );

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
                      <div className="flex flex-wrap justify-center gap-1">
                        {namedPair && <RivalryChip name={namedPair.name} />}
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
