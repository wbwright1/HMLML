import { notFound } from "next/navigation";
import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { ChampionshipStars } from "@/components/championship-stars";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { ScrollReveal } from "@/components/scroll-reveal";
import {
  getPlayoffMatchups,
  getSeasonByYearSimple,
  getFranchisePlayoffResults,
  type PairedMatchup,
  type MatchupTeam,
} from "@/lib/queries/matchups";

interface PlayoffBracketPageProps {
  params: Promise<{ seasonYear: string }>;
}

export async function generateMetadata({ params }: PlayoffBracketPageProps) {
  const { seasonYear } = await params;
  return {
    title: `${seasonYear} Playoffs | Harambe Memorial League Memorial League`,
    description: `Playoff results for the ${seasonYear} Harambe Memorial League Memorial League season.`,
  };
}

// ---------------------------------------------------------------------------
// Helpers — extract key matchups + podium from flat data
// ---------------------------------------------------------------------------

interface FranchiseInfo {
  franchiseId: string;
  name: string;
  slug: string;
  abbreviation: string | null;
  brandingColor: string | null;
}

function teamToFranchiseInfo(team: MatchupTeam): FranchiseInfo {
  return {
    franchiseId: team.franchiseId,
    name: team.franchiseName,
    slug: team.franchiseSlug,
    abbreviation: team.franchiseAbbreviation,
    brandingColor: team.franchiseBrandingColor,
  };
}

/**
 * Build a lookup of franchiseId → FranchiseInfo from all matchup data.
 */
function buildFranchiseLookup(
  playoffData: Map<number, PairedMatchup[]>
): Map<string, FranchiseInfo> {
  const lookup = new Map<string, FranchiseInfo>();
  for (const matchups of playoffData.values()) {
    for (const m of matchups) {
      if (!lookup.has(m.homeTeam.franchiseId)) {
        lookup.set(m.homeTeam.franchiseId, teamToFranchiseInfo(m.homeTeam));
      }
      if (!lookup.has(m.awayTeam.franchiseId)) {
        lookup.set(m.awayTeam.franchiseId, teamToFranchiseInfo(m.awayTeam));
      }
    }
  }
  return lookup;
}

/**
 * Find the championship matchup: the game in the final week where the
 * champion and runner-up played each other.
 */
function findChampionshipMatchup(
  playoffData: Map<number, PairedMatchup[]>,
  championId: string | null,
  runnerUpId: string | null
): PairedMatchup | null {
  if (!championId && !runnerUpId) return null;

  const weeks = Array.from(playoffData.keys()).sort((a, b) => a - b);
  if (weeks.length === 0) return null;

  // Search from the final week backwards
  for (let i = weeks.length - 1; i >= 0; i--) {
    const matchups = playoffData.get(weeks[i]) ?? [];
    for (const m of matchups) {
      const ids = new Set([m.homeTeam.franchiseId, m.awayTeam.franchiseId]);
      if (
        (championId && ids.has(championId)) &&
        (runnerUpId && ids.has(runnerUpId))
      ) {
        return m;
      }
    }
  }

  // Fallback: if we only have champion, find their last matchup
  if (championId) {
    const lastWeek = weeks[weeks.length - 1];
    const matchups = playoffData.get(lastWeek) ?? [];
    for (const m of matchups) {
      if (
        m.homeTeam.franchiseId === championId ||
        m.awayTeam.franchiseId === championId
      ) {
        return m;
      }
    }
  }

  return null;
}

/**
 * Find 3rd place: the semifinal loser who is NOT the runner-up.
 * We identify SF matchups by finding games where the champion or
 * runner-up won — their opponents are the true semifinal losers.
 * If both are found, the one with the higher score is "3rd place".
 */
