import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { seasons, franchiseSeasons, franchises, rosterPlayers, players } from "@/lib/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
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

  const isUpcoming = !draftData || draftData.drafts.length === 0;
  let upcomingPicks: UpcomingPick[] | null = null;

  if (isUpcoming) {
    try {
      upcomingPicks = await buildUpcomingDraftPicks(year);
    } catch {
      // Failed to build upcoming board
    }

    if (!upcomingPicks) {
      notFound();
    }
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
          <div className="flex items-center gap-3">
            <h1 className="text-h1">{year} Draft</h1>
            {isUpcoming && <SuperlativeBadge text="Upcoming" variant="green" />}
          </div>
        </div>
      </section>

      {isUpcoming && upcomingPicks && (
        <UpcomingDraftSection picks={upcomingPicks} />
      )}

      {!isUpcoming && draftData && draftData.drafts.map((draft) => {
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
                          <span key="team">
                            {pick.franchiseSlug ? (
                              <Link
                                href={`/teams/${pick.franchiseSlug}`}
                                className="font-medium text-primary hover:text-primary/80 transition-colors"
                              >
                                {pick.franchiseName ?? "Unknown"}
                              </Link>
                            ) : (
                              <span className="text-text-tertiary">
                                {pick.franchiseName ?? "Unknown"}
                              </span>
                            )}
                            {pick.originalFranchiseName && (
                              <span className="text-xs text-text-tertiary ml-1">
                                (via {pick.originalFranchiseName})
                              </span>
                            )}
                          </span>,
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

// ---------------------------------------------------------------------------
// Upcoming Draft Types & Section
// ---------------------------------------------------------------------------

interface PositionCounts {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
}

interface UpcomingPick {
  pickNumber: number;
  round: number;
  franchiseId: string;
  franchiseName: string;
  franchiseSlug: string | null;
  roster: PositionCounts;
  originalFranchiseName: string | null;
}

function formatRoster(roster: PositionCounts): string {
  return `${roster.QB} QB, ${roster.RB} RB, ${roster.WR} WR, ${roster.TE} TE`;
}

function UpcomingDraftSection({ picks }: { picks: UpcomingPick[] }) {
  // Group by round
  const roundsMap = new Map<number, UpcomingPick[]>();
  for (const pick of picks) {
    if (!roundsMap.has(pick.round)) {
      roundsMap.set(pick.round, []);
    }
    roundsMap.get(pick.round)!.push(pick);
  }

  const rounds = Array.from(roundsMap.keys()).sort((a, b) => a - b);

  return (
    <PageSection label="Rookie Draft" title="Rookie Draft">
      <div className="flex flex-wrap items-center gap-3">
        <SuperlativeBadge text="Upcoming" variant="green" />
        <span className="text-sm text-text-tertiary">
          {picks.length} picks &middot; {rounds.length} rounds
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
                  headers={["Pick", "Team", "Roster"]}
                  keyColumns={[0, 1, 2]}
                  rows={roundPicks.map((pick) => [
                    <span
                      key="pick"
                      className="tabular-nums text-text-tertiary"
                    >
                      {pick.pickNumber}
                    </span>,
                    <span key="team">
                      {pick.franchiseSlug ? (
                        <Link
                          href={`/teams/${pick.franchiseSlug}`}
                          className="font-medium text-primary hover:text-primary/80 transition-colors"
                        >
                          {pick.franchiseName}
                        </Link>
                      ) : (
                        <span className="text-text-secondary">
                          {pick.franchiseName}
                        </span>
                      )}
                      {pick.originalFranchiseName && (
                        <span className="text-xs text-text-tertiary ml-1">
                          (via {pick.originalFranchiseName})
                        </span>
                      )}
                    </span>,
                    <span
                      key="roster"
                      className="text-sm tabular-nums text-text-secondary"
                    >
                      {formatRoster(pick.roster)}
                    </span>,
                  ])}
                />
              </div>
            </ScrollReveal>
          );
        })}
      </div>
    </PageSection>
  );
}

// ---------------------------------------------------------------------------
// Build upcoming draft picks from Sleeper API + DB franchise data
// ---------------------------------------------------------------------------

