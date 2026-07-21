import { notFound } from "next/navigation";
import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { FranchiseLogo } from "@/components/franchise-logo";
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

export const dynamic = "force-dynamic";

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
  // A season is legacy era if any franchise_season in it has the legacy flag set
  // (NOT based on previousLeagueId, which chains all Sleeper seasons)
  const isLegacy = standings.some((s) => s.isLegacyEra);
  const playoffWeekStart = season.playoffWeekStart;

  // Cross-reference standings (already fetched) to find the champion's
  // franchise identity for the crest — no extra query needed.
  const championEntry =
    standings.find((s) => s.playoffResult === "champion") ??
    standings.find((s) => s.standingsFinish === 1);

  return (
    <>
      <PageSection
        label={isLegacy ? "Legacy Era" : "Season"}
        title={`${year}`}
      >
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/seasons"
            className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
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
          <div className="mt-6 rounded-lg border border-gold/30 bg-gold/5 p-6 text-center space-y-3">
            {championEntry && (
              <div className="flex justify-center">
                <FranchiseLogo
                  slug={championEntry.franchiseSlug}
                  name={championEntry.franchiseName}
                  abbreviation={championEntry.franchiseAbbreviation ?? undefined}
                  brandingColor={championEntry.franchiseBrandingColor ?? undefined}
                  size="lg"
                  decorative
                />
              </div>
            )}
            <ChampionshipStars count={1} variant="hero" />
            <p className="text-h3 text-gold">{season.championName}</p>
            <SuperlativeBadge text="League Champion" variant="gold" />
          </div>
        )}
      </PageSection>

      {/* Final Standings */}
      <PageSection label="Final Standings" title="Standings">
        {standings.length === 0 ? (
          <p className="text-body-lg text-text-tertiary">
            Standings data is not available for this season yet.
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-3 pr-4 text-kicker w-12">
                      #
                    </th>
                    <th className="pb-3 pr-4 text-kicker">
                      Team
                    </th>
                    <th className="pb-3 pr-4 text-kicker text-center">
                      Record
                    </th>
                    <th className="pb-3 pr-4 text-kicker text-right">
                      PF
                    </th>
                    <th className="pb-3 pr-4 text-kicker text-right">
                      PA
                    </th>
                    <th className="pb-3 text-kicker text-right">
                      Playoff
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-divider last:border-0 hover:bg-surface-muted transition-colors"
                    >
                      <td className="py-4 pr-4">
                        <span
                          className={`font-mono text-sm tabular-nums font-bold ${
                            (entry.standingsFinish ?? 99) <= 3
                              ? "text-accent-gold"
                              : "text-text-tertiary"
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
                          <p className="text-xs text-text-tertiary mt-0.5 ml-10">
                            {entry.ownerDisplayName}{entry.coOwnerDisplayName ? ` & ${entry.coOwnerDisplayName}` : ""}
                          </p>
                        )}
                      </td>
                      <td className="py-4 pr-4 text-center whitespace-nowrap font-mono">
                        <span className="text-sm font-bold tabular-nums">
                          {entry.wins ?? 0}
                        </span>
                        <span className="text-xs text-text-tertiary ml-0.5">
                          W
                        </span>
                        <span className="text-text-tertiary mx-1">-</span>
                        <span className="text-sm font-normal tabular-nums">
                          {entry.losses ?? 0}
                        </span>
                        <span className="text-xs text-text-tertiary ml-0.5">
                          L
                        </span>
                        {(entry.ties ?? 0) > 0 && (
                          <>
                            <span className="text-text-tertiary mx-1">
                              -
                            </span>
                            <span className="text-sm font-normal tabular-nums">
                              {entry.ties}
                            </span>
                            <span className="text-xs text-text-tertiary ml-0.5">
                              T
                            </span>
                          </>
                        )}
                      </td>
                      <td className="py-4 pr-4 text-right">
                        <span className="font-mono text-sm tabular-nums">
                          {entry.pointsScored != null
                            ? Number(entry.pointsScored).toFixed(1)
                            : "-"}
                        </span>
                      </td>
                      <td className="py-4 pr-4 text-right">
                        <span className="font-mono text-sm tabular-nums text-text-tertiary">
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
                  <div
                    className="rounded-lg border border-border bg-surface p-4"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`font-mono text-lg tabular-nums font-bold mt-0.5 ${
                          (entry.standingsFinish ?? 99) <= 3
                            ? "text-accent-gold"
                            : "text-text-tertiary"
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
                          <p className="text-xs text-text-tertiary mt-0.5">
                            {entry.ownerDisplayName}{entry.coOwnerDisplayName ? ` & ${entry.coOwnerDisplayName}` : ""}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-4 mt-2 text-sm font-mono">
                          <span className="tabular-nums">
                            <span className="font-bold">
                              {entry.wins ?? 0}
                            </span>
                            <span className="text-text-tertiary">W</span>
                            <span className="text-text-tertiary mx-0.5">
                              -
                            </span>
                            <span>{entry.losses ?? 0}</span>
                            <span className="text-text-tertiary">L</span>
                            {(entry.ties ?? 0) > 0 && (
                              <>
                                <span className="text-text-tertiary mx-0.5">
                                  -
                                </span>
                                <span>{entry.ties}</span>
                                <span className="text-text-tertiary">T</span>
                              </>
                            )}
                          </span>
                          <span className="text-text-tertiary tabular-nums">
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
          <div className="mb-4">
            <Link
              href={`/schedule?season=${year}`}
              className="text-body-sm text-accent-gold hover:brightness-110 transition-colors"
            >
              View Full Season Schedule &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-9 gap-2">
            {Array.from({ length: maxWeek }, (_, i) => i + 1).map((week) => {
              const isPlayoff =
                playoffWeekStart != null && week >= playoffWeekStart;
              return (
                <Link
                  key={week}
                  href={`/seasons/${year}/week/${week}`}
                  className={`rounded-lg border text-center py-3 px-2 text-sm font-medium transition-colors hover:bg-surface-muted ${
                    isPlayoff
                      ? "border-accent-green/30 bg-accent-green-light text-accent-green hover:bg-accent-green-light/80"
                      : "border-border bg-surface text-text-primary"
                  }`}
                >
                  <span className="block text-xs text-text-tertiary mb-0.5">
                    {isPlayoff ? "Playoff" : "Week"}
                  </span>
                  <span className="font-mono tabular-nums">{week}</span>
                </Link>
              );
            })}
          </div>

          {playoffWeekStart != null && (
            <div className="mt-6">
              <Link
                href={`/playoffs/${year}`}
                className="inline-flex items-center gap-2 text-body-sm font-medium text-accent-gold hover:brightness-110 transition-all"
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
    return <span className="text-sm text-text-tertiary">-</span>;

  const label = getPlayoffLabel(result);
  if (!label) return <span className="text-sm text-text-tertiary">-</span>;

  const variant = getPlayoffBadgeVariant(result);

  return <SuperlativeBadge text={label} variant={variant} />;
}
