import { notFound } from "next/navigation";
import { rethrowUnlessTolerable } from "@/lib/db-guard";
import Link from "next/link";
import { FranchiseLogo } from "@/components/franchise-logo";
import { MatchupLiveScore } from "@/components/matchup-live-score";
import { MatchupLineups } from "@/components/matchup-lineups";
import {
  getMatchupsByWeek,
  getSeasonByYearSimple,
} from "@/lib/queries/matchups";
import { getMatchupLineups } from "@/lib/queries/player-points";
import { getHubLiveData } from "@/lib/queries/homepage";
import { getRivalryWeek, rivalryPairKey } from "@/lib/queries/rivalry-week";
import { computeWinProbability } from "@/lib/win-probability";
import { deriveLiveAside } from "@/lib/live-aside";
import type { MatchupTeam } from "@/lib/queries/matchups";
import type { MatchupLineups as MatchupLineupsData } from "@/lib/queries/player-points";

// ISR: rendered once, then served from cache until a successful sync calls
// revalidatePath("/", "layout"). Time window is only a backstop (lib/cache.ts).
export const revalidate = 3600;

interface MatchupDetailPageProps {
  params: Promise<{ seasonYear: string; week: string; matchupId: string }>;
}

export async function generateMetadata({ params }: MatchupDetailPageProps) {
  const { seasonYear, week } = await params;
  return {
    title: `${seasonYear} Week ${week} Matchup | Harambe Memorial League Memorial League`,
    description: `Head-to-head matchup detail for Week ${week} of the ${seasonYear} Harambe Memorial League Memorial League season.`,
  };
}

