import { PageSection } from "@/components/page-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { SeasonTimelineCard } from "@/components/season-timeline-card";
import { EmptyState } from "@/components/empty-state";
import { getSeasonStandings } from "@/lib/queries/seasons";
import { getSeasonTimelineData } from "@/lib/queries/history";
import { getLatestSeason } from "@/lib/queries/matchups";
import { getNflState } from "@/lib/queries/nfl-state";
import { resolveHubSeasonType, isPreWeekOne, seasonTypeBadgeLabel } from "@/lib/hub/season-state";

// ISR: rendered once, then served from cache until a successful sync calls
// revalidatePath("/", "layout"). Time window is only a backstop (lib/cache.ts).
export const revalidate = 3600;

export const metadata = {
  title: "League History | Harambe Memorial League Memorial League",
  description:
    "Every season in HMLML history, from the legacy era to today.",
};

export default async function HistoryPage() {
  let timelineData: Awaited<ReturnType<typeof getSeasonTimelineData>> = [];

  try {
    timelineData = await getSeasonTimelineData();
  } catch {
    // DB may not be connected
  }

  // The newest row's badge can otherwise disagree with the hub banner (e.g.
  // raw DB status "in_season" while Sleeper/the hub calendar says preseason).
  // Recompute it via the same seasonal logic the hub uses, for that row only.
  // getSeasonTimelineData's rows carry no `id`, so the season id comes from
  // getLatestSeason() instead (it's the same latest row by seasonYear).
  let latestSeasonBadge: string | null = null;
  const latestSeasonRow = timelineData[0];
  if (latestSeasonRow && latestSeasonRow.status !== "complete") {
    try {
      const [nflState, latestSeason] = await Promise.all([
        getNflState(),
        getLatestSeason(),
      ]);
      const standings =
        latestSeason && latestSeason.seasonYear === latestSeasonRow.seasonYear
          ? await getSeasonStandings(latestSeason.id)
          : [];
      const seasonType = resolveHubSeasonType({
        nflSeasonType: nflState?.seasonType ?? null,
        dbSeasonStatus: latestSeasonRow.status,
        hasLiveMatchups: false,
        nothingPlayedYet: isPreWeekOne(standings),
      });
      latestSeasonBadge = seasonTypeBadgeLabel(seasonType);
    } catch {
      // Fall back to the card's own status-derived label
    }
  }

  return (
    <>
      <PageSection label="League History" title="The Timeline.">
        <p className="text-body-lg text-text-secondary max-w-prose">
          Every season in Harambe Memorial League Memorial League history.
          From the 10-team legacy era to the current 12-team dynasty format.
        </p>
      </PageSection>

      <section className="pb-8 md:pb-12 space-y-6">
        {timelineData.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No Season Data"
            description="Season history will appear once data has been synced from Sleeper."
          />
        ) : (
          timelineData.map((season, index) => (
            <ScrollReveal key={season.seasonYear} delay={index * 40}>
              <SeasonTimelineCard
                seasonYear={season.seasonYear}
                teamCount={season.teamCount}
                championName={season.championName}
                championSlug={season.championSlug}
                championAvatarUrl={season.championAvatarUrl}
                runnerUpName={season.runnerUpName}
                mostPF={season.mostPF}
                isLegacy={season.isLegacy}
                status={season.status}
                badgeLabel={index === 0 ? latestSeasonBadge : null}
              />
            </ScrollReveal>
          ))
        )}
      </section>
    </>
  );
}
