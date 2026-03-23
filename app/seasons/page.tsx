import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { getAllSeasons } from "@/lib/queries/seasons";
import { SeasonNavigator } from "./season-navigator";

export const metadata = {
  title: "League History | Harambe Memorial League Memorial League",
  description:
    "A season-by-season look back at the Harambe Memorial League Memorial League — standings, champions, and the stories that shaped each year.",
};

export default async function SeasonsPage() {
  let seasons: Awaited<ReturnType<typeof getAllSeasons>> = [];

  try {
    seasons = await getAllSeasons();
  } catch {
    // DB may not be connected in dev — fall through to empty state
  }

  if (seasons.length === 0) {
    return (
      <PageSection label="Year by Year" title="League History">
        <p className="text-body-lg text-muted-foreground">
          No seasons loaded yet. Check back once data has been synced from
          Sleeper.
        </p>
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
      <PageSection label="Year by Year" title="League History">
        <p className="text-body-lg text-muted-foreground max-w-prose">
          A season-by-season look back at the Harambe Memorial League Memorial League —
          standings, champions, and the stories that shaped each year.
        </p>

        <div className="mt-8">
          <SeasonNavigator seasons={years} />
        </div>
      </PageSection>

      <section className="pb-24 space-y-6">
        {seasons.map((season, index) => {
          // Legacy era = seasons with fewer than 12 rosters (10-team era)
          const isLegacy =
            season.totalRosters !== null &&
            season.totalRosters > 0 &&
            season.totalRosters < 12;

          return (
            <ScrollReveal key={season.id} delay={index * 60}>
              <Link
                href={`/seasons/${season.seasonYear}`}
                className="group block rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-card/80"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-h3 group-hover:text-primary transition-colors">
                        {season.seasonYear}
                      </h3>
                      {isLegacy && (
                        <span className="text-xs uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          Legacy Era
                        </span>
                      )}
                      {season.status === "complete" && (
                        <span
                          className="text-xs uppercase tracking-wider px-2 py-0.5 rounded-full"
                          style={{ color: "#2D5A3D", backgroundColor: "rgba(45, 90, 61, 0.1)" }}
                        >
                          Complete
                        </span>
                      )}
                      {season.status === "in_season" && (
                        <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded-full text-primary bg-primary/10">
                          In Season
                        </span>
                      )}
                      {season.status === "pre_draft" && (
                        <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded-full text-muted-foreground bg-muted">
                          Pre-Draft
                        </span>
                      )}
                    </div>

                    {season.championName ? (
                      <p className="text-body text-muted-foreground">
                        Champion:{" "}
                        <span className="text-foreground font-semibold">
                          {season.championName}
                        </span>
                      </p>
                    ) : season.status === "complete" ? (
                      <p className="text-body text-muted-foreground">
                        Champion data not available
                      </p>
                    ) : null}
                  </div>

                  <div className="text-right shrink-0">
                    {season.totalRosters && (
                      <p className="text-sm text-muted-foreground">
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
