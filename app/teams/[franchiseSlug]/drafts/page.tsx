import { notFound } from "next/navigation";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { PageSection } from "@/components/page-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { MobileTableView } from "@/components/mobile-table-view";
import { PositionBadge } from "@/components/position-badge";
import { getFranchiseBySlug } from "@/lib/queries/franchises";
import { getFranchiseDraftHistory } from "@/lib/queries/drafts";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

interface FranchiseDraftsPageProps {
  params: Promise<{ franchiseSlug: string }>;
}

export async function generateMetadata({ params }: FranchiseDraftsPageProps) {
  const { franchiseSlug } = await params;

  let franchise: Awaited<ReturnType<typeof getFranchiseBySlug>> = null;
  try {
    franchise = await getFranchiseBySlug(franchiseSlug);
  } catch {
    // DB may not be connected in dev
  }

  if (!franchise) {
    return { title: "Draft History Not Found | Harambe Memorial League Memorial League" };
  }

  return {
    title: `${franchise.name} Draft History | Harambe Memorial League Memorial League`,
    description: `Complete draft history for ${franchise.name} in the Harambe Memorial League Memorial League.`,
  };
}

export default async function FranchiseDraftsPage({
  params,
}: FranchiseDraftsPageProps) {
  const { franchiseSlug } = await params;

  let franchise: Awaited<ReturnType<typeof getFranchiseBySlug>> = null;

  try {
    franchise = await getFranchiseBySlug(franchiseSlug);
  } catch {
    // DB may not be connected in dev
  }

  if (!franchise) {
    notFound();
  }

  let draftHistory: Awaited<ReturnType<typeof getFranchiseDraftHistory>> = [];

  try {
    draftHistory = await getFranchiseDraftHistory(franchise.id);
  } catch {
    // Draft data may not be available
  }

  // Determine championship count for identity display
  const championships = franchise.seasonHistory.filter(
    (s) => s.playoffResult === "champion"
  ).length;

  // Compute total picks for the stats summary
  const totalPicks = draftHistory.reduce(
    (sum, draft) => sum + draft.picks.length,
    0
  );

  return (
    <>
      {/* Hero Section */}
      <section className="py-8 md:py-12 space-y-6">
        <BackLink href={`/teams/${franchise.slug}`} label={franchise.name} />

        <FranchiseIdentity
          franchise={{
            slug: franchise.slug,
            name: franchise.name,
            abbreviation: franchise.abbreviation,
            brandingColor: franchise.brandingColor,
            avatarUrl: franchise.avatarUrl,
          }}
          championships={championships}
          variant="hero"
        />

        {draftHistory.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground pt-2 font-mono">
            <span>
              <span className="font-bold text-text-primary tabular-nums">
                {totalPicks}
              </span>{" "}
              total picks
            </span>
            <span>
              <span className="font-bold text-text-primary tabular-nums">
                {draftHistory.length}
              </span>{" "}
              {draftHistory.length === 1 ? "draft" : "drafts"}
            </span>
          </div>
        )}
      </section>

      {/* Draft History */}
      <PageSection label="All Picks" title="Draft History.">
        {draftHistory.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No Draft History"
            description="Draft history will appear once draft data has been synced from Sleeper."
          />
        ) : (
          <div className="space-y-12">
            {draftHistory.map((draft, draftIndex) => (
              <ScrollReveal key={draft.draftId} delay={draftIndex * 60}>
                <div
                  className={`rounded-xl border bg-surface p-5 transition-colors hover:border-border-strong ${
                    draft.isLegacyEra ? "border-border/60 bg-surface/60" : "border-border"
                  }`}
                >
                  {/* Draft header */}
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <Link
                      href={`/drafts/${draft.seasonYear}`}
                      className="text-h3 hover:text-primary transition-colors"
                    >
                      {draft.seasonYear}
                    </Link>
                    <SuperlativeBadge
                      text={
                        draft.draftType === "startup" ? "Startup" : "Rookie"
                      }
                      variant={
                        draft.draftType === "startup" ? "green" : "neutral"
                      }
                    />
                    {draft.isLegacyEra && (
                      <span className="text-caption text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        Legacy Era
                      </span>
                    )}
                    <span className="text-sm text-muted-foreground font-mono tabular-nums">
                      {draft.picks.length} picks
                    </span>
                  </div>

                  {/* Picks table */}
                  <MobileTableView
                    headers={["Round", "Pick", "Player", "Pos"]}
                    keyColumns={[0, 1, 2, 3]}
                    rows={draft.picks.map((pick) => [
                      <span
                        key="round"
                        className="font-mono tabular-nums text-muted-foreground"
                      >
                        Rd {pick.round}
                      </span>,
                      <span
                        key="pick"
                        className="font-mono tabular-nums text-muted-foreground"
                      >
                        #{pick.pickNumber}
                      </span>,
                      <span
                        key="player"
                        className={`font-medium ${
                          draft.isLegacyEra ? "text-muted-foreground" : "text-text-primary"
                        }`}
                      >
                        {pick.playerName ?? "Unknown Player"}
                      </span>,
                      <PositionBadge
                        key="pos"
                        position={pick.playerPosition}
                      />,
                    ])}
                  />
                </div>
              </ScrollReveal>
            ))}
          </div>
        )}
      </PageSection>
    </>
  );
}

