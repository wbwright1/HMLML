import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { PageSection } from "@/components/page-section";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { ScrollReveal } from "@/components/scroll-reveal";
import { StatHero } from "@/components/stat-hero";
import { EmptyState } from "@/components/empty-state";
import { getTrophyCase } from "@/lib/queries/records";
import type { TrophyEntry } from "@/lib/queries/records";

export const dynamic = "force-dynamic";

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
      return {
        name,
        count,
        slug: entry?.championSlug,
        abbreviation: entry?.championAbbreviation,
        brandingColor: entry?.championBrandingColor,
        avatarUrl: entry?.championAvatarUrl ?? null,
      };
    })
    .sort((a, b) => b.count - a.count);

  return (
    <>
      <PageSection label="Records" title="Trophy Case.">
        <BackLink href="/records" label="All Records" />

        <p className="text-body-lg text-text-secondary max-w-prose">
          Every championship and accolade in league history.
        </p>
      </PageSection>

      {/* All-Time Awards */}
      {allTimeChamps.length > 0 && (
        <PageSection label="All-Time" title="Championship Leaders">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {allTimeChamps.map((champ, index) => (
              <ScrollReveal key={champ.name} delay={index * 60}>
                <div className="rounded-[14px] border border-primary/30 bg-primary/5 p-6 space-y-3 transition-colors hover:border-primary/50">
                  <Link
                    href={champ.slug ? `/teams/${champ.slug}` : "#"}
                    className="block hover:opacity-80 transition-opacity"
                  >
                    <FranchiseIdentity
                      franchise={{
                        slug: champ.slug ?? "",
                        name: champ.name,
                        abbreviation: champ.abbreviation ?? undefined,
                        brandingColor: champ.brandingColor ?? undefined,
                        avatarUrl: champ.avatarUrl,
                      }}
                      championships={champ.count}
                      variant="standard"
                    />
                  </Link>
                  <div className="text-center">
                    <SuperlativeBadge
                      text={`${champ.count}x League Champion`}
                      variant="gold"
                    />
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </PageSection>
      )}

      {/* Season-by-Season */}
      <PageSection label="Year by Year" title="Championships">
        {trophies.length === 0 ? (
          <EmptyState
            icon="trophy"
            title="No Championship Data"
            description="Championship history will appear once season data has been synced."
            actionLabel="View seasons"
            actionHref="/seasons"
          />
        ) : (
          <div className="space-y-3">
            {/* Most recent champion: featured */}
            {trophies.length > 0 && trophies[0].championName && (
              <ScrollReveal>
                <div className="card-surface card-tint-gold p-8 text-center space-y-4">
                  <StatHero
                    value={trophies[0].seasonYear}
                    label="Reigning Champion"
                    variant="lg"
                  />
                  <div className="flex justify-center">
                    <Link
                      href={trophies[0].championSlug ? `/teams/${trophies[0].championSlug}` : "#"}
                      className="hover:opacity-80 transition-opacity"
                    >
                      <FranchiseIdentity
                        franchise={{
                          slug: trophies[0].championSlug ?? "",
                          name: trophies[0].championName,
                          abbreviation: trophies[0].championAbbreviation ?? undefined,
                          brandingColor: trophies[0].championBrandingColor ?? undefined,
                          avatarUrl: trophies[0].championAvatarUrl,
                        }}
                        championships={champCounts.get(trophies[0].championName) ?? 1}
                        variant="hero"
                      />
                    </Link>
                  </div>
                  <SuperlativeBadge text="League Champion" variant="gold" />
                  {trophies[0].runnerUpName && (
                    <p className="text-body-sm text-text-tertiary">
                      defeated {trophies[0].runnerUpName}
                    </p>
                  )}
                </div>
              </ScrollReveal>
            )}

            {/* Historical champions */}
            {trophies.slice(1).map((trophy, index) => (
              <ScrollReveal key={trophy.seasonYear} delay={(index + 1) * 40}>
                <div
                  className={`rounded-[14px] border p-5 transition-colors ${
                    trophy.championName
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-surface"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <Link
                        href={`/seasons/${trophy.seasonYear}`}
                        className="text-h3 font-mono tabular-nums hover:text-primary transition-colors"
                      >
                        {trophy.seasonYear}
                      </Link>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      {trophy.championName ? (
                        <div className="flex items-center gap-3">
                          <Link
                            href={trophy.championSlug ? `/teams/${trophy.championSlug}` : "#"}
                            className="hover:opacity-80 transition-opacity"
                          >
                            <FranchiseIdentity
                              franchise={{
                                slug: trophy.championSlug ?? "",
                                name: trophy.championName,
                                abbreviation: trophy.championAbbreviation ?? undefined,
                                brandingColor: trophy.championBrandingColor ?? undefined,
                                avatarUrl: trophy.championAvatarUrl,
                              }}
                              championships={champCounts.get(trophy.championName) ?? 1}
                              variant="compact"
                            />
                          </Link>
                          <SuperlativeBadge text="League Champion" variant="gold" />
                        </div>
                      ) : (
                        <SuperlativeBadge text="No Champion" variant="neutral" />
                      )}

                      {trophy.runnerUpName && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-text-tertiary">
                            vs
                          </span>
                          {trophy.runnerUpSlug ? (
                            <Link
                              href={`/teams/${trophy.runnerUpSlug}`}
                              className="text-body-sm text-text-tertiary hover:text-text-primary transition-colors"
                            >
                              {trophy.runnerUpName}
                            </Link>
                          ) : (
                            <span className="text-body-sm text-text-tertiary">
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