async function buildUpcomingDraftPicks(year: number): Promise<UpcomingPick[] | null> {
  // Verify the season exists
  const [season] = await db
    .select({ id: seasons.id, leagueId: seasons.leagueId })
    .from(seasons)
    .where(eq(seasons.seasonYear, year))
    .limit(1);

  if (!season) return null;

  // Get franchise data for this season (or latest season with data)
  let franchiseSeasonId = season.id;
  let franchiseData = await db
    .select({
      franchiseId: franchiseSeasons.franchiseId,
      rosterId: franchiseSeasons.rosterId,
      userId: franchiseSeasons.userId,
      franchiseName: franchises.name,
      franchiseSlug: franchises.slug,
    })
    .from(franchiseSeasons)
    .innerJoin(franchises, eq(franchiseSeasons.franchiseId, franchises.id))
    .where(eq(franchiseSeasons.seasonId, season.id));

  // If no franchise data for this season, use the latest season that has it
  if (franchiseData.length === 0) {
    const [latestWithData] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .innerJoin(franchiseSeasons, eq(franchiseSeasons.seasonId, seasons.id))
      .orderBy(desc(seasons.seasonYear))
      .limit(1);

    if (latestWithData) {
      franchiseSeasonId = latestWithData.id;
      franchiseData = await db
        .select({
          franchiseId: franchiseSeasons.franchiseId,
          rosterId: franchiseSeasons.rosterId,
          userId: franchiseSeasons.userId,
          franchiseName: franchises.name,
          franchiseSlug: franchises.slug,
        })
        .from(franchiseSeasons)
        .innerJoin(franchises, eq(franchiseSeasons.franchiseId, franchises.id))
        .where(eq(franchiseSeasons.seasonId, latestWithData.id));
    }
  }

  if (franchiseData.length === 0) return null;

  // Fetch positional counts per franchise in a single query
  const positionRows = await db
    .select({
      franchiseId: rosterPlayers.franchiseId,
      position: players.position,
      count: sql<number>`count(*)::int`,
    })
    .from(rosterPlayers)
    .innerJoin(players, eq(rosterPlayers.playerId, players.id))
    .where(
      and(
        eq(rosterPlayers.seasonId, franchiseSeasonId),
        sql`${players.position} IN ('QB', 'RB', 'WR', 'TE')`
      )
    )
    .groupBy(rosterPlayers.franchiseId, players.position);

  const rosterMap = new Map<string, PositionCounts>();
  for (const row of positionRows) {
    if (!rosterMap.has(row.franchiseId)) {
      rosterMap.set(row.franchiseId, { QB: 0, RB: 0, WR: 0, TE: 0 });
    }
    const counts = rosterMap.get(row.franchiseId)!;
    const pos = row.position as keyof PositionCounts;
    if (pos in counts) {
      counts[pos] = row.count;
    }
  }

  // Build lookup maps: rosterId -> franchise info
  const rosterToFranchise = new Map<string, typeof franchiseData[number]>();
  for (const f of franchiseData) {
    rosterToFranchise.set(f.rosterId, f);
  }

  // Try to get draft order and traded picks from Sleeper
  const { getLeagueDrafts, getLeagueTradedPicks } = await import("@/lib/sleeper");
  const [draftsResult, tradedResult] = await Promise.all([
    getLeagueDrafts(season.leagueId),
    getLeagueTradedPicks(season.leagueId),
  ]);

  // Build traded picks map: { "round-originalRosterId" -> currentOwnerRosterId }
  // Only where owner differs from original roster (i.e., pick was traded)
  const tradedPickMap = new Map<string, string>();
  if ("data" in tradedResult) {
    for (const pick of tradedResult.data) {
      if (pick.owner_id !== pick.roster_id) {
        tradedPickMap.set(`${pick.round}-${pick.roster_id}`, String(pick.owner_id));
      }
    }
  }

  let orderedTeams: typeof franchiseData = [];

  if ("data" in draftsResult) {
    const upcomingDraft = draftsResult.data.find(
      (d) => d.status === "pre_draft" && d.draft_order
    );

    if (upcomingDraft?.draft_order) {
      const userToSlot = new Map<string, number>();
      for (const [userId, slot] of Object.entries(upcomingDraft.draft_order)) {
        userToSlot.set(userId, slot);
      }

      orderedTeams = [...franchiseData].sort((a, b) => {
        const slotA = userToSlot.get(a.userId) ?? 99;
        const slotB = userToSlot.get(b.userId) ?? 99;
        return slotA - slotB;
      });
    }
  }

  // Fallback: alphabetical order if no draft order available
  if (orderedTeams.length === 0) {
    orderedTeams = [...franchiseData].sort((a, b) =>
      (a.franchiseName ?? "").localeCompare(b.franchiseName ?? "")
    );
  }

  const totalTeams = orderedTeams.length;
  const numRounds = 3; // Standard rookie draft rounds
  const emptyRoster: PositionCounts = { QB: 0, RB: 0, WR: 0, TE: 0 };

  const picks: UpcomingPick[] = [];

  for (let round = 1; round <= numRounds; round++) {
    for (let i = 0; i < totalTeams; i++) {
      // Rookie drafts (under 10 rounds) are linear; startup drafts are snake
      const isSnake = numRounds >= 10;
      const teamIdx = isSnake && round % 2 === 0 ? totalTeams - 1 - i : i;
      const originalTeam = orderedTeams[teamIdx];
      const pickNumber = (round - 1) * totalTeams + i + 1;

      // Check if this pick was traded: look up by round + original roster_id
      const tradedToRosterId = tradedPickMap.get(`${round}-${originalTeam.rosterId}`);
      const currentOwner = tradedToRosterId
        ? rosterToFranchise.get(tradedToRosterId)
        : null;

      const displayTeam = currentOwner ?? originalTeam;
      const originalFranchiseName = currentOwner ? (originalTeam.franchiseName ?? "Unknown") : null;

      picks.push({
        pickNumber,
        round,
        franchiseId: displayTeam.franchiseId,
        franchiseName: displayTeam.franchiseName ?? "Unknown",
        franchiseSlug: displayTeam.franchiseSlug,
        roster: rosterMap.get(displayTeam.franchiseId) ?? emptyRoster,
        originalFranchiseName,
      });
    }
  }

  return picks;
}
