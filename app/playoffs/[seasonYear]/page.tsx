import { notFound } from "next/navigation";
import { rethrowUnlessTolerable } from "@/lib/db-guard";
import { BackLink } from "@/components/back-link";
import { PageSection } from "@/components/page-section";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { FranchiseLogo } from "@/components/franchise-logo";
import { TeamLink } from "@/components/team-link";
import { ChampionshipStars } from "@/components/championship-stars";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { ScrollReveal } from "@/components/scroll-reveal";
import { EmptyState } from "@/components/empty-state";
import { PlayoffBracketStage } from "@/components/playoff-bracket-stage";
import { getSeasonByYearSimple } from "@/lib/queries/matchups";
import {
  getSeasonBracket,
  getSeasonChampion,
  getToiletBowlChampion,
  type ToiletBowlChampion,
} from "@/lib/queries/playoff-bracket";
import { SNARKY_LABELS } from "@/lib/content";
import { getBowlName } from "@/lib/bowl-names";
import { TOILET_BOWL_COPY } from "@/lib/playoff-labels";

// ISR: rendered once, then served from cache until a successful sync calls
// revalidatePath("/", "layout"). Time window is only a backstop (lib/cache.ts).
export const revalidate = 3600;

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
  } catch (e) {
    rethrowUnlessTolerable(e);
    /* DB may not be connected */
  }
  if (!season) notFound();

  const [bracket, toiletBowlChampion, champion] = await Promise.all([
    getSeasonBracket(season.id, season.playoffWeekStart, season.totalRosters),
    getToiletBowlChampion(season.id),
    getSeasonChampion(season.id),
  ]);

  const hasBracket = bracket.winners.length > 0 || bracket.losers.length > 0;
  // Three distinct states, never collapsed into one: the bracket read failed,
  // the season genuinely has no bracket, or we have one. A failed read must not
  // claim the playoffs never happened, and neither case may hide the champion
  // or the Toilet Bowl sting, which come from their own queries.
  const showEmptyState = !hasBracket && !bracket.unavailable;

  // Legacy seasons predate the HMLML Bowl naming, so they keep the plain title.
  const bowlName = getBowlName(year);
  const pageTitle = bowlName ? `The road to ${bowlName}.` : "Playoff Results.";

  return (
    <>
      <PageSection label={`${year} Season`} title={pageTitle}>
        <div className="flex flex-wrap items-center gap-4">
          <BackLink href={`/seasons/${year}`} label={`${year} Season`} />
        </div>

        {/* Champion hero, with the crest this franchise wore that season. */}
        {champion && (
          <ScrollReveal>
            <div className="mt-6 card-surface card-tint-gold p-8 text-center space-y-3">
              <p className="text-kicker text-gold mb-1">Champion</p>
              {/* ONE link over crest, name and stars, not two to the same
                  place. */}
              <TeamLink
                slug={champion.franchiseSlug}
                className="flex flex-col items-center gap-3 text-gold"
              >
                <FranchiseLogo
                  slug={champion.franchiseSlug}
                  name={champion.franchiseName}
                  abbreviation={champion.franchiseAbbreviation ?? undefined}
                  brandingColor={champion.franchiseBrandingColor ?? undefined}
                  avatarUrl={champion.avatarUrl}
                  size="xl"
                  decorative
                />
                <span className="text-h1">{champion.franchiseName}</span>
                <ChampionshipStars count={1} variant="hero" />
              </TeamLink>
            </div>
          </ScrollReveal>
        )}
      </PageSection>

      {showEmptyState ? (
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
          {/* Calm degradation: the bracket read failed, but the champion and
              the Toilet Bowl sting below come from their own queries and are
              still worth showing. */}
          {bracket.unavailable && (
            <div className="card-surface p-6">
              <p className="text-body text-text-secondary">
                Something went wrong loading the bracket. We&rsquo;re showing
                the last available data.
              </p>
            </div>
          )}

          {/* Winners bracket. The reveal wraps the header only: an animated
              transform host around an overflow-x scroller has broken scrolling
              on this site before. */}
          {bracket.winners.length > 0 && (
            <div className="space-y-4">
              <ScrollReveal delay={80}>
                <div>
                  <p className="text-kicker text-accent-gold mb-1.5">
                    The Bracket
                  </p>
                  <h2 className="text-h2 text-text-primary">
                    Chasing the Ring
                  </h2>
                </div>
              </ScrollReveal>
              <PlayoffBracketStage
                rounds={bracket.winners}
                bracketType="winners"
                seasonYear={year}
                totalRosters={season.totalRosters}
              />
            </div>
          )}

          {/* Toilet Bowl */}
          {bracket.losers.length > 0 && (
            <div className="space-y-4">
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
                </div>
              </ScrollReveal>
              <PlayoffBracketStage
                rounds={bracket.losers}
                bracketType="losers"
                seasonYear={year}
                totalRosters={season.totalRosters}
              />
            </div>
          )}

        </section>
      )}

      {/* The sting: the team that sank all the way to the bottom. Rendered
          outside the bracket gate on purpose. It reads
          seasons.toilet_bowl_franchise_id, so it stays true even when the
          bracket rows are missing or unreadable. */}
      {toiletBowlChampion && (
        <section className="pb-8 md:pb-12">
          <ScrollReveal delay={240}>
            <ToiletBowlStingCard champion={toiletBowlChampion} />
          </ScrollReveal>
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
      <TeamLink slug={champion.franchiseSlug} className="group block">
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
      </TeamLink>
      <p className="text-body-sm text-text-secondary">{label.description}.</p>
      <SuperlativeBadge text={label.displayText} variant="brown" />
    </div>
  );
}
