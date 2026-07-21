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

export const dynamic = "force-dynamic";

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
        label={`${year} Season${isPlayoffWeek ? " · Playoffs" : ""}`}
        title={`Week ${week}.`}
      >
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href={`/seasons/${year}`}
            className="text-body-sm text-text-tertiary hover:text-text-primary transition-colors"
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
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-4 py-1.5 text-body-sm font-medium text-text-tertiary hover:text-text-primary hover:bg-surface-muted transition-colors"
            >
              &larr; Week <span className="font-mono tabular-nums">{week - 1}</span>
            </Link>
          ) : (
            <span />
          )}
          {nextWeekHasData && (
            <Link
              href={`/seasons/${year}/week/${week + 1}`}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-4 py-1.5 text-body-sm font-medium text-text-tertiary hover:text-text-primary hover:bg-surface-muted transition-colors"
            >
              Week <span className="font-mono tabular-nums">{week + 1}</span> &rarr;
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
              <Link
                href={`/matchups/${year}/${week}/${matchup.matchupId}`}
                className="block rounded-lg transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={`View matchup detail: ${matchup.homeTeam.franchiseName} versus ${matchup.awayTeam.franchiseName}`}
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
                  variant={
                    matchup.status === "in_progress"
                      ? "live"
                      : matchup.status === "complete"
                        ? "final"
                        : "preview"
                  }
                />
              </Link>
            </ScrollReveal>
          ))
        )}
      </section>
    </>
  );
}
