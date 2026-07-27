import { PageSection } from "@/components/page-section";
import { BackLink } from "@/components/back-link";
import { EmptyState } from "@/components/empty-state";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { TradeCard } from "@/components/trade-card";
import { TradeFilters } from "@/app/trades/trade-filters";
import { getTrades, filterTrades } from "@/lib/queries/trades";
import { getTradeVerdicts } from "@/lib/queries/trade-verdicts";
import { getTradeGrades } from "@/lib/queries/trade-grades";
import { getTradeValues } from "@/lib/queries/trade-values";
import { getAllFranchises } from "@/lib/queries/franchises";
import { getAllSeasons } from "@/lib/queries/seasons";

export const metadata = {
  title: "Trade History | Harambe Memorial League Memorial League",
  description:
    "Every completed trade in Harambe Memorial League Memorial League history: who gave up what, who got fleeced, and the hindsight grades to prove it.",
};

interface TradesPageProps {
  searchParams: Promise<{ season?: string; team?: string }>;
}

export default async function TradesPage({ searchParams }: TradesPageProps) {
  const { season, team } = await searchParams;

  let allFranchises: Awaited<ReturnType<typeof getAllFranchises>> = null;
  let allSeasons: Awaited<ReturnType<typeof getAllSeasons>> = [];

  try {
    [allFranchises, allSeasons] = await Promise.all([
      getAllFranchises(),
      getAllSeasons(),
    ]);
  } catch {
    // DB may not be connected in dev
  }

  const franchiseList = allFranchises ?? [];

  const selectedFranchise = team
    ? franchiseList.find((f) => f.slug === team)
    : undefined;

  const selectedSeason = season
    ? allSeasons.find((s) => String(s.seasonYear) === season)
    : undefined;

  // Fetch ALL trades: grading needs full flip-chain context even on a
  // filtered view. The visible list narrows afterward.
  const [allTrades, verdicts] = await Promise.all([
    getTrades(),
    getTradeVerdicts(),
  ]);
  const grades = await getTradeGrades(allTrades);
  const tradeValues = await getTradeValues(allTrades);
  const trades = filterTrades(allTrades, {
    seasonYear: selectedSeason?.seasonYear,
    franchiseId: selectedFranchise?.id,
  });

  return (
    <PageSection label="The Receipts" title="Trade History.">
      {selectedFranchise && (
        <BackLink
          href={`/teams/${selectedFranchise.slug}`}
          label={selectedFranchise.name}
        />
      )}

      <p className="text-body-lg text-text-tertiary max-w-prose">
        Every completed trade in league history, graded in hindsight once the
        receipts have had time to print: real points scored, flipped picks
        followed down the chain, no projections, no mercy. FAAB and cash
        considerations aren&apos;t tracked here, but the grades don&apos;t
        need them.
      </p>

      {selectedFranchise && (
        <ScrollReveal>
          <FranchiseIdentity
            franchise={{
              slug: selectedFranchise.slug,
              name: selectedFranchise.name,
              abbreviation: selectedFranchise.abbreviation,
              brandingColor: selectedFranchise.brandingColor,
              avatarUrl: selectedFranchise.avatarUrl,
            }}
            championships={selectedFranchise.championships}
            variant="hero"
          />
        </ScrollReveal>
      )}

      <TradeFilters
        seasons={allSeasons.map((s) => ({ seasonYear: s.seasonYear }))}
        teams={franchiseList.map((f) => ({ slug: f.slug, name: f.name }))}
        selectedSeason={season}
        selectedTeam={team}
      />

      {trades.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="No Trades Found"
          description="No completed trades match these filters yet. Try clearing them, or check back once more deals get synced from Sleeper."
        />
      ) : (
        <div className="space-y-4">
          {trades.map((trade, index) => (
            <ScrollReveal key={trade.id} delay={index * 40}>
              <TradeCard
                trade={trade}
                verdict={verdicts.get(String(trade.id))}
                grade={grades.get(trade.id)}
                values={tradeValues.get(trade.id) ?? null}
              />
            </ScrollReveal>
          ))}
        </div>
      )}

      {tradeValues.size > 0 && (
        <p className="text-caption text-text-muted normal-case tracking-normal pt-2">
          Dynasty values via FantasyCalc; historical snapshots via DynastyProcess.
        </p>
      )}
    </PageSection>
  );
}
