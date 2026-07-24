import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { getAllSeasons, getSeasonStandings } from "@/lib/queries/seasons";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { EmptyState } from "@/components/empty-state";
import { SeasonNavigator } from "./season-navigator";
import { getNflState } from "@/lib/queries/nfl-state";
import { resolveHubSeasonType, isPreWeekOne, seasonTypeBadgeLabel } from "@/lib/hub/season-state";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "League History | Harambe Memorial League Memorial League",
  description:
    "A season-by-season look back at the Harambe Memorial League Memorial League: standings, champions, and the stories that shaped each year.",
};

export default async function SeasonsPage() {
  let seasons: Awaited<ReturnType<typeof getAllSeasons>> = [];

  try {
    seasons = await getAllSeasons();
  } catch {
    // DB may not be connected in dev, fall through to empty state
  }

  // Recompute the newest season's badge via the same seasonal-calendar logic
  // the hub banner uses, so a stale-looking raw DB status ("in_season" during
  // what the hub already calls preseason) can never disagree with the banner.
  let latestSeasonBadge: string | null = null;
  const latestSeason = seasons[0];
  if (latestSeason && latestSeason.status !== "complete") {
    try {
      const [nflState, standings] = await Promise.all([
        getNflState(),
        getSeasonStandings(latestSeason.id),
      ]);
      const seasonType = resolveHubSeasonType({
        nflSeasonType: nflState?.seasonType ?? null,
        dbSeasonStatus: latestSeason.status,
        hasLiveMatchups: false,
        nothingPlayedYet: isPreWeekOne(standings),
      });
      latestSeasonBadge = seasonTypeBadgeLabel(seasonType);
    } catch {
      // Fall back to the raw status-derived badge below
    }
  }

  if (seasons.length === 0) {
    return (
      <PageSection label="Year by Year" title="League History.">
        <EmptyState
          icon="calendar"
          title="No Seasons Yet"
          description="Season history will appear after the first data sync completes."
        />
      </PageSection>
    );
  }

  const years = seasons.map((s) => s.seasonYear);

  // Determine which seasons are legacy era by checking franchise_seasons data
  // For now we use a heuristic: seasons before the first season with a leagueId
  // that matches the current one are legacy.
  // We'll rely on the isLegacyEra field from franchise_seasons once standings exist.

  return (
    <>
      <PageSection label="Year by Year" title="League History.">
        <p className="text-body-lg text-text-secondary max-w-prose">
          A season-by-season look back at the Harambe Memorial League Memorial League:
          standings, champions, and the stories that shaped each year.
        </p>

        <div className="mt-8">
          <SeasonNavigator seasons={years} />
        </div>
      </PageSection>

      <section className="pb-8 md:pb-12 space-y-6">
        {seasons.map((season, index) => {
          // Legacy era = seasons with fewer than 12 rosters (10-team era)
          const isLegacy =
            season.totalRosters !== null &&
            season.totalRosters > 0 &&
            season.totalRosters < 12;
          const isChampion = Boolean(season.championName);

          return (
            <ScrollReveal key={season.id} delay={index * 60}>
              <Link
                href={`/seasons/${season.seasonYear}`}
                className={`group card-surface block p-6 transition-colors duration-150 ${
                  isChampion ? "card-tint-gold hover:border-accent-gold/40" : "hover:border-border-strong"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-h3 group-hover:text-accent-gold transition-colors">
                        {season.seasonYear}
                      </h3>
                      {isLegacy && (
                        <SuperlativeBadge text="Legacy Era" variant="neutral" />
                      )}
                      {season.status === "complete" && (
                        <SuperlativeBadge text="Complete" variant="green" />
                      )}
                      {season.status !== "complete" &&
                        (index === 0 && latestSeasonBadge ? (
                          <SuperlativeBadge text={latestSeasonBadge} variant="green" />
                        ) : season.status === "in_season" ? (
                          <SuperlativeBadge text="In Season" variant="green" />
                        ) : season.status === "pre_draft" ? (
                          <SuperlativeBadge text="Pre-Draft" variant="neutral" />
                        ) : null)}
                    </div>

                    {season.championName ? (
                      <p className="text-body text-text-tertiary">
                        Champion:{" "}
                        <span className="text-accent-gold font-bold">
                          {season.championName}
                        </span>
                      </p>
                    ) : season.status === "complete" ? (
                      <p className="text-body text-text-tertiary">
                        Champion data not available
                      </p>
                    ) : null}
                  </div>

                  <div className="text-right shrink-0">
                    {season.totalRosters && (
                      <p className="text-body-sm font-mono tabular-nums text-text-tertiary">
                        {season.totalRosters} teams
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            </ScrollReveal>
          );
        })}
      </section>
    </>
  );
}
