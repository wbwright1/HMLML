import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { seasons, franchiseSeasons, franchises } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { PageSection } from "@/components/page-section";
import { SuperlativeBadge } from "@/components/superlative-badge";
import {
  DraftBoard,
  type DraftBoardTeam,
  type DraftBoardRound,
  type DraftBoardCell,
} from "@/components/draft-board";
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

// ---------------------------------------------------------------------------
// Data shaping: DraftPickWithFranchise[] -> DraftBoardProps
// ---------------------------------------------------------------------------

function formatRoundPick(round: number, pickInRound: number): string {
  return `${round}.${String(pickInRound).padStart(2, "0")}`;
}

function shapeDraftBoard(
  picks: DraftPickWithFranchise[],
  isLegacy: boolean
) {
  if (picks.length === 0) return null;

  // Determine team order from round 1 picks (first round pick order = column order)
  const round1Picks = picks
    .filter((p) => p.round === 1)
    .sort((a, b) => a.pickNumber - b.pickNumber);

  const totalTeams = round1Picks.length;
  if (totalTeams === 0) return null;

  // Build teams array in draft position order
  const teams: DraftBoardTeam[] = round1Picks.map((pick, idx) => ({
    franchiseId: pick.franchiseId ?? `unknown-${idx}`,
    franchiseName: pick.franchiseName,
    franchiseAbbreviation: pick.franchiseAbbreviation,
    franchiseBrandingColor: pick.franchiseBrandingColor,
    franchiseSlug: pick.franchiseSlug,
    draftPosition: idx,
  }));

  // Map franchiseId to column index (draft position)
  const franchiseColumnMap = new Map<string, number>();
  for (const team of teams) {
    franchiseColumnMap.set(team.franchiseId, team.draftPosition);
  }

  // Group picks by round
  const roundsMap = new Map<number, DraftPickWithFranchise[]>();
  for (const pick of picks) {
    if (!roundsMap.has(pick.round)) {
      roundsMap.set(pick.round, []);
    }
    roundsMap.get(pick.round)!.push(pick);
  }

  const roundNumbers = Array.from(roundsMap.keys()).sort((a, b) => a - b);

  // Build rounds with cells in display order
  const rounds: DraftBoardRound[] = roundNumbers.map((roundNum) => {
    const roundPicks = roundsMap.get(roundNum)!;
    roundPicks.sort((a, b) => a.pickNumber - b.pickNumber);

    // Create cells array indexed by column position
    const cellsByColumn: (DraftBoardCell | null)[] = new Array(totalTeams).fill(null);

    for (let i = 0; i < roundPicks.length; i++) {
      const pick = roundPicks[i];
      const pickInRound = i + 1;

      // For snake draft: odd rounds L-to-R, even rounds R-to-L
      // Pick order is always ascending by pickNumber, so for odd rounds
      // the i-th pick goes to column i, for even rounds column (totalTeams - 1 - i)
      const isEvenRound = roundNum % 2 === 0;
      const columnIdx = isEvenRound ? totalTeams - 1 - i : i;

      cellsByColumn[columnIdx] = {
        pickNumber: pick.pickNumber,
        roundPickNumber: formatRoundPick(roundNum, pickInRound),
        playerName: pick.playerName,
        playerPosition: pick.playerPosition,
        franchiseId: pick.franchiseId,
        isEmpty: false,
      };
    }

    // Fill any remaining null cells (shouldn't happen for complete drafts)
    const cells: DraftBoardCell[] = cellsByColumn.map((cell, idx) => {
      if (cell) return cell;
      const pickInRound = idx + 1;
      return {
        pickNumber: (roundNum - 1) * totalTeams + pickInRound,
        roundPickNumber: formatRoundPick(roundNum, pickInRound),
        playerName: null,
        playerPosition: null,
        franchiseId: null,
        isEmpty: true,
      };
    });

    return {
      roundNumber: roundNum,
      cells,
    };
  });

  return { teams, rounds, totalTeams };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

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

  // If no picks exist, check if this is an upcoming draft
  const isUpcoming = !draftData || draftData.drafts.length === 0;
  let upcomingBoard: { teams: DraftBoardTeam[]; rounds: DraftBoardRound[]; totalTeams: number } | null = null;

  if (isUpcoming) {
    // Check if this season exists and has franchise data
    try {
      upcomingBoard = await buildUpcomingDraftBoard(year);
    } catch {
      // Failed to build upcoming board
    }

    if (!upcomingBoard) {
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

      {isUpcoming && upcomingBoard && (
        <PageSection label="Rookie Draft" title="Rookie Draft">
          <div className="flex flex-wrap items-center gap-3">
            <SuperlativeBadge text="Upcoming" variant="green" />
            <span className="text-sm text-text-tertiary">
              {upcomingBoard.totalTeams} teams &middot; {upcomingBoard.rounds.length} rounds
            </span>
          </div>
          <div className="mt-4">
            <DraftBoard
              teams={upcomingBoard.teams}
              rounds={upcomingBoard.rounds}
              totalTeams={upcomingBoard.totalTeams}
              isUpcoming={true}
            />
          </div>
        </PageSection>
      )}

      {!isUpcoming && draftData && draftData.drafts.map((draft) => {
        const boardData = shapeDraftBoard(draft.picks, draft.isLegacyEra);

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
                {draft.picks.length} picks &middot;{" "}
                {boardData ? boardData.rounds.length : 0} rounds
              </span>
            </div>

            {boardData && (
              <div className="mt-4">
                <DraftBoard
                  teams={boardData.teams}
                  rounds={boardData.rounds}
                  totalTeams={boardData.totalTeams}
                  isUpcoming={false}
                />
              </div>
            )}
          </PageSection>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Build upcoming draft board from Sleeper API + DB franchise data
// ---------------------------------------------------------------------------

async function buildUpcomingDraftBoard(year: number) {
  // Verify the season exists
  const [season] = await db
    .select({ id: seasons.id, leagueId: seasons.leagueId })
    .from(seasons)
    .where(eq(seasons.seasonYear, year))
    .limit(1);

  if (!season) return null;

  // Get franchise data for this season (or latest season with data)
  let franchiseData = await db
    .select({
      franchiseId: franchiseSeasons.franchiseId,
      rosterId: franchiseSeasons.rosterId,
      userId: franchiseSeasons.userId,
      franchiseName: franchises.name,
      franchiseAbbreviation: franchises.abbreviation,
      franchiseBrandingColor: franchises.brandingColor,
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
      franchiseData = await db
        .select({
          franchiseId: franchiseSeasons.franchiseId,
          rosterId: franchiseSeasons.rosterId,
          userId: franchiseSeasons.userId,
          franchiseName: franchises.name,
          franchiseAbbreviation: franchises.abbreviation,
          franchiseBrandingColor: franchises.brandingColor,
          franchiseSlug: franchises.slug,
        })
        .from(franchiseSeasons)
        .innerJoin(franchises, eq(franchiseSeasons.franchiseId, franchises.id))
        .where(eq(franchiseSeasons.seasonId, latestWithData.id));
    }
  }

  if (franchiseData.length === 0) return null;

  // Try to get draft order from Sleeper
  const { getLeagueDrafts } = await import("@/lib/sleeper");
  const draftsResult = await getLeagueDrafts(season.leagueId);

  let orderedTeams: typeof franchiseData = [];

  if ("data" in draftsResult) {
    const upcomingDraft = draftsResult.data.find(
      (d) => d.status === "pre_draft" && d.draft_order
    );

    if (upcomingDraft?.draft_order) {
      // draft_order: { userId: slot }
      const userToSlot = new Map<string, number>();
      for (const [userId, slot] of Object.entries(upcomingDraft.draft_order)) {
        userToSlot.set(userId, slot);
      }

      // Sort franchises by their draft slot
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

  const teams: DraftBoardTeam[] = orderedTeams.map((f, idx) => ({
    franchiseId: f.franchiseId,
    franchiseName: f.franchiseName,
    franchiseAbbreviation: f.franchiseAbbreviation,
    franchiseBrandingColor: f.franchiseBrandingColor,
    franchiseSlug: f.franchiseSlug,
    draftPosition: idx,
  }));

  const rounds: DraftBoardRound[] = [];
  for (let round = 1; round <= numRounds; round++) {
    const cells: DraftBoardCell[] = [];
    for (let col = 0; col < totalTeams; col++) {
      // Snake: even rounds reverse order
      const isEven = round % 2 === 0;
      const pickInRound = isEven ? totalTeams - col : col + 1;
      const pickNumber = (round - 1) * totalTeams + pickInRound;

      cells.push({
        pickNumber,
        roundPickNumber: `${round}.${String(pickInRound).padStart(2, "0")}`,
        playerName: null,
        playerPosition: null,
        franchiseId: null,
        isEmpty: true,
      });
    }
    rounds.push({ roundNumber: round, cells });
  }

  return { teams, rounds, totalTeams };
}
