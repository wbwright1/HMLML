import { PageSection } from "@/components/page-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { SeasonTimelineCard } from "@/components/season-timeline-card";
import { EmptyState } from "@/components/empty-state";
import { getAllSeasons } from "@/lib/queries/seasons";
import { getSeasonTimelineData } from "@/lib/queries/history";

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

  return (
    <>
      <PageSection label="All-Time" title="League History">
        <p className="text-body-lg text-muted-foreground max-w-prose">
          Every season in Harambe Memorial League Memorial League history.
          From the 10-team legacy era to the current 12-team dynasty format.
        </p>
      </PageSection>

      <section className="pb-24 space-y-3">
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
                runnerUpName={season.runnerUpName}
                mostPF={season.mostPF}
                isLegacy={season.isLegacy}
                status={season.status}
              />
            </ScrollReveal>
          ))
        )}
      </section>
    </>
  );
}
