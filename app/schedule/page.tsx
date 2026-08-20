import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { EmptyState } from "@/components/empty-state";
import { MatchupRow } from "@/components/matchup-row";
import { ScrollReveal } from "@/components/scroll-reveal";
import { SeasonPicker } from "@/components/season-picker";
import { getLatestSeason, getSeasonByYearSimple } from "@/lib/queries/matchups";
import { getAllSeasons } from "@/lib/queries/seasons";
import { getSeasonSchedule } from "@/lib/queries/schedule";

interface SchedulePageProps {
  searchParams: Promise<{ season?: string }>;
}

// ISR: rendered once, then served from cache until a successful sync calls
// revalidatePath("/", "layout"). Time window is only a backstop (lib/cache.ts).
export const revalidate = 3600;

export async function generateMetadata({ searchParams }: SchedulePageProps) {
  const { season } = await searchParams;
  const year = season ? parseInt(season, 10) : null;
  return {
    title: year
      ? `${year} Schedule | Harambe Memorial League Memorial League`
      : "Schedule | Harambe Memorial League Memorial League",
    description:
      "Full season schedule for the Harambe Memorial League Memorial League: every week, every matchup.",
  };
}

function getVariant(status: string): "live" | "final" | "preview" {
  if (status === "in_progress") return "live";
  if (status === "complete") return "final";
  return "preview";
}

export default async function SchedulePage({
  searchParams,
}: SchedulePageProps) {
  const { season } = await searchParams;
  const requestedYear = season ? parseInt(season, 10) : null;

  let allSeasons: Awaited<ReturnType<typeof getAllSeasons>> = [];
  let latestSeason: Awaited<ReturnType<typeof getLatestSeason>> = null;

  try {
    [allSeasons, latestSeason] = await Promise.all([
      getAllSeasons(),
      getLatestSeason(),
    ]);
  } catch {
    // DB may not be connected in dev
  }

  let activeSeason: { id: number; seasonYear: number } | null = null;

  if (requestedYear && !isNaN(requestedYear)) {
    const bySlug = await getSeasonByYearSimple(requestedYear).catch(
      () => null
    );
    if (bySlug) {
      activeSeason = { id: bySlug.id, seasonYear: bySlug.seasonYear };
    }
  }

  if (!activeSeason && latestSeason) {
    activeSeason = { id: latestSeason.id, seasonYear: latestSeason.seasonYear };
  }

  if (!activeSeason) {
    return (
      <PageSection label="Season Schedule" title="Schedule.">
        <EmptyState
          icon="calendar"
          title="No Schedule Available"
          description="Schedule data will appear once a season is synced from Sleeper."
          actionLabel="Browse league history"
          actionHref="/seasons"
        />
      </PageSection>
    );
  }

  let scheduleByWeek: Awaited<ReturnType<typeof getSeasonSchedule>> =
    new Map();
  try {
    scheduleByWeek = await getSeasonSchedule(activeSeason.id);
  } catch {
    // Schedule data may not be available
  }

  const seasonYears = allSeasons.map((s) => s.seasonYear);

  return (
    <>
      <PageSection label="Season Schedule" title={`${activeSeason.seasonYear} Schedule.`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-body-lg text-text-secondary">
            Every week, every matchup, all season long.
          </p>
          {seasonYears.length > 1 && (
            <SeasonPicker
              seasons={seasonYears}
              activeSeason={activeSeason.seasonYear}
            />
          )}
        </div>
      </PageSection>

      {scheduleByWeek.size === 0 ? (
        <EmptyState
          icon="calendar"
          title="No Schedule Available"
          description="Schedule data will appear once matchups are synced from Sleeper for this season."
        />
      ) : (
        <section className="pb-8 md:pb-12 space-y-10">
          {[...scheduleByWeek.entries()].map(([week, weekMatchups]) => (
            <div key={week} className="space-y-4">
              <h3 className="text-h3">
                Week <span className="font-mono tabular-nums">{week}</span>
              </h3>
              <div className="space-y-3">
                {weekMatchups.map((matchup, index) => (
                  <ScrollReveal key={matchup.matchupId} delay={index * 40}>
                    <Link
                      href={`/matchups/${activeSeason.seasonYear}/${week}/${matchup.matchupId}`}
                      className="block rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                      aria-label={`${matchup.homeTeam.franchiseName} versus ${matchup.awayTeam.franchiseName}, view detail`}
                    >
                      <MatchupRow
                        matchup={{
                          homeTeam: matchup.homeTeam,
                          awayTeam: matchup.awayTeam,
                          homeScore: matchup.homeTeam.points,
                          awayScore: matchup.awayTeam.points,
                          status: matchup.status,
                          matchupId: matchup.matchupId,
                        }}
                        variant={getVariant(matchup.status)}
                      />
                    </Link>
                  </ScrollReveal>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
