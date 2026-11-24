import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { PageSection } from "@/components/page-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { EmptyState } from "@/components/empty-state";
import { WeekBanner } from "@/components/week-banner";
import { ScorePoller } from "@/app/matchups/score-poller";
import { getCurrentWeekMatchups, getLatestSeason } from "@/lib/queries/matchups";
import { GameCard } from "@/components/hub/shared";
import { getWinnersRoundNames } from "@/lib/playoff-bracket";

export async function PlayoffsHub({
  matchupData,
  latestSeason,
  nflWeek,
  hasLiveGames,
}: {
  matchupData: Awaited<ReturnType<typeof getCurrentWeekMatchups>>;
  latestSeason: Awaited<ReturnType<typeof getLatestSeason>>;
  nflWeek: number;
  hasLiveGames: boolean;
}) {
  const week = matchupData?.week ?? nflWeek;
  const seasonYear = matchupData?.seasonYear ?? latestSeason?.seasonYear ?? new Date().getFullYear();
  const gamesInProgress = matchupData?.matchups.filter((m) => m.status === "in_progress").length ?? 0;

  // Determine playoff round name. Names come from lib/playoff-bracket.ts so
  // the hub banner and the bracket page cannot call the same round two
  // different things.
  const playoffWeekStart = latestSeason?.playoffWeekStart ?? 15;
  const roundOffset = week - playoffWeekStart;
  const roundNames = getWinnersRoundNames(3);
  const playoffRound = roundNames[Math.min(roundOffset, roundNames.length - 1)] ?? `Playoff Week ${week}`;

  return (
    <>
      {/* Week Banner (Playoff Variant) */}
      <WeekBanner
        week={week}
        seasonYear={seasonYear}
        state="playoff"
        gamesInProgress={gamesInProgress}
        playoffRound={playoffRound}
      />

      {/* Playoff Matchups */}
      {matchupData && matchupData.matchups.length > 0 && (
        <ScrollReveal>
          <PageSection
            label={`${seasonYear} playoffs`}
            title={playoffRound}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {matchupData.matchups.map((matchup) => (
                <GameCard
                  key={matchup.matchupId}
                  matchup={matchup}
                  week={week}
                  seasonYear={seasonYear}
                />
              ))}
            </div>

            {hasLiveGames && (
              <ScorePoller initialIsGameWindow={hasLiveGames} />
            )}
          </PageSection>
        </ScrollReveal>
      )}

      {/* Link to full bracket */}
      <ScrollReveal>
        <div className="text-center py-8">
          <Link
            href={`/playoffs/${seasonYear}`}
            className={buttonVariants({ variant: "quiet", size: "default" })}
          >
            Full playoff bracket
            <ChevronRight aria-hidden="true" strokeWidth={2} data-icon="inline-end" />
          </Link>
        </div>
      </ScrollReveal>

      {/* Fallback */}
      {(!matchupData || matchupData.matchups.length === 0) && (
        <EmptyState
          icon="trophy"
          title="Playoffs Underway"
          description="Playoff matchups will appear here once they begin."
        />
      )}
    </>
  );
}
