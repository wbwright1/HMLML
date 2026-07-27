import { PageSection } from "@/components/page-section";
import { BackLink } from "@/components/back-link";
import { EmptyState } from "@/components/empty-state";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { TradeCard } from "@/components/trade-card";
import { TradeFilters } from "@/app/trades/trade-filters";
import { getTrades } from "@/lib/queries/trades";
import { getTradeVerdicts } from "@/lib/queries/trade-verdicts";
import { getTradeGrades } from "@/lib/queries/trade-grades";
import { getAllFranchises } from "@/lib/queries/franchises";
import { getAllSeasons } from "@/lib/queries/seasons";

export const metadata = {
  title: "Trade History | Harambe Memorial League Memorial League",
  description:
    "Every completed trade in Harambe Memorial League Memorial League history: who gave up what, and who got fleeced.",
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

  const [trades, verdicts] = await Promise.all([
    getTrades({
      seasonId: selectedSeason?.id,
      franchiseId: selectedFranchise?.id,
    }),
    getTradeVerdicts(),
  ]);
  const grades = await getTradeGrades(trades);

  return (
    <PageSection label="The Receipts" title="Trade History.">
      {selectedFranchise && (
        <BackLink
          href={`/teams/${selectedFranchise.slug}`}
          label={selectedFranchise.name}
        />
      )}

      <p className="text-body-lg text-text-tertiary max-w-prose">
        Every completed trade in league history. FAAB and cash considerations
        aren&apos;t tracked here; if a deal looks lopsided in the player
        columns alone, that&apos;s on the GM who made it.
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
              />
            </ScrollReveal>
          ))}
        </div>
      )}
    </PageSection>
  );
}
