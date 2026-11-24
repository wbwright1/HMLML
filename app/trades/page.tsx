import { PageSection } from "@/components/page-section";
import { rethrowUnlessTolerable } from "@/lib/db-guard";
import { BackLink } from "@/components/back-link";
import { EmptyState } from "@/components/empty-state";
import { ScrollReveal } from "@/components/scroll-reveal";
import { BrandedCrest } from "@/components/franchise-identity";
import { TeamLink } from "@/components/team-link";
import { TradeCard } from "@/components/trade-card";
import { TradeScrollFocus } from "@/components/trades/trade-scroll-focus";
import { GradeFormulaNugget } from "@/components/grade-formula-nugget";
import { TradeFilters } from "@/app/trades/trade-filters";
import { getTrades, filterTrades } from "@/lib/queries/trades";
import { getTradeVerdicts } from "@/lib/queries/trade-verdicts";
import { getTradeGrades } from "@/lib/queries/trade-grades";
import { getTradeValues } from "@/lib/queries/trade-values";
import { getAllFranchises } from "@/lib/queries/franchises";
import { getAllSeasons } from "@/lib/queries/seasons";

// Dynamically rendered: ?season= and ?team= narrow the server-rendered trade list, and awaiting searchParams opts a route out
// of static rendering, so a `revalidate` export here would be inert. Caching
// these needs unstable_cache around the queries (tracked as follow-up work;
// mind that it serializes Date fields to strings behind unchanged types).

export const metadata = {
  title: "Trade History | Harambe Memorial League Memorial League",
  description:
    "Every completed trade in Harambe Memorial League Memorial League history: who gave up what, who got fleeced, and the hindsight grades to prove it.",
};

interface TradesPageProps {
  searchParams: Promise<{ season?: string; team?: string; highlight?: string }>;
}

export default async function TradesPage({ searchParams }: TradesPageProps) {
  const { season, team, highlight } = await searchParams;

  let allFranchises: Awaited<ReturnType<typeof getAllFranchises>> = null;
  let allSeasons: Awaited<ReturnType<typeof getAllSeasons>> = [];

  try {
    [allFranchises, allSeasons] = await Promise.all([
      getAllFranchises(),
      getAllSeasons(),
    ]);
  } catch (e) {
    rethrowUnlessTolerable(e);
    // DB may not be connected in dev
  }

  const franchiseList = allFranchises ?? [];

  const selectedFranchise = team
    ? franchiseList.find((f) => f.slug === team)
    : undefined;

  // Fetch ALL trades: grading needs full flip-chain context even on a
  // filtered view. The visible list narrows afterward.
  const [allTrades, verdicts] = await Promise.all([
    getTrades(),
    getTradeVerdicts(),
  ]);
  const grades = await getTradeGrades(allTrades);
  const tradeValues = await getTradeValues(allTrades);

  // Season scope. A bare /trades opens on the current season (the most
  // recent season with a trade, so an early offseason never opens empty);
  // ?season=all is "All seasons". A team-scoped (?team=) or deep-linked
  // (?highlight=) view with no season widens to all seasons, so a franchise's
  // trade history and flip links to older trades keep landing on their card.
  const defaultSeasonYear =
    allTrades.reduce<number | null>(
      (max, t) => (max == null || t.seasonYear > max ? t.seasonYear : max),
      null,
    ) ??
    allSeasons.reduce<number | null>(
      (max, s) => (max == null || s.seasonYear > max ? s.seasonYear : max),
      null,
    );
  const requestedSeason = season
    ? allSeasons.find((s) => String(s.seasonYear) === season)
    : undefined;
  const scopedSeasonYear: number | undefined =
    season === "all"
      ? undefined
      : requestedSeason
        ? requestedSeason.seasonYear
        : !season && !team && !highlight
          ? (defaultSeasonYear ?? undefined)
          : undefined;
  const seasonFilterValue =
    scopedSeasonYear != null ? String(scopedSeasonYear) : "all";

  const trades = filterTrades(allTrades, {
    seasonYear: scopedSeasonYear,
    franchiseId: selectedFranchise?.id,
  });

  const listLabel = `${scopedSeasonYear ?? "All seasons"} · ${trades.length} ${
    trades.length === 1 ? "trade" : "trades"
  }`;

  return (
    <PageSection
      as="h1"
      title="Trades"
      intro="Every trade, graded once the results are in."
    >
      {selectedFranchise && (
        <div className="space-y-2">
          <BackLink
            href={`/teams/${selectedFranchise.slug}`}
            label={selectedFranchise.name}
          />
          <TeamLink
            slug={selectedFranchise.slug}
            className="group flex min-h-11 w-fit items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <BrandedCrest
              franchise={{
                slug: selectedFranchise.slug,
                name: selectedFranchise.name,
                abbreviation: selectedFranchise.abbreviation,
                brandingColor: selectedFranchise.brandingColor,
                avatarUrl: selectedFranchise.avatarUrl,
              }}
              size="md"
            />
            <h2 className="text-h3 text-text-primary transition-colors group-hover:text-accent-gold">
              {selectedFranchise.name}
            </h2>
          </TeamLink>
        </div>
      )}

      <TradeFilters
        seasons={allSeasons.map((s) => ({ seasonYear: s.seasonYear }))}
        teams={franchiseList.map((f) => ({ slug: f.slug, name: f.name }))}
        selectedSeason={seasonFilterValue}
        selectedTeam={team}
      />

      <GradeFormulaNugget />

      {trades.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="No Trades Found"
          description="No completed trades match these filters yet. Try clearing them, or check back once more deals get synced from Sleeper."
        />
      ) : (
        <div className="space-y-4">
          <h2 className="text-kicker" data-testid="trade-list-label">
            {listLabel}
          </h2>
          {trades.map((trade, index) => {
            const isHighlight = String(trade.id) === highlight;
            return (
              <ScrollReveal key={trade.id} delay={isHighlight ? 0 : Math.min(index, 6) * 40}>
                <TradeCard
                  trade={trade}
                  verdict={verdicts.get(String(trade.id))}
                  grade={grades.get(trade.id)}
                  values={tradeValues.get(trade.id) ?? null}
                  highlighted={isHighlight}
                />
              </ScrollReveal>
            );
          })}
          {highlight && trades.length > 0 && (
            <TradeScrollFocus targetId={highlight} />
          )}
        </div>
      )}

      {tradeValues.size > 0 && (
        <p className="text-caption text-text-tertiary pt-2">
          Dynasty values via FantasyCalc; historical snapshots via DynastyProcess.
        </p>
      )}
    </PageSection>
  );
}
