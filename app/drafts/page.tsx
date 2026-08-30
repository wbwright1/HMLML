import Link from "next/link";
import { rethrowUnlessTolerable } from "@/lib/db-guard";
import { db } from "@/lib/db";
import { seasons } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { PageSection } from "@/components/page-section";
import { EmptyState } from "@/components/empty-state";
import { ScrollReveal } from "@/components/scroll-reveal";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { getDraftsByYear } from "@/lib/queries/drafts";

// ISR: rendered once, then served from cache until a successful sync calls
// revalidatePath("/", "layout"). Time window is only a backstop (lib/cache.ts).
export const revalidate = 3600;

export const metadata = {
  title: "Drafts | Harambe Memorial League Memorial League",
  description:
    "Complete draft boards and pick-by-pick results for every Harambe Memorial League Memorial League draft.",
};

export default async function DraftsPage() {
  let drafts: Awaited<ReturnType<typeof getDraftsByYear>> = [];
  let upcomingSeasonYear: number | null = null;

  try {
    drafts = await getDraftsByYear();

    // Check if there's an upcoming season with no draft picks yet
    const [latestSeason] = await db
      .select({ seasonYear: seasons.seasonYear, status: seasons.status })
      .from(seasons)
      .orderBy(desc(seasons.seasonYear))
      .limit(1);

    if (latestSeason) {
      const hasDraftForYear = drafts.some((d) => d.seasonYear === latestSeason.seasonYear);
      if (!hasDraftForYear) {
        upcomingSeasonYear = latestSeason.seasonYear;
      }
    }
  } catch (e) {
    rethrowUnlessTolerable(e);
    // DB may not be connected in dev
  }

  if (drafts.length === 0 && !upcomingSeasonYear) {
    return (
      <PageSection label="Draft Room" title="The Drafts.">
        <EmptyState
          icon="calendar"
          title="No Draft Data"
          description="Draft history will appear once draft data has been synced from Sleeper."
          actionLabel="Browse seasons"
          actionHref="/seasons"
        />
      </PageSection>
    );
  }

  // Group drafts by season year for display
  const draftsByYear = new Map<number, typeof drafts>();
  for (const draft of drafts) {
    if (!draftsByYear.has(draft.seasonYear)) {
      draftsByYear.set(draft.seasonYear, []);
    }
    draftsByYear.get(draft.seasonYear)!.push(draft);
  }

  const years = Array.from(draftsByYear.keys()).sort((a, b) => b - a);

  // "Fresh off the board": when there is no upcoming (undrafted) season to
  // headline, spotlight the newest COMPLETED draft so a just-synced rookie
  // board is the first thing anyone sees. The remaining years list normally.
  const spotlightYear =
    !upcomingSeasonYear && years.length > 0 ? years[0] : null;
  const spotlightDrafts = spotlightYear
    ? draftsByYear.get(spotlightYear)!
    : [];

  return (
    <PageSection label="Draft Room" title="The Drafts.">
      <p className="text-body-lg text-text-tertiary max-w-prose">
        Complete draft boards and pick-by-pick results for every Harambe
        Memorial League draft.
      </p>

      <div className="mt-8 space-y-4">
        {spotlightYear && (
          <ScrollReveal>
            <Link
              href={`/drafts/${spotlightYear}`}
              className="group block rounded-[14px] border border-accent-gold/30 bg-accent-gold-light p-6 transition-colors hover:border-accent-gold/50"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-h2 group-hover:text-accent-gold transition-colors">
                      {spotlightYear}
                    </span>
                    <SuperlativeBadge text="Fresh off the board" variant="gold" />
                    {spotlightDrafts.map((d) => (
                      <SuperlativeBadge
                        key={d.draftId}
                        text={d.draftType === "startup" ? "Startup" : "Rookie"}
                        variant={d.draftType === "startup" ? "gold" : "neutral"}
                      />
                    ))}
                  </div>
                  <p className="text-body-sm text-text-secondary max-w-prose">
                    The newest board is in the books.{" "}
                    {spotlightDrafts.reduce((sum, d) => sum + d.pickCount, 0)}{" "}
                    picks, every reach and every steal on the record. See who won
                    the room.
                  </p>
                </div>
                <span
                  className="shrink-0 text-accent-gold group-hover:translate-x-0.5 transition-transform"
                  aria-hidden="true"
                >
                  &rarr;
                </span>
              </div>
            </Link>
          </ScrollReveal>
        )}
        {upcomingSeasonYear && (
          <ScrollReveal>
            <Link
              href={`/drafts/${upcomingSeasonYear}`}
              className="group flex items-center justify-between rounded-[14px] border border-accent-gold/30 bg-accent-gold-light p-5 transition-colors hover:border-accent-gold/50"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-h3 group-hover:text-accent-gold transition-colors">
                    {upcomingSeasonYear}
                  </span>
                  <SuperlativeBadge text="Upcoming" variant="gold" />
                  <SuperlativeBadge text="Rookie" variant="neutral" />
                </div>
                <p className="text-body-sm text-text-tertiary">
                  Draft board preview
                </p>
              </div>
              <span
                className="text-text-tertiary group-hover:text-accent-gold transition-colors"
                aria-hidden="true"
              >
                &rarr;
              </span>
            </Link>
          </ScrollReveal>
        )}
        {years.map((year, yearIndex) => {
          const yearDrafts = draftsByYear.get(year)!;

          return yearDrafts.map((draft, draftIndex) => (
            <ScrollReveal
              key={draft.draftId}
              delay={(yearIndex * yearDrafts.length + draftIndex) * 50}
            >
              <Link
                href={`/drafts/${year}`}
                className="group flex items-center justify-between rounded-[14px] border border-border bg-surface p-5 transition-colors hover:border-accent-gold/40 hover:bg-surface-muted"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-h3 group-hover:text-accent-gold transition-colors">
                      {year}
                    </span>
                    <DraftTypeBadge
                      draftType={draft.draftType}
                      isLegacyEra={draft.isLegacyEra}
                    />
                  </div>
                  <p className="text-body-sm text-text-tertiary">
                    {draft.pickCount} picks
                  </p>
                </div>

                <span
                  className="text-text-tertiary group-hover:text-accent-gold transition-colors"
                  aria-hidden="true"
                >
                  &rarr;
                </span>
              </Link>
            </ScrollReveal>
          ));
        })}
      </div>
    </PageSection>
  );
}

function DraftTypeBadge({
  draftType,
  isLegacyEra,
}: {
  draftType: string;
  isLegacyEra: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <SuperlativeBadge
        text={draftType === "startup" ? "Startup" : "Rookie"}
        variant={draftType === "startup" ? "gold" : "neutral"}
      />
      {isLegacyEra && (
        <span className="text-caption text-text-tertiary bg-surface-muted px-2 py-0.5 rounded-full">
          Legacy Era
        </span>
      )}
    </div>
  );
}
