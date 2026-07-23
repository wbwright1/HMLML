import { notFound } from "next/navigation";
import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { PositionBadge } from "@/components/position-badge";
import { PlayerHeadshot } from "@/components/player-headshot";
import { getFranchiseBySlug } from "@/lib/queries/franchises";
import { getFranchiseDraftHistory, type DraftPickWithFranchise } from "@/lib/queries/drafts";
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
        <Link
          href={`/teams/${franchise.slug}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; {franchise.name}
        </Link>

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

                  {/* Picks list (dense rows on mobile, table on desktop) */}
                  <DraftPicksList
                    picks={draft.picks}
                    isLegacyEra={draft.isLegacyEra}
                    fallbackBadge={{
                      slug: franchise.slug,
                      name: franchise.name,
                      abbreviation: franchise.abbreviation ?? null,
                      brandingColor: franchise.brandingColor ?? null,
                      avatarUrl: franchise.avatarUrl ?? null,
                    }}
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

// ---------------------------------------------------------------------------
// DraftPicksList — dense per-pick rows on mobile, a headshot table on desktop.
// The franchise badge on each headshot uses the pick's own-season franchise
// fields, falling back to the page-level franchise identity.
// ---------------------------------------------------------------------------

interface FallbackBadge {
  slug: string | null;
  name: string;
  abbreviation: string | null;
  brandingColor: string | null;
  avatarUrl: string | null;
}

function DraftPicksList({
  picks,
  isLegacyEra,
  fallbackBadge,
}: {
  picks: DraftPickWithFranchise[];
  isLegacyEra: boolean;
  fallbackBadge: FallbackBadge;
}) {
  function badgeFor(pick: DraftPickWithFranchise) {
    return {
      slug: pick.franchiseSlug ?? fallbackBadge.slug,
      name: pick.franchiseName ?? fallbackBadge.name,
      abbreviation: pick.franchiseAbbreviation ?? fallbackBadge.abbreviation,
      brandingColor: pick.franchiseBrandingColor ?? fallbackBadge.brandingColor,
      avatarUrl: pick.franchiseAvatarUrl ?? fallbackBadge.avatarUrl,
    };
  }

  const nameClass = isLegacyEra ? "text-text-tertiary" : "text-text-primary";

  return (
    <>
      {/* Mobile: dense rows */}
      <div className="md:hidden card-surface divide-y divide-divider">
        {picks.map((pick) => (
          <div key={pick.id} className="flex items-center gap-3 p-3">
            <span className="w-10 shrink-0 font-mono text-body-sm tabular-nums text-accent-gold">
              {pick.round}.{pick.pickNumber}
            </span>
            <PlayerHeadshot
              size={40}
              playerId={pick.playerId}
              name={pick.playerName ?? "Unknown Player"}
              showTeamBadge={false}
              franchiseBadge={badgeFor(pick)}
            />
            <p className={`min-w-0 flex-1 truncate text-body font-medium ${nameClass}`}>
              {pick.playerName ?? "Unknown Player"}
            </p>
            <PositionBadge position={pick.playerPosition} />
          </div>
        ))}
      </div>

      {/* Desktop: table with a headshot + name cell */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="pb-3 pr-4 text-left text-kicker">Round</th>
              <th className="pb-3 pr-4 text-left text-kicker">Pick</th>
              <th className="pb-3 pr-4 text-left text-kicker">Player</th>
              <th className="pb-3 pr-0 text-left text-kicker">Pos</th>
            </tr>
          </thead>
          <tbody>
            {picks.map((pick) => (
              <tr key={pick.id} className="border-b border-divider last:border-0">
                <td className="py-3 pr-4 font-mono text-sm tabular-nums text-text-tertiary">
                  Rd {pick.round}
                </td>
                <td className="py-3 pr-4 font-mono text-sm tabular-nums text-text-tertiary">
                  #{pick.pickNumber}
                </td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-3">
                    <PlayerHeadshot
                      size={36}
                      playerId={pick.playerId}
                      name={pick.playerName ?? "Unknown Player"}
                      showTeamBadge={false}
                      franchiseBadge={badgeFor(pick)}
                    />
                    <span className={`text-sm font-medium ${nameClass}`}>
                      {pick.playerName ?? "Unknown Player"}
                    </span>
                  </div>
                </td>
                <td className="py-3 pr-0">
                  <PositionBadge position={pick.playerPosition} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

