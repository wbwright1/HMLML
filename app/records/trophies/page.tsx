import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { ChampionshipStars } from "@/components/championship-stars";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { ScrollReveal } from "@/components/scroll-reveal";
import { getTrophyCase } from "@/lib/queries/records";
import type { TrophyEntry } from "@/lib/queries/records";

export const metadata = {
  title: "Trophy Case | Harambe Memorial League Memorial League",
  description:
    "Championships and awards for the Harambe Memorial League Memorial League.",
};

export default async function TrophyCasePage() {
  let trophies: TrophyEntry[] = [];

  try {
    trophies = await getTrophyCase();
  } catch {
    // DB may not be connected
  }

  // Count total championships per franchise for all-time awards section
  const champCounts = new Map<string, number>();
  for (const t of trophies) {
    if (t.championName) {
      champCounts.set(
        t.championName,
        (champCounts.get(t.championName) ?? 0) + 1
      );
    }
  }

  // Sort all-time champions by count desc
  const allTimeChamps = Array.from(champCounts.entries())
    .map(([name, count]) => {
      const entry = trophies.find((t) => t.championName === name);
      return { name, count, slug: entry?.championSlug };
    })
    .sort((a, b) => b.count - a.count);

  return (
    <>
      <PageSection label="Records" title="Trophy Case">
        <Link
          href="/records"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; All Records
        </Link>

        <p className="text-body-lg text-muted-foreground max-w-prose">
          Every championship and accolade in league history.
        </p>
      </PageSection>

      {/* All-Time Awards */}
      {allTimeChamps.length > 0 && (
        <PageSection label="All-Time" title="Championship Leaders">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {allTimeChamps.map((champ, index) => (
              <ScrollReveal key={champ.name} delay={index * 60}>
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 text-center space-y-3">
                  <ChampionshipStars count={champ.count} variant="hero" />
                  <p className="text-h3">
                    {champ.slug ? (
                      <Link
                        href={`/teams/${champ.slug}`}
                        className="hover:text-primary transition-colors"
                      >
                        {champ.name}
                      </Link>
                    ) : (
                      champ.name
                    )}
                  </p>
                  <SuperlativeBadge
                    text={`${champ.count}x Champion`}
                    variant="gold"
                  />
                </div>
              </ScrollReveal>
            ))}
          </div>
        </PageSection>
      )}

      {/* Season-by-Season */}
      <PageSection label="Year by Year" title="Championships">
        {trophies.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-body-lg text-muted-foreground">
              No championship data available yet. Check back once season data has been synced.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {trophies.map((trophy, index) => (
              <ScrollReveal key={trophy.seasonYear} delay={index * 40}>
                <div
                  className={`rounded-xl border p-5 transition-colors ${
                    trophy.championName
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <Link
                        href={`/seasons/${trophy.seasonYear}`}
                        className="text-h3 hover:text-primary transition-colors"
                      >
                        {trophy.seasonYear}
                      </Link>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      {trophy.championName ? (
                        <div className="flex items-center gap-3">
                          <ChampionshipStars count={1} variant="inline" />
                          {trophy.championSlug ? (
                            <Link
                              href={`/teams/${trophy.championSlug}`}
                              className="text-sm font-bold hover:text-primary transition-colors"
                            >
                              {trophy.championName}
                            </Link>
                          ) : (
                            <span className="text-sm font-bold">
                              {trophy.championName}
                            </span>
                          )}
                          <SuperlativeBadge text="Champion" variant="gold" />
                        </div>
                      ) : (
                        <SuperlativeBadge text="No Champion" variant="neutral" />
                      )}

                      {trophy.runnerUpName && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            vs
                          </span>
                          {trophy.runnerUpSlug ? (
                            <Link
                              href={`/teams/${trophy.runnerUpSlug}`}
                              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {trophy.runnerUpName}
                            </Link>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {trophy.runnerUpName}
                            </span>
                          )}
                          <SuperlativeBadge text="Runner-Up" variant="neutral" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        )}
      </PageSection>
    </>
  );
}
