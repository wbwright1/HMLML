import Link from "next/link";
import { rethrowUnlessTolerable } from "@/lib/db-guard";
import { PageSection } from "@/components/page-section";
import { BrandedCrest } from "@/components/franchise-identity";
import { ChampionshipStars } from "@/components/championship-stars";
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
      <PageSection
        as="h1"
        title="Teams"
        intro="All 12 franchises, with rosters and history."
      >
        <EmptyState
          icon="users"
          title="Loading Franchises"
          description="Franchise data is syncing from Sleeper. Check back shortly."
        />
      </PageSection>
    );
  }

  return (
    <PageSection
      as="h1"
      title="Teams"
      intro="All 12 franchises, with rosters and history."
    >
      <div className="max-w-3xl">
        <div
          className="flex justify-between pb-2 pl-[76px] pr-4"
          aria-hidden="true"
        >
          <span className="text-kicker">Franchise</span>
          <span className="text-kicker">All-time</span>
        </div>
        <ul
          className="card-surface divide-y divide-divider px-2"
          data-testid="franchise-list"
        >
          {franchises.map((franchise) => {
            const owner = franchise.ownerName
              ? `${franchise.ownerName}${
                  franchise.coOwnerName ? ` & ${franchise.coOwnerName}` : ""
                }`
              : null;
            return (
              <li key={franchise.id}>
                <Link
                  href={`/teams/${franchise.slug}`}
                  className="group flex min-h-[72px] items-center gap-3 rounded-lg px-2 py-3 transition-[background-color,scale] duration-150 hover:bg-surface-muted active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  <BrandedCrest
                    franchise={{
                      slug: franchise.slug,
                      name: franchise.name,
                      abbreviation: franchise.abbreviation,
                      brandingColor: franchise.brandingColor,
                      avatarUrl: franchise.avatarUrl,
                    }}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-body font-semibold text-text-primary transition-colors group-hover:text-accent-gold">
                        {franchise.name}
                      </span>
                      <span className="shrink-0">
                        <ChampionshipStars count={franchise.championships} />
                      </span>
                    </div>
                    {owner && (
                      <p
                        className="truncate text-body-sm text-text-tertiary"
                        data-testid="franchise-owner"
                      >
                        {owner}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="font-mono text-body font-bold tabular-nums text-text-primary">
                      {franchise.totalWins}-{franchise.totalLosses}
                    </span>
                    <span className="text-caption text-text-tertiary">
                      <span className="font-mono tabular-nums">
                        {franchise.totalPointsScored.toLocaleString(undefined, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}
                      </span>{" "}
                      pts
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </PageSection>
  );
}
