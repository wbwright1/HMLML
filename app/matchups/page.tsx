import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { EmptyState } from "@/components/empty-state";
import { MatchupRow } from "@/components/matchup-row";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { ScrollReveal } from "@/components/scroll-reveal";
import { ScorePoller } from "./score-poller";
import { getCurrentWeekMatchups } from "@/lib/queries/matchups";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Matchups | Harambe Memorial League Memorial League",
  description:
    "This week's matchups and scores in the Harambe Memorial League Memorial League.",
};

export default async function MatchupsPage() {
  let data: Awaited<ReturnType<typeof getCurrentWeekMatchups>> = null;

  try {
    data = await getCurrentWeekMatchups();
  } catch {
    // DB may not be connected in dev
  }

  if (!data || data.matchups.length === 0) {
    return (
      <PageSection label="Head to Head" title="Matchups.">
        <EmptyState
          icon="calendar"
          title="No Matchups Available"
          description="Matchup data will appear once the season begins and scores are synced from Sleeper."
          actionLabel="Browse league history"
          actionHref="/seasons"
        />
      </PageSection>
    );
  }

  const { matchups, seasonYear, week } = data;

  // Determine variant based on matchup status
  const getVariant = (status: string): "live" | "final" | "preview" => {
    if (status === "in_progress") return "live";
    if (status === "complete") return "final";
    return "preview";
  };

  // Are any matchups live or scheduled?
  const hasLiveMatchups = matchups.some((m) => m.status === "in_progress");
  const allComplete = matchups.every((m) => m.status === "complete");
  const allScheduled = matchups.every((m) => m.status === "scheduled");

  return (
    <>
      <PageSection label={`${seasonYear} Season`} title={`Week ${week}.`}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-body-lg text-text-secondary">
            {allComplete
              ? "Final results"
              : hasLiveMatchups
                ? "Scores are updating live"
                : allScheduled
                  ? "Upcoming matchups"
                  : "Matchups in progress"}
          </p>
          {hasLiveMatchups && <SuperlativeBadge text="Live" variant="green" />}
          {allComplete && <SuperlativeBadge text="Final" variant="neutral" />}
        </div>

        {/* Week navigation links */}
        <div className="flex flex-wrap items-center gap-4 mt-2">
          {week > 1 && (
            <Link
              href={`/seasons/${seasonYear}/week/${week - 1}`}
              className="text-body-sm text-text-tertiary hover:text-text-primary transition-colors"
            >
              &larr; Week {week - 1}
            </Link>
          )}
          <Link
            href={`/seasons/${seasonYear}`}
            className="text-body-sm text-accent-gold hover:brightness-110 transition-colors"
          >
            Full {seasonYear} Season
          </Link>
        </div>
      </PageSection>

      <section className="pb-8 md:pb-12 space-y-4">
        {matchups.map((matchup, index) => (
          <ScrollReveal key={matchup.matchupId} delay={index * 40}>
            <Link
              href={`/matchups/${seasonYear}/${week}/${matchup.matchupId}`}
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

        {/* Live score polling -- renders only during game windows */}
        <ScorePoller initialIsGameWindow={hasLiveMatchups} />
      </section>
    </>
  );
}
