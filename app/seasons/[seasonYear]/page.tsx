import { notFound } from "next/navigation";
import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { ChampionshipStars } from "@/components/championship-stars";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { ScrollReveal } from "@/components/scroll-reveal";
import {
  getSeasonByYear,
  getSeasonStandings,
  getAllSeasons,
} from "@/lib/queries/seasons";
import { getPlayoffLabel, getPlayoffBadgeVariant } from "@/lib/playoff-labels";
import { getMaxWeekForSeason } from "@/lib/queries/matchups";
import { SeasonDetailNav } from "./season-detail-nav";

interface SeasonDetailPageProps {
  params: Promise<{ seasonYear: string }>;
}

export async function generateMetadata({ params }: SeasonDetailPageProps) {
  const { seasonYear } = await params;
  return {
    title: `${seasonYear} Season | Harambe Memorial League Memorial League`,
    description: `Standings and results for the ${seasonYear} Harambe Memorial League Memorial League season.`,
  };
}

export default async function SeasonDetailPage({
  params,
}: SeasonDetailPageProps) {
  const { seasonYear } = await params;
  const year = parseInt(seasonYear, 10);

  if (isNaN(year)) {
    notFound();
  }

  let season: Awaited<ReturnType<typeof getSeasonByYear>> = null;
  let allSeasons: Awaited<ReturnType<typeof getAllSeasons>> = [];

  try {
    [season, allSeasons] = await Promise.all([
      getSeasonByYear(year),
      getAllSeasons(),
    ]);
  } catch {
    // DB may not be connected in dev
  }

  if (!season) {
    notFound();
  }

  let standings: Awaited<ReturnType<typeof getSeasonStandings>> = [];

  try {
    standings = await getSeasonStandings(season.id);
  } catch {
    // Standings may not be available
  }

  // Determine the last week with matchup data for week-by-week navigation
  let maxWeek = 0;
  try {
    maxWeek = await getMaxWeekForSeason(season.id);
  } catch {
    // Matchup data may not be available
  }

  const seasonYears = allSeasons.map((s) => s.seasonYear);
  const isLegacy = season.previousLeagueId !== null;
  const playoffWeekStart = season.playoffWeekStart;

  return (
    <>
      <PageSection
        label={isLegacy ? "Legacy Era" : "Season"}
        title={`${year}`}
      >
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/seasons"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; All Seasons
          </Link>

          {season.status && season.status !== "complete" && (
            <SuperlativeBadge
              text={season.status === "in_season" ? "In Season" : "Pre-Draft"}
              variant="green"
            />
          )}

          {isLegacy && <SuperlativeBadge text="Legacy Era" variant="neutral" />}
        </div>

        {/* Season selector for switching between years */}
        {seasonYears.length > 1 && (
          <div className="mt-6">
            <SeasonDetailNav seasons={seasonYears} activeSeason={year} />
          </div>
        )}

        {season.championName && (
          <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-6 text-center">
            <p className="text-caption uppercase tracking-widest text-primary mb-1">
              Champion
            </p>
            <p className="text-h3">{season.championName}</p>
            <ChampionshipStars count={1} variant="hero" />
          </div>
        )}
      </PageSection>

      {/* Final Standings */}
      <PageSection label="Final Standings" title="Standings">
        {standings.length === 0 ? (
          <p className="text-body-lg text-muted-foreground">
            Standings data is not available for this season yet.
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-3 pr-4 text-xs uppercase tracking-wider text-muted-foreground font-medium w-12">
                      #
                    </th>
                    <th className="pb-3 pr-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                      Team
                    </th>
                    <th className="pb-3 pr-4 text-xs uppercase tracking-wider text-muted-foreground font-medium text-center">
                      Record
                    </th>
                    <th className="pb-3 pr-4 text-xs uppercase tracking-wider text-muted-foreground font-medium text-right">
                      PF
                    </th>
                    <th className="pb-3 pr-4 text-xs uppercase tracking-wider text-muted-foreground font-medium text-right">
                      PA
                    </th>
                    <th className="pb-3 text-xs uppercase tracking-wider text-muted-foreground font-medium text-right">
                      Playoff
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="py-4 pr-4">
                        <span
                          className={`text-sm tabular-nums font-bold ${
                            (entry.standingsFinish ?? 99) <= 3
                              ? "text-gold"
                              : "text-muted-foreground"
                          }`}
                        >
                          {entry.standingsFinish ?? "-"}
                        </span>
                      </td>
                      <td className="py-4 pr-4">
                        <FranchiseIdentity
                          franchise={{
                            slug: entry.franchiseSlug,
                            name: entry.franchiseName,
                            abbreviation:
                              entry.franchiseAbbreviation ?? undefined,
                            brandingColor:
                              entry.franchiseBrandingColor ?? undefined,
                          }}
                          variant="compact"
                        />
                        {entry.ownerDisplayName && (
                          <p className="text-xs text-muted-foreground mt-0.5 ml-10">
                            {entry.ownerDisplayName}
                          </p>
                        )}
                      </td>
                      <td className="py-4 pr-4 text-center whitespace-nowrap">
                        <span className="text-sm font-bold tabular-nums">
                          {entry.wins ?? 0}
                        </span>
                        <span className="text-xs text-muted-foreground ml-0.5">
                          W
                        </span>
                        <span className="text-muted-foreground mx-1">-</span>
                        <span className="text-sm font-normal tabular-nums">
                          {entry.losses ?? 0}
                        </span>
                        <span className="text-xs text-muted-foreground ml-0.5">
                          L
                        </span>
                        {(entry.ties ?? 0) > 0 && (
                          <>
                            <span className="text-muted-foreground mx-1">
                              -
                            </span>
                            <span className="text-sm font-normal tabular-nums">
                              {entry.ties}
                            </span>
                            <span className="text-xs text-muted-foreground ml-0.5">
                              T
                            </span>
                          </>
                        )}
                      </td>
                      <td className="py-4 pr-4 text-right">
                        <span className="text-sm tabular-nums">
                          {entry.pointsScored != null
                            ? Number(entry.pointsScored).toFixed(1)
                            : "-"}
                        </span>
                      </td>
                      <td className="py-4 pr-4 text-right">
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {entry.pointsAgainst != null
                            ? Number(entry.pointsAgainst).toFixed(1)
                            : "-"}
                        </span>
                      </td>
                      <td className="py-4 text-right">
                        <PlayoffBadge result={entry.playoffResult} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card view */}
            <div className="md:hidden space-y-3">
              {standings.map((entry) => (
                <ScrollReveal key={entry.id}>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-start gap-3">
                      <span
                        className={`text-lg tabular-nums font-bold mt-0.5 ${
                          (entry.standingsFinish ?? 99) <= 3
                            ? "text-gold"
                            : "text-muted-foreground"
                        }`}
                      >
                        {entry.standingsFinish ?? "-"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <FranchiseIdentity
                          franchise={{
                            slug: entry.franchiseSlug,
                            name: entry.franchiseName,
                            abbreviation:
                              entry.franchiseAbbreviation ?? undefined,
                            brandingColor:
                              entry.franchiseBrandingColor ?? undefined,
                          }}
                          variant="compact"
                        />
                        {entry.ownerDisplayName && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {entry.ownerDisplayName}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-4 mt-2 text-sm">
                          <span className="tabular-nums">
                            <span className="font-bold">
                              {entry.wins ?? 0}
                            </span>
                            <span className="text-muted-foreground">W</span>
                            <span className="text-muted-foreground mx-0.5">
                              -
                            </span>
                            <span>{entry.losses ?? 0}</span>
                            <span className="text-muted-foreground">L</span>
                            {(entry.ties ?? 0) > 0 && (
                              <>
                                <span className="text-muted-foreground mx-0.5">
                                  -
                                </span>
                                <span>{entry.ties}</span>
                                <span className="text-muted-foreground">T</span>
                              </>
                            )}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            {entry.pointsScored != null
                              ? Number(entry.pointsScored).toFixed(1)
                              : "-"}{" "}
                            PF
                          </span>
                        </div>
                        {entry.playoffResult && (
                          <div className="mt-1.5">
                            <PlayoffBadge result={entry.playoffResult} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </>
        )}
      </PageSection>

      {/* Week-by-Week Results */}
      {maxWeek > 0 && (
        <PageSection label="Week by Week" title="Game Results">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-9 gap-2">
            {Array.from({ length: maxWeek }, (_, i) => i + 1).map((week) => {
              const isPlayoff =
                playoffWeekStart != null && week >= playoffWeekStart;
              return (
                <Link
                  key={week}
                  href={`/seasons/${year}/week/${week}`}
                  className={`rounded-lg border text-center py-3 px-2 text-sm font-medium transition-colors hover:bg-muted/50 ${
                    isPlayoff
                      ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
                      : "border-border bg-card text-foreground"
                  }`}
                >
                  <span className="block text-xs text-muted-foreground mb-0.5">
                    {isPlayoff ? "Playoff" : "Week"}
                  </span>
                  {week}
                </Link>
              );
            })}
          </div>

          {playoffWeekStart != null && (
            <div className="mt-6">
              <Link
                href={`/playoffs/${year}`}
                className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors underline underline-offset-4 font-medium"
              >
                View Playoff Bracket &rarr;
              </Link>
            </div>
          )}
        </PageSection>
      )}
    </>
  );
}

function PlayoffBadge({ result }: { result: string | null }) {
  if (!result)
    return <span className="text-sm text-muted-foreground">-</span>;

  const label = getPlayoffLabel(result);
  if (!label) return <span className="text-sm text-muted-foreground">-</span>;

  const variant = getPlayoffBadgeVariant(result);

  return <SuperlativeBadge text={label} variant={variant} />;
}