function findThirdPlace(
  playoffData: Map<number, PairedMatchup[]>,
  championId: string | null,
  runnerUpId: string | null
): FranchiseInfo | null {
  if (!championId && !runnerUpId) return null;

  const weeks = Array.from(playoffData.keys()).sort((a, b) => a - b);
  if (weeks.length < 2) return null;

  // Semifinal week is the second-to-last week
  const sfWeek = weeks[weeks.length - 2];
  const sfMatchups = playoffData.get(sfWeek) ?? [];

  // Only look at matchups that contain the champion or runner-up —
  // those are the actual semifinal games (not consolation filler).
  const finalistIds = new Set(
    [championId, runnerUpId].filter((id): id is string => id !== null)
  );

  const sfLosers: { info: FranchiseInfo; points: number }[] = [];

  for (const m of sfMatchups) {
    const homeIsFinalist = finalistIds.has(m.homeTeam.franchiseId);
    const awayIsFinalist = finalistIds.has(m.awayTeam.franchiseId);
    if (!homeIsFinalist && !awayIsFinalist) continue;

    const isComplete =
      m.status === "complete" ||
      (m.homeTeam.points > 0 && m.awayTeam.points > 0);
    if (!isComplete) continue;

    // The loser of this matchup is the non-finalist (SF loser)
    const loser = homeIsFinalist ? m.awayTeam : m.homeTeam;

    // Don't include the finalist themselves if they lost this matchup
    if (finalistIds.has(loser.franchiseId)) continue;

    sfLosers.push({
      info: teamToFranchiseInfo(loser),
      points: loser.points,
    });
  }

  if (sfLosers.length === 0) return null;

  // Pick the loser with the higher score as "3rd place"
  sfLosers.sort((a, b) => b.points - a.points);
  return sfLosers[0].info;
}

// ---------------------------------------------------------------------------
// UI Components
// ---------------------------------------------------------------------------

function MatchupCard({
  matchup,
  seasonYear,
  highlight,
}: {
  matchup: PairedMatchup;
  seasonYear: number;
  highlight?: "championship";
}) {
  const { homeTeam, awayTeam } = matchup;
  const isComplete =
    matchup.status === "complete" || (homeTeam.points > 0 && awayTeam.points > 0);
  const homeWins = isComplete && homeTeam.points > awayTeam.points;
  const awayWins = isComplete && awayTeam.points > homeTeam.points;
  const isChamp = highlight === "championship";

  return (
    <Link
      href={`/seasons/${seasonYear}/week/${matchup.week}`}
      className={`block w-full rounded-xl border bg-card transition-colors hover:bg-muted/20 ${
        isChamp ? "border-primary/40 ring-1 ring-primary/20" : "border-border"
      }`}
    >
      <TeamRow team={homeTeam} isWinner={homeWins} accent={isChamp ? "championship" : "default"} />
      <div className="h-px bg-border" />
      <TeamRow team={awayTeam} isWinner={awayWins} accent={isChamp ? "championship" : "default"} />
    </Link>
  );
}

