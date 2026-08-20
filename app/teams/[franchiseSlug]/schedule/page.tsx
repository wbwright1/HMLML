import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FranchiseLogo } from "@/components/franchise-logo";
import { EmptyState } from "@/components/empty-state";
import { FranchiseScheduleRow } from "@/components/franchise-schedule-row";
import { getFranchiseBySlug } from "@/lib/queries/franchises";
import { getFranchiseSchedule } from "@/lib/queries/schedule";

interface FranchiseSchedulePageProps {
  params: Promise<{ franchiseSlug: string }>;
  searchParams: Promise<{ season?: string }>;
}

// ISR: rendered once, then served from cache until a successful sync calls
// revalidatePath("/", "layout"). Time window is only a backstop (lib/cache.ts).
export const revalidate = 3600;

export async function generateMetadata({ params }: FranchiseSchedulePageProps) {
  const { franchiseSlug } = await params;

  let franchise: Awaited<ReturnType<typeof getFranchiseBySlug>> = null;
  try {
    franchise = await getFranchiseBySlug(franchiseSlug);
  } catch {
    // DB may not be connected in dev
  }

  if (!franchise) {
    return { title: "Schedule Not Found | Harambe Memorial League Memorial League" };
  }

  return {
    title: `${franchise.name} Schedule | Harambe Memorial League Memorial League`,
    description: `Full season schedule for ${franchise.name} in the Harambe Memorial League Memorial League.`,
  };
}

export default async function FranchiseSchedulePage({
  params,
  searchParams,
}: FranchiseSchedulePageProps) {
  const { franchiseSlug } = await params;
  const { season: seasonParam } = await searchParams;

  let franchise: Awaited<ReturnType<typeof getFranchiseBySlug>> = null;

  try {
    franchise = await getFranchiseBySlug(franchiseSlug);
  } catch {
    // DB may not be connected in dev
  }

  if (!franchise) {
    notFound();
  }

  // Select the requested season (?season=YEAR) if it exists for this franchise;
  // otherwise fall back to the most recent season, same convention as the
  // roster sub-route. seasonHistory is ordered newest-first.
  const requestedYear = seasonParam ? parseInt(seasonParam, 10) : NaN;
  const latestSeason =
    (!Number.isNaN(requestedYear)
      ? franchise.seasonHistory.find((s) => s.seasonYear === requestedYear)
      : undefined) ?? franchise.seasonHistory[0];

  let schedule: Awaited<ReturnType<typeof getFranchiseSchedule>> = [];

  if (latestSeason) {
    try {
      schedule = await getFranchiseSchedule(
        franchise.id,
        latestSeason.seasonId
      );
    } catch {
      // Schedule data may not be available
    }
  }

  return (
    <section className="py-8 md:py-12 space-y-8">
      <ScrollReveal>
        <div className="space-y-6">
          <BackLink href={`/teams/${franchise.slug}`} label={franchise.name} />

          <div className="flex items-center gap-4">
            <div
              className="shrink-0"
              style={
                franchise.brandingColor
                  ? {
                      boxShadow: `0 0 0 2px ${franchise.brandingColor}`,
                      borderRadius: "13px",
                    }
                  : undefined
              }
            >
              <FranchiseLogo
                slug={franchise.slug}
                name={franchise.name}
                abbreviation={franchise.abbreviation}
                brandingColor={franchise.brandingColor}
                avatarUrl={franchise.avatarUrl}
                size="md"
                decorative
              />
            </div>
            <div>
              <h1 className="text-h2">{franchise.name}</h1>
              {latestSeason && (
                <p className="text-body-sm text-text-tertiary mt-1">
                  <span className="font-mono tabular-nums">
                    {latestSeason.seasonYear}
                  </span>{" "}
                  Schedule
                </p>
              )}
            </div>
          </div>
        </div>
      </ScrollReveal>

      {schedule.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="No Schedule Available"
          description="Schedule data will appear once matchups are synced from Sleeper."
        />
      ) : (
        <ScrollReveal delay={80}>
          <div className="space-y-3">
            {schedule.map((week) => (
              <FranchiseScheduleRow
                key={week.matchupId}
                week={week}
                seasonYear={latestSeason!.seasonYear}
              />
            ))}
          </div>
        </ScrollReveal>
      )}
    </section>
  );
}