export default async function MatchupDetailPage({
  params,
}: MatchupDetailPageProps) {
  const { seasonYear, week: weekStr, matchupId: matchupIdStr } = await params;
  const year = parseInt(seasonYear, 10);
  const week = parseInt(weekStr, 10);
  const matchupId = parseInt(matchupIdStr, 10);

  if (isNaN(year) || isNaN(week) || week < 1 || isNaN(matchupId)) {
    notFound();
  }

  let season: Awaited<ReturnType<typeof getSeasonByYearSimple>> = null;
  try {
    season = await getSeasonByYearSimple(year);
  } catch (e) {
    rethrowUnlessTolerable(e);
    // DB may not be connected
  }
  if (!season) {
    notFound();
  }

  // Uncaught on purpose: getMatchupsByWeek rethrows a genuine DB failure
  // itself, so a try/catch here would only be ceremony. A week with no matchups
  // is a real outcome, comes back as an empty array, and 404s below; before
  // #252 a DB outage produced that same 404, which was a cacheable lie.
  const matchups = await getMatchupsByWeek(season.id, week);

  const matchup = matchups.find((m) => m.matchupId === matchupId);
  if (!matchup) {
    notFound();
  }

  const { homeTeam, awayTeam, status } = matchup;
  const isComplete = status === "complete";
  const isLive = status === "in_progress";
  const isUpcoming = !isComplete && !isLive;

  // Winner emphasis: use the recorded flag on final, otherwise the leader.
  const homeWins = isComplete
    ? homeTeam.isWinner === true
    : !isUpcoming && homeTeam.points >= awayTeam.points;
  const awayWins = isComplete
    ? awayTeam.isWinner === true
    : !isUpcoming && awayTeam.points > homeTeam.points;

  let lineups: MatchupLineupsData = {
    seasonId: season.id,
    week,
    matchupId,
    sides: [],
  };
  try {
    lineups = await getMatchupLineups(season.id, week, matchupId);
  } catch {
    // Per-player lineup data may not be available
  }

  // Rivalry Week: is this pairing a mutual-top-rival matchup?
  let isRivalry = false;
  try {
    const rivalrySet = await getRivalryWeek(matchups);
    isRivalry = rivalrySet.has(
      rivalryPairKey(homeTeam.franchiseId, awayTeam.franchiseId)
    );
  } catch {
    // Rivalry data may not be available
  }

  // Live swing-moment aside, computed from the same game-status-based live
  // inputs the hub cards use. Only shown while the game is in progress.
  let aside: string | null = null;
  if (isLive) {
    try {
      const hubLive = await getHubLiveData(season.id, week);
      const homeLeft = hubLive.playersLeft.get(homeTeam.rosterId);
      const awayLeft = hubLive.playersLeft.get(awayTeam.rosterId);
      if (homeLeft != null && awayLeft != null) {
        const winProbHome = computeWinProbability({
          scoreA: homeTeam.points,
          scoreB: awayTeam.points,
          projRemainingA: hubLive.projRemaining.get(homeTeam.rosterId) ?? 0,
          projRemainingB: hubLive.projRemaining.get(awayTeam.rosterId) ?? 0,
        });
        aside = deriveLiveAside({
          homeScore: homeTeam.points,
          awayScore: awayTeam.points,
          winProbHome,
          playersLeft: { home: homeLeft.left, away: awayLeft.left },
        });
      }
    } catch {
      // Live inputs may not be available; no aside
    }
  }

  return (
    <div className="py-4 md:py-6">
      {/* Back link */}
      <Link
        href="/matchups"
        className="inline-flex items-center gap-1.5 text-body-sm text-text-tertiary hover:text-text-primary transition-colors mb-6"
      >
        <span aria-hidden="true">&larr;</span> Hub &middot; Week {week}
      </Link>

      {/* Hero card */}
      <section
        className="card-surface card-glows px-5 py-6 md:px-8 md:py-8"
        aria-label={`${homeTeam.franchiseName} versus ${awayTeam.franchiseName}`}
        {...(isLive ? { "aria-live": "polite" } : {})}
      >
        <div className="grid items-center gap-6 md:grid-cols-[1fr_auto_1fr]">
          {/* Home team */}
          <TeamBlock team={homeTeam} winner={homeWins} align="start" />

          {/* Score + status */}
          <div className="flex flex-col items-center gap-2 order-first md:order-none">
            {isRivalry && (
              <span
                className="text-kicker text-accent-gold"
                title="Mutual top rivals"
              >
                Rivalry Week
              </span>
            )}
            {/* Score + live chrome are a client island so an in-progress game
                stays current on this ISR-cached page. Server values seed it, so
                first paint (and no-JS) matches what the cache holds. */}
            <MatchupLiveScore
              seasonYear={year}
              week={week}
              matchupId={matchupId}
              initialHomePoints={homeTeam.points}
              initialAwayPoints={awayTeam.points}
              initialStatus={
                isComplete ? "complete" : isLive ? "in_progress" : "scheduled"
              }
              homeIsWinner={homeTeam.isWinner === true}
              awayIsWinner={awayTeam.isWinner === true}
            />
            {aside && (
              <span className="font-serif italic text-body-sm text-accent-warm">
                {aside}
              </span>
            )}
          </div>

          {/* Away team */}
          <TeamBlock team={awayTeam} winner={awayWins} align="end" />
        </div>
      </section>

      <MatchupLineups
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        lineups={lineups}
        homeWins={homeWins}
        awayWins={awayWins}
      />
    </div>
  );
}

function TeamBlock({
  team,
  winner,
  align,
}: {
  team: MatchupTeam;
  winner: boolean;
  align: "start" | "end";
}) {
  const isEnd = align === "end";
  return (
    <div
      className={`flex items-center gap-3 min-w-0 ${
        isEnd ? "md:flex-row-reverse md:text-right" : ""
      }`}
    >
      <FranchiseLogo
        slug={team.franchiseSlug}
        name={team.franchiseName}
        abbreviation={team.franchiseAbbreviation ?? undefined}
        brandingColor={team.franchiseBrandingColor ?? undefined}
        avatarUrl={team.avatarUrl}
        size="md"
        decorative
      />
      <div className="min-w-0">
        <Link
          href={`/teams/${team.franchiseSlug}`}
          className={`block text-h3 truncate hover:text-accent-gold transition-colors ${
            winner ? "font-bold text-text-primary" : "font-medium text-text-secondary"
          }`}
        >
          {team.franchiseName}
        </Link>
      </div>
    </div>
  );
}