function TeamRow({
  team,
  isWinner,
  accent = "default",
}: {
  team: MatchupTeam;
  isWinner: boolean;
  accent?: "championship" | "default";
}) {
  const bg =
    isWinner && accent === "championship"
      ? "bg-primary/5"
      : isWinner
        ? "bg-muted/40"
        : "";

  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${bg}`}>
      <FranchiseIdentity
        franchise={{
          slug: team.franchiseSlug,
          name: team.franchiseName,
          abbreviation: team.franchiseAbbreviation ?? undefined,
          brandingColor: team.franchiseBrandingColor ?? undefined,
        }}
        variant="compact"
      />
      <span
        className={`tabular-nums text-sm shrink-0 ml-auto ${
          isWinner ? "font-bold" : "text-muted-foreground"
        }`}
      >
        {team.points > 0 ? team.points.toFixed(1) : "-"}
      </span>
    </div>
  );
}

function PodiumEntry({
  franchise,
  label,
  badge,
}: {
  franchise: FranchiseInfo;
  label: string;
  badge: { text: string; variant: "gold" | "silver" | "green" | "neutral" | "brown" };
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <FranchiseIdentity
        franchise={{
          slug: franchise.slug,
          name: franchise.name,
          abbreviation: franchise.abbreviation ?? undefined,
          brandingColor: franchise.brandingColor ?? undefined,
        }}
        variant="compact"
      />
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {label}
        </span>
        <SuperlativeBadge text={badge.text} variant={badge.variant} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PlayoffBracketPage({
  params,
}: PlayoffBracketPageProps) {
  const { seasonYear } = await params;
  const year = parseInt(seasonYear, 10);

  if (isNaN(year)) notFound();

  let season: Awaited<ReturnType<typeof getSeasonByYearSimple>> = null;
  try {
    season = await getSeasonByYearSimple(year);
  } catch {
    /* DB may not be connected */
  }
  if (!season) notFound();

  let playoffData: Awaited<ReturnType<typeof getPlayoffMatchups>> = new Map();
  let playoffResults = new Map<string, string>();

  try {
    [playoffData, playoffResults] = await Promise.all([
      getPlayoffMatchups(season.id, season.playoffWeekStart),
      getFranchisePlayoffResults(season.id),
    ]);
  } catch {
    /* Playoff data may not be available */
  }

  // Build franchise lookup from matchup data
  const franchiseLookup = buildFranchiseLookup(playoffData);

  // Find key franchise IDs from playoff results
  let championId: string | null = null;
  let runnerUpId: string | null = null;
  let toiletBowlId: string | null = null;

  for (const [fId, result] of playoffResults) {
    if (result === "champion") championId = fId;
    if (result === "runner_up") runnerUpId = fId;
    if (result === "toilet_bowl") toiletBowlId = fId;
  }

  // Find the championship matchup
  const championshipMatchup = findChampionshipMatchup(
    playoffData,
    championId,
    runnerUpId
  );

  // Resolve franchise info
  const championInfo = championId ? franchiseLookup.get(championId) : null;
  const runnerUpInfo = runnerUpId ? franchiseLookup.get(runnerUpId) : null;
  const toiletBowlInfo = toiletBowlId ? franchiseLookup.get(toiletBowlId) : null;

  // Find 3rd place from semifinal losers
  const thirdPlaceInfo = findThirdPlace(playoffData, championId, runnerUpId);

  const hasData =
    championshipMatchup || championInfo || runnerUpInfo || toiletBowlInfo ||
    playoffData.size > 0;

  return (
    <>
      <PageSection label={`${year} Season`} title="Playoff Results">
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href={`/seasons/${year}`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; {year} Season
          </Link>
        </div>

        {/* Champion hero */}
        {championInfo && (
          <ScrollReveal>
            <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-6 text-center space-y-2">
              <p className="text-caption uppercase tracking-widest text-primary mb-1">
                Champion
              </p>
              <p className="text-h3">{championInfo.name}</p>
              <ChampionshipStars count={1} variant="hero" />
            </div>
          </ScrollReveal>
        )}
      </PageSection>

      {!hasData ? (
        <section className="pb-24">
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-body-lg text-muted-foreground">
              No playoff data available for the {year} season.
            </p>
            <Link
              href={`/seasons/${year}`}
              className="text-sm text-primary hover:text-primary/80 transition-colors underline underline-offset-4 mt-4 inline-block"
            >
              Back to {year} season
            </Link>
          </div>
        </section>
      ) : (
        <section className="pb-24 space-y-12">
          {/* Championship matchup */}
          {championshipMatchup && (
            <ScrollReveal delay={80}>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">
                    Championship
                  </h3>
                  <span className="text-xs text-muted-foreground/50">
                    Week {championshipMatchup.week}
                  </span>
                  <SuperlativeBadge text="Title Game" variant="gold" />
                </div>
                <div className="max-w-lg">
                  <MatchupCard
                    matchup={championshipMatchup}
                    seasonYear={year}
                    highlight="championship"
                  />
                </div>
              </div>
            </ScrollReveal>
          )}

          {/* Podium: Runner-up + 3rd place */}
          {(runnerUpInfo || thirdPlaceInfo) && (
            <ScrollReveal delay={160}>
              <div className="space-y-3 max-w-lg">
                {runnerUpInfo && (
                  <PodiumEntry
                    franchise={runnerUpInfo}
                    label="Runner-Up"
                    badge={{ text: "2nd", variant: "silver" }}
                  />
                )}
                {thirdPlaceInfo && (
                  <PodiumEntry
                    franchise={thirdPlaceInfo}
                    label="Third Place"
                    badge={{ text: "3rd", variant: "green" }}
                  />
                )}
              </div>
            </ScrollReveal>
          )}

          {/* Toilet Bowl */}
          {toiletBowlInfo && (
            <ScrollReveal delay={240}>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-border" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  Toilet Bowl
                </h2>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="rounded-xl border border-border bg-card p-6 text-center space-y-2 max-w-lg">
                <div className="text-3xl mb-1" aria-hidden="true">
                  🚽
                </div>
                <p className="text-caption uppercase tracking-widest text-muted-foreground">
                  Last Place
                </p>
                <p className="text-h3">{toiletBowlInfo.name}</p>
                <SuperlativeBadge text="Toilet Bowl" variant="brown" />
              </div>
            </ScrollReveal>
          )}
        </section>
      )}
    </>
  );
}
