import { notFound } from "next/navigation";
import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { MobileTableView } from "@/components/mobile-table-view";
import { PositionBadge } from "@/components/position-badge";
import {
  getDraftBySeasonYear,
  type DraftPickWithFranchise,
} from "@/lib/queries/drafts";

interface DraftDetailPageProps {
  params: Promise<{ seasonYear: string }>;
}

export async function generateMetadata({ params }: DraftDetailPageProps) {
  const { seasonYear } = await params;
  const year = parseInt(seasonYear, 10);

  if (isNaN(year)) {
    return { title: "Draft Not Found | Harambe Memorial League Memorial League" };
  }

  return {
    title: `${year} Draft | Harambe Memorial League Memorial League`,
    description: `Complete draft board for the ${year} Harambe Memorial League Memorial League draft.`,
  };
}

export default async function DraftDetailPage({
  params,
}: DraftDetailPageProps) {
  const { seasonYear } = await params;
  const year = parseInt(seasonYear, 10);

  if (isNaN(year)) {
    notFound();
  }

  let draftData: Awaited<ReturnType<typeof getDraftBySeasonYear>> = null;

  try {
    draftData = await getDraftBySeasonYear(year);
  } catch {
    // DB may not be connected in dev
  }

  if (!draftData || draftData.drafts.length === 0) {
    notFound();
  }

  return (
    <>
      <section className="py-8 md:py-12 space-y-6">
        <Link
          href="/drafts"
          className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
        >
          &larr; All Drafts
        </Link>

        <div className="space-y-2">
          <p className="text-caption uppercase tracking-widest text-accent-green">
            Draft Board
          </p>
          <h1 className="text-h1">{year} Draft</h1>
        </div>
      </section>

      {draftData.drafts.map((draft) => {
        // Group picks by round
        const roundsMap = new Map<number, DraftPickWithFranchise[]>();
        for (const pick of draft.picks) {
          if (!roundsMap.has(pick.round)) {
            roundsMap.set(pick.round, []);
          }
          roundsMap.get(pick.round)!.push(pick);
        }

        const rounds = Array.from(roundsMap.keys()).sort((a, b) => a - b);

        return (
          <PageSection
            key={draft.draftId}
            label={
              draft.draftType === "startup" ? "Startup Draft" : "Rookie Draft"
            }
            title={`${draft.draftType === "startup" ? "Startup" : "Rookie"} Draft`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <SuperlativeBadge
                text={draft.draftType === "startup" ? "Startup" : "Rookie"}
                variant={draft.draftType === "startup" ? "green" : "neutral"}
              />
              {draft.isLegacyEra && (
                <span className="text-xs uppercase tracking-wider text-text-tertiary bg-surface-muted px-2 py-0.5 rounded-full">
                  Legacy Era
                </span>
              )}
              <span className="text-sm text-text-tertiary">
                {draft.picks.length} picks &middot; {rounds.length} rounds
              </span>
            </div>

            <div className="space-y-8 mt-4">
              {rounds.map((roundNum) => {
                const roundPicks = roundsMap.get(roundNum)!;

                return (
                  <ScrollReveal key={roundNum}>
                    <div className="space-y-3">
                      <h3 className="text-xs uppercase tracking-widest text-text-tertiary font-medium border-b border-border pb-2">
                        Round {roundNum}
                      </h3>

                      <MobileTableView
                        headers={["Pick", "Team", "Player", "Pos"]}
                        keyColumns={[0, 1, 2, 3]}
                        rows={roundPicks.map((pick) => [
                          <span
                            key="pick"
                            className="tabular-nums text-text-tertiary"
                          >
                            {pick.pickNumber}
                          </span>,
                          pick.franchiseSlug ? (
                            <Link
                              key="team"
                              href={`/teams/${pick.franchiseSlug}`}
                              className="font-medium text-primary hover:text-primary/80 transition-colors"
                            >
                              {pick.franchiseName ?? "Unknown"}
                            </Link>
                          ) : (
                            <span key="team" className="text-text-tertiary">
                              {pick.franchiseName ?? "Unknown"}
                            </span>
                          ),
                          <span key="player" className="font-medium">
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
                );
              })}
            </div>
          </PageSection>
        );
      })}
    </>
  );
}

