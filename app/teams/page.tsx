import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { EmptyState } from "@/components/empty-state";
import { getAllFranchises } from "@/lib/queries/franchises";

export const metadata = {
  title: "Franchises | Harambe Memorial League Memorial League",
  description:
    "Every franchise in the Harambe Memorial League Memorial League — rosters, records, and dynasty histories.",
};

export default async function TeamsPage() {
  let franchises: Awaited<ReturnType<typeof getAllFranchises>> = null;

  try {
    franchises = await getAllFranchises();
  } catch {
    // DB may not be connected in dev
  }

  if (!franchises || franchises.length === 0) {
    return (
      <PageSection label="Franchises" title="Teams">
        <EmptyState
          icon="users"
          title="Loading Franchises"
          description="Franchise data is syncing from Sleeper. Check back shortly."
        />
      </PageSection>
    );
  }

  return (
    <PageSection label="Franchises" title="Teams">
      <p className="text-body-lg text-muted-foreground max-w-prose">
        Every franchise in the Harambe Memorial League Memorial League — rosters, records, and
        dynasty histories.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 sm:gap-8">
        {franchises.map((franchise, index) => (
          <ScrollReveal key={franchise.id} delay={index * 60}>
            <Link
              href={`/teams/${franchise.slug}`}
              className="group block rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-card/80"
              style={{ borderTopWidth: "3px", borderTopColor: franchise.brandingColor ?? "var(--border)" }}
            >
              <FranchiseIdentity
                franchise={{
                  slug: franchise.slug,
                  name: franchise.name,
                  abbreviation: franchise.abbreviation,
                  brandingColor: franchise.brandingColor,
                }}
                championships={franchise.championships}
                ownerName={franchise.ownerName}
                coOwnerName={franchise.coOwnerName}
                variant="standard"
              />
              <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                <span className="tabular-nums">
                  <span className="font-bold text-foreground">
                    {franchise.totalWins}
                  </span>
                  <span className="ml-0.5">W</span>
                  <span className="mx-1">-</span>
                  <span>{franchise.totalLosses}</span>
                  <span className="ml-0.5">L</span>
                </span>
                <span className="tabular-nums">
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
