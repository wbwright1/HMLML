import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { PageSection } from "@/components/page-section";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { FranchiseLogo } from "@/components/franchise-logo";
import { ChampionshipStars } from "@/components/championship-stars";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { ScrollReveal } from "@/components/scroll-reveal";
import { EmptyState } from "@/components/empty-state";
import { PlayoffBracketRounds } from "@/components/playoff-bracket-rounds";
import { getSeasonByYearSimple } from "@/lib/queries/matchups";
import { getTrophyCase } from "@/lib/queries/records";
import {
  getSeasonBracket,
  getToiletBowlChampion,
  type ToiletBowlChampion,
} from "@/lib/queries/playoff-bracket";
import { SNARKY_LABELS } from "@/lib/content";
import { TOILET_BOWL_COPY } from "@/lib/playoff-labels";

export const dynamic = "force-dynamic";

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

  const [bracket, toiletBowlChampion, trophies] = await Promise.all([
    getSeasonBracket(season.id, season.playoffWeekStart, season.totalRosters),
    getToiletBowlChampion(season.id),
    getTrophyCase().catch(() => []),
  ]);

  const championEntry = trophies.find(
    (t) => t.seasonYear === year && t.championName != null,
  );

  const hasBracket = bracket.winners.length > 0 || bracket.losers.length > 0;

  return (
    <>
      <PageSection label={`${year} Season`} title="Playoff Results.">
        <div className="flex flex-wrap items-center gap-4">
          <BackLink href={`/seasons/${year}`} label={`${year} Season`} />
        </div>

        {/* Champion hero */}
        {championEntry && (
          <ScrollReveal>
            <div className="mt-6 card-surface card-tint-gold p-8 text-center space-y-3">
              <p className="text-kicker text-gold mb-1">Champion</p>
              <div className="flex justify-center">
                <FranchiseLogo
                  slug={championEntry.championSlug!}
                  name={championEntry.championName!}
                  abbreviation={championEntry.championAbbreviation ?? undefined}
                  brandingColor={championEntry.championBrandingColor ?? undefined}
                  avatarUrl={championEntry.championAvatarUrl}
                  size="xl"
                  decorative
                />
              </div>
              <p className="text-h1 text-gold">{championEntry.championName}</p>
              <ChampionshipStars count={1} variant="hero" />
            </div>
          </ScrollReveal>
        )}
      </PageSection>

      {!hasBracket ? (
        <section className="pb-8 md:pb-12">
          <EmptyState
            icon="calendar"
            title="No Playoff Data"
            description={`No bracket has been recorded for the ${year} season.`}
            actionLabel={`Back to ${year} season`}
            actionHref={`/seasons/${year}`}
          />
        </section>
      ) : (
        <section className="pb-8 md:pb-12 space-y-10">
          {/* Winners bracket */}
          {bracket.winners.length > 0 && (
            <ScrollReveal delay={80}>
              <div className="space-y-4">
                <div>
                  <p className="text-kicker text-accent-gold mb-1.5">
                    The Bracket
                  </p>
                  <h2 className="text-h2 text-text-primary">
                    Chasing the Ring
                  </h2>
                </div>
                <PlayoffBracketRounds
                  rounds={bracket.winners}
                  bracketType="winners"
                  seasonYear={year}
                />
              </div>
            </ScrollReveal>
          )}

          {/* Toilet Bowl */}
          {bracket.losers.length > 0 && (
            <ScrollReveal delay={160}>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-divider" />
                  <h2 className="text-kicker whitespace-nowrap">
                    {TOILET_BOWL_COPY.heading}
                  </h2>
                  <div className="h-px flex-1 bg-divider" />
                </div>
                <p className="text-body-sm text-text-secondary max-w-prose">
                  {TOILET_BOWL_COPY.explainer}
                </p>
                <PlayoffBracketRounds
                  rounds={bracket.losers}
                  bracketType="losers"
                  seasonYear={year}
                />
              </div>
            </ScrollReveal>
          )}

          {/* The sting: the team that sank all the way to the bottom */}
          {toiletBowlChampion && (
            <ScrollReveal delay={240}>
              <ToiletBowlStingCard champion={toiletBowlChampion} />
            </ScrollReveal>
          )}
        </section>
      )}
    </>
  );
}

/**
 * Sting card for the Toilet Bowl champion: warm-tint surface, rust accent, the
 * centralized snarky label. Only rendered for a decided final.
 */
function ToiletBowlStingCard({ champion }: { champion: ToiletBowlChampion }) {
  const label = SNARKY_LABELS.TOILET_BOWL_CHAMPION;

  return (
    <div
      data-testid="toilet-bowl-sting"
      className="card-surface card-tint-warm max-w-lg space-y-4 p-6"
    >
      <p className="text-kicker text-accent-warm">
        {TOILET_BOWL_COPY.championKicker}
      </p>
      <FranchiseIdentity
        franchise={{
          slug: champion.franchiseSlug,
          name: champion.franchiseName,
          abbreviation: champion.franchiseAbbreviation ?? undefined,
          brandingColor: champion.franchiseBrandingColor ?? undefined,
          avatarUrl: champion.avatarUrl,
        }}
        variant="compact"
      />
      <p className="text-body-sm text-text-secondary">{label.description}.</p>
      <SuperlativeBadge text={label.displayText} variant="brown" />
    </div>
  );
}
