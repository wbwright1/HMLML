import { notFound } from "next/navigation";
import Link from "next/link";
import { FranchiseLogo } from "@/components/franchise-logo";
import { LiveIndicator } from "@/components/live-indicator";
import {
  getMatchupsByWeek,
  getSeasonByYearSimple,
} from "@/lib/queries/matchups";
import type { MatchupTeam, PairedMatchup } from "@/lib/queries/matchups";

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
  } catch {
    // DB may not be connected
  }
  if (!season) {
    notFound();
  }

  let matchups: PairedMatchup[] = [];
  try {
    matchups = await getMatchupsByWeek(season.id, week);
  } catch {
    // Matchup data may not be available
  }

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
            <p className="text-stat text-4xl md:text-5xl whitespace-nowrap">
              <span className={isUpcoming ? "text-text-muted" : homeWins ? "text-text-primary" : "text-text-tertiary"}>
                {isUpcoming ? "--" : homeTeam.points.toFixed(1)}
              </span>
              <span className="text-text-muted mx-2">&middot;</span>
              <span className={isUpcoming ? "text-text-muted" : awayWins ? "text-text-primary" : "text-text-tertiary"}>
                {isUpcoming ? "--" : awayTeam.points.toFixed(1)}
              </span>
            </p>
            {isLive ? (
              <LiveIndicator />
            ) : (
              <span className="text-kicker">{isComplete ? "Final" : "Upcoming"}</span>
            )}
          </div>

          {/* Away team */}
          <TeamBlock team={awayTeam} winner={awayWins} align="end" />
        </div>
      </section>

      {/* Lineups placeholder (Phase B) */}
      <p className="mt-8 text-body-sm text-text-tertiary text-center">
        Lineups land here soon.
      </p>
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
