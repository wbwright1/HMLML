import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { PageSection } from "@/components/page-section";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { ScrollReveal } from "@/components/scroll-reveal";
import { EmptyState } from "@/components/empty-state";
import { SeasonTrophyCard } from "@/components/season-trophy-card";
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

  // Newest first; excludes the in-season year (no champion crowned yet).
  const seasonCards = trophies.filter((t) => t.championName);

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
        {seasonCards.length === 0 ? (
          <EmptyState
            icon="trophy"
            title="No Championship Data"
            description="Championship history will appear once season data has been synced."
            actionLabel="View seasons"
            actionHref="/seasons"
          />
        ) : (
          <>
            <p className="lg:hidden text-caption text-text-tertiary -mt-2 mb-4">
              {`Swipe for all ${seasonCards.length} seasons`} &rarr;
            </p>
            <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 no-scrollbar md:-mx-6 md:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:pb-0">
              {seasonCards.map((trophy, index) => (
                <div
                  key={trophy.seasonYear}
                  className="snap-center shrink-0 basis-[85%] sm:basis-[60%] lg:basis-auto"
                >
                  <ScrollReveal delay={index * 40}>
                    <SeasonTrophyCard
                      trophy={trophy}
                      championships={
                        trophy.championName
                          ? (champCounts.get(trophy.championName) ?? 1)
                          : 1
                      }
                    />
                  </ScrollReveal>
                </div>
              ))}
            </div>
          </>
        )}
      </PageSection>
    </>
  );
}
