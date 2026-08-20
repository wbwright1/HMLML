import Link from "next/link";
import { rethrowUnlessTolerable } from "@/lib/db-guard";
import { PageSection } from "@/components/page-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { EmptyState } from "@/components/empty-state";
import { getAllFranchises } from "@/lib/queries/franchises";

// ISR: rendered once, then served from cache until a successful sync calls
// revalidatePath("/", "layout"). Time window is only a backstop (lib/cache.ts).
export const revalidate = 3600;

export const metadata = {
  title: "Franchises | Harambe Memorial League Memorial League",
  description:
    "Every franchise in the Harambe Memorial League Memorial League: rosters, records, and dynasty histories.",
};

export default async function TeamsPage() {
  let franchises: Awaited<ReturnType<typeof getAllFranchises>> = null;

  try {
    franchises = await getAllFranchises();
  } catch (e) {
    rethrowUnlessTolerable(e);
    // DB may not be connected in dev
  }

  if (!franchises || franchises.length === 0) {
    return (
      <PageSection label="Franchises" title="Teams.">
        <EmptyState
          icon="users"
          title="Loading Franchises"
          description="Franchise data is syncing from Sleeper. Check back shortly."
        />
      </PageSection>
    );
  }

  return (
    <PageSection label="Franchises" title="Teams.">
      <p className="text-body-lg text-text-tertiary max-w-prose">
        Every franchise in the Harambe Memorial League Memorial League: rosters, records, and
        dynasty histories.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 sm:gap-8">
        {franchises.map((franchise, index) => (
          <ScrollReveal key={franchise.id} delay={index * 60}>
            <Link
              href={`/teams/${franchise.slug}`}
              className="group block card-surface p-5 sm:p-6 transition-colors duration-150 hover:border-border-strong"
            >
              <FranchiseIdentity
                franchise={{
                  slug: franchise.slug,
                  name: franchise.name,
                  abbreviation: franchise.abbreviation,
                  brandingColor: franchise.brandingColor,
                  avatarUrl: franchise.avatarUrl,
                }}
                championships={franchise.championships}
                ownerName={franchise.ownerName}
                coOwnerName={franchise.coOwnerName}
                variant="standard"
              />
              <div className="mt-4 flex items-center justify-between border-t border-divider pt-3 text-sm">
                <span className="font-mono tabular-nums">
                  <span className="font-bold text-text-primary">
                    {franchise.totalWins}
                  </span>
                  <span className="ml-0.5 text-text-tertiary">W</span>
                  <span className="mx-1 text-text-tertiary">-</span>
                  <span className="text-text-secondary">{franchise.totalLosses}</span>
                  <span className="ml-0.5 text-text-tertiary">L</span>
                </span>
                <span className="font-mono tabular-nums text-text-tertiary">
                  {franchise.totalPointsScored.toFixed(1)} pts
                </span>
              </div>
            </Link>
          </ScrollReveal>
        ))}
      </div>
    </PageSection>
  );
}
