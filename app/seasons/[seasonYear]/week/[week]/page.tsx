import { notFound } from "next/navigation";
import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { MatchupRow } from "@/components/matchup-row";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { ScrollReveal } from "@/components/scroll-reveal";
import { EmptyState } from "@/components/empty-state";
import {
  getMatchupsByWeek,
  getSeasonByYearSimple,
} from "@/lib/queries/matchups";

interface WeekResultsPageProps {
  params: Promise<{ seasonYear: string; week: string }>;
}

export async function generateMetadata({ params }: WeekResultsPageProps) {
  const { seasonYear, week } = await params;
  return {
    title: `${seasonYear} Week ${week} Results | Harambe Memorial League Memorial League`,
    description: `Matchup results for Week ${week} of the ${seasonYear} Harambe Memorial League Memorial League season.`,
  };
}

export default async function WeekResultsPage({
  params,
}: WeekResultsPageProps) {
  const { seasonYear, week: weekStr } = await params;
  const year = parseInt(seasonYear, 10);
  const week = parseInt(weekStr, 10);

  if (isNaN(year) || isNaN(week) || week < 1) {
    notFound();
  }

  let season: Awaited<ReturnType<typeof getSeasonByYearSimple>> = null;

  try {
    season = await getSeasonByYearSimple(year);
  } catch {
    // DB may not be connected
  }

  if (!season) {
    notFound();
  }

  let matchups: Awaited<ReturnType<typeof getMatchupsByWeek>> = [];

  try {
    matchups = await getMatchupsByWeek(season.id, week);
  } catch {
    // Matchup data may not be available
  }

  // Check if next week has data (for navigation)
  let nextWeekHasData = false;
  try {
    const nextWeekMatchups = await getMatchupsByWeek(season.id, week + 1);
    nextWeekHasData = nextWeekMatchups.length > 0;
  } catch {
    // ignore
  }

  const isPlayoffWeek =
    season.playoffWeekStart != null && week >= season.playoffWeekStart;

  // Determine variant based on matchup statuses
  const allComplete = matchups.every((m) => m.status === "complete");
  const hasLive = matchups.some((m) => m.status === "in_progress");

  return (
    <>
      <PageSection
        label={`${year} Season${isPlayoffWeek ? " — Playoffs" : ""}`}
        title={`Week ${week}`}
      >
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href={`/seasons/${year}`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; {year} Season
          </Link>

          {isPlayoffWeek && (
            <SuperlativeBadge text="Playoff Week" variant="gold" />
          )}

          {hasLive && <SuperlativeBadge text="In Progress" variant="green" />}
          {allComplete && matchups.length > 0 && (
            <SuperlativeBadge text="Final" variant="neutral" />
          )}
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-3 mt-4">
          {week > 1 ? (
            <Link
              href={`/seasons/${year}/week/${week - 1}`}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              &larr; Week {week - 1}
            </Link>
          ) : (
            <span />
          )}
          {nextWeekHasData && (
            <Link
              href={`/seasons/${year}/week/${week + 1}`}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              Week {week + 1} &rarr;
            </Link>
          )}
        </div>
      </PageSection>

      <section className="pb-8 md:pb-12 space-y-6">
        {matchups.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No Matchup Data"
            description="No matchup data available for this week."
            actionLabel={`Back to ${year} season`}
            actionHref={`/seasons/${year}`}
          />
        ) : (
          matchups.map((matchup, index) => (
            <ScrollReveal key={matchup.matchupId} delay={index * 40}>
              <MatchupRow
                matchup={{
                  homeTeam: matchup.homeTeam,
                  awayTeam: matchup.awayTeam,
                  homeScore: matchup.homeTeam.points,
                  awayScore: matchup.awayTeam.points,
                  status: matchup.status,
                  matchupId: matchup.matchupId,
                }}
                variant={
                  matchup.status === "in_progress"
                    ? "live"
                    : matchup.status === "complete"
                      ? "final"
                      : "preview"
                }
              />
            </ScrollReveal>
          ))
        )}
      </section>
    </>
  );
}
