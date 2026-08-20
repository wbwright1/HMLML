import { notFound } from "next/navigation";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { db } from "@/lib/db";
import { seasons, franchiseSeasons, franchises, rosterPlayers, players } from "@/lib/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { ScrollReveal } from "@/components/scroll-reveal";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { FranchiseLogo } from "@/components/franchise-logo";
import { PlayerHeadshot } from "@/components/player-headshot";
import { PlayerLink } from "@/components/player-link";
import { getPositionColor } from "@/lib/position-colors";
import { teamAcronym } from "@/lib/team-acronym";
import {
  getDraftBySeasonYear,
  type DraftPickWithFranchise,
} from "@/lib/queries/drafts";
import {
  buildDraftBoard,
  type DraftBoard,
  type NormalizedPick,
  type PositionCounts,
} from "@/lib/draft-board";

// ISR: rendered once, then served from cache until a successful sync calls
// revalidatePath("/", "layout"). Time window is only a backstop (lib/cache.ts).
export const revalidate = 3600;

interface DraftDetailPageProps {
  params: Promise<{ seasonYear: string }>;
  searchParams: Promise<{ round?: string }>;
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
  searchParams,
}: DraftDetailPageProps) {
  const { seasonYear } = await params;
  const { round } = await searchParams;
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

  const requestedRound = Number(round);
  const activeRound =
    Number.isFinite(requestedRound) && requestedRound > 0 ? requestedRound : 1;

  const primaryDraft = !isUpcoming && draftData ? draftData.drafts[0] : null;
  const kicker = isUpcoming
    ? `${year} Rookie Draft · Upcoming`
    : draftData!.drafts.length === 1
      ? `${year} ${primaryDraft!.draftType === "startup" ? "Startup" : "Rookie"} Draft · Completed`
      : `${year} Draft · Completed`;

  return (
    <>
      <section className="pt-8 pb-6 md:pt-12 md:pb-8 space-y-4">
        <BackLink href="/drafts" label="All Drafts" />

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <p className="text-kicker">{kicker}</p>
            <h1 className="text-h1">Draft Board.</h1>
          </div>
          {isUpcoming && <SuperlativeBadge text="Upcoming" variant="gold" />}
        </div>
      </section>

      {isUpcoming && upcomingPicks && (
        <UpcomingDraftSection picks={upcomingPicks} year={year} activeRound={activeRound} />
      )}

      {!isUpcoming &&
        draftData &&
        draftData.drafts.map((draft) => (
          <CompletedDraftSection
            key={draft.draftId}
            draft={draft}
            year={year}
            activeRound={activeRound}
          />
        ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Normalizers — map completed and upcoming (projected) picks into the shared
// NormalizedPick shape consumed by buildDraftBoard (see @/lib/draft-board).
// ---------------------------------------------------------------------------

function normalizeCompletedPick(pick: DraftPickWithFranchise): NormalizedPick {
  return {
    pickNumber: pick.pickNumber,
    round: pick.round,
    playerId: pick.playerId,
    playerName: pick.playerName,
    playerPosition: pick.playerPosition,
    roster: null,
    currentId: pick.franchiseId ?? pick.rosterId ?? `pick-${pick.id}`,
    currentName: pick.franchiseName ?? "Unknown",
    currentSlug: pick.franchiseSlug,
    currentAbbreviation: pick.franchiseAbbreviation,
    currentBrandingColor: pick.franchiseBrandingColor,
    currentAvatarUrl: pick.franchiseAvatarUrl,
    originalId: pick.originalFranchiseId,
    originalName: pick.originalFranchiseName,
    originalSlug: pick.originalFranchiseSlug,
    originalAbbreviation: pick.originalFranchiseAbbreviation,
    originalBrandingColor: pick.originalFranchiseBrandingColor,
  };
}

function normalizeUpcomingPick(pick: UpcomingPick): NormalizedPick {
  return {
    pickNumber: pick.pickNumber,
    round: pick.round,
    playerId: null,
    playerName: null,
    playerPosition: null,
    roster: pick.roster,
    currentId: pick.franchiseId,
    currentName: pick.franchiseName,
    currentSlug: pick.franchiseSlug,
    currentAbbreviation: null,
    currentBrandingColor: null,
    currentAvatarUrl: pick.avatarUrl,
    originalId: null,
    originalName: pick.originalFranchiseName,
    originalSlug: null,
    originalAbbreviation: null,
    originalBrandingColor: null,
  };
}

// ---------------------------------------------------------------------------
// Board cell / pick row — shared by completed and upcoming boards. Branches
// on whether the pick carries a player (completed) or a roster breakdown
// (upcoming/projected).
// ---------------------------------------------------------------------------

function BoardCell({ pick, slot }: { pick: NormalizedPick | null; slot?: number }) {
  if (!pick) {
    return (
      <div
        className="min-h-[128px] rounded-lg border border-divider bg-surface/40"
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="flex min-h-[128px] min-w-0 flex-col rounded-lg border border-divider bg-surface px-2 py-2">
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-[10px] tabular-nums text-text-tertiary">
          {pick.round}.{slot ?? "-"}
        </span>
        {pick.playerPosition && (
          <span
            className="text-[10px] font-bold uppercase tracking-[0.02em]"
            style={{ color: getPositionColor(pick.playerPosition).badge.text }}
          >
            {pick.playerPosition}
          </span>
        )}
      </div>

      <div className="flex flex-1 items-center justify-center py-1.5">
        {pick.playerName ? (
          <PlayerLink playerId={pick.playerId} className="contents">
            <PlayerHeadshot
              size={48}
              playerId={pick.playerId}
              name={pick.playerName}
              showTeamBadge={false}
              franchiseBadge={{
                slug: pick.currentSlug,
                name: pick.currentName,
                abbreviation: pick.currentAbbreviation,
                brandingColor: pick.currentBrandingColor,
                avatarUrl: pick.currentAvatarUrl,
              }}
            />
          </PlayerLink>
        ) : (
          <TeamCrest
            slug={pick.currentSlug}
            name={pick.currentName}
            abbreviation={pick.currentAbbreviation}
            brandingColor={pick.currentBrandingColor}
            avatarUrl={pick.currentAvatarUrl}
            size="md"
          />
        )}
      </div>

      <div>
        {pick.playerName && (
          <PlayerLink playerId={pick.playerId} className="block">
            <p
              className="line-clamp-2 text-center text-[12px] font-semibold leading-[1.15] text-text-primary"
              title={pick.playerName}
            >
              {pick.playerName}
            </p>
          </PlayerLink>
        )}

        {pick.roster && (
          <div className="flex flex-wrap justify-center gap-x-1.5 font-mono text-[10px] tabular-nums">
            {(["QB", "RB", "WR", "TE"] as const).map((pos) => (
              <span key={pos} style={{ color: getPositionColor(pos).badge.text }}>
                {pick.roster![pos]}
                {pos[0]}
              </span>
            ))}
          </div>
        )}

        {pick.originalName && (
          <p
            className="mt-0.5 truncate text-center text-[10px] text-text-tertiary"
            title={`via ${pick.originalName}`}
          >
            via {teamAcronym(pick.originalName)}
          </p>
        )}
      </div>
    </div>
  );
}

function TeamCrest({
  slug,
  name,
  abbreviation,
  brandingColor,
  avatarUrl,
  size = "sm",
}: {
  slug: string | null;
  name: string;
  abbreviation: string | null;
  brandingColor: string | null;
  avatarUrl?: string | null;
  size?: "sm" | "md";
}) {
  if (slug) {
    return (
      <FranchiseLogo
        slug={slug}
        name={name}
        abbreviation={abbreviation ?? undefined}
        brandingColor={brandingColor ?? undefined}
        avatarUrl={avatarUrl}
        size={size}
      />
    );
  }

  const px = size === "sm" ? "h-8 w-8" : "h-12 w-12";
  return (
    <div
      className={`flex ${px} shrink-0 items-center justify-center rounded-md bg-surface-muted text-[10px] font-bold text-text-primary`}
    >
      {(abbreviation ?? name).slice(0, 2).toUpperCase()}
    </div>
  );
}

function PickRow({ pick, slot }: { pick: NormalizedPick; slot: number }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <span className="w-10 shrink-0 font-mono text-body-sm tabular-nums text-accent-gold">
        {pick.round}.{slot}
      </span>
      {pick.playerName ? (
        <PlayerLink playerId={pick.playerId} className="flex min-w-0 flex-1 items-center gap-3">
          <PlayerHeadshot
            size={44}
            playerId={pick.playerId}
            name={pick.playerName}
            showTeamBadge={false}
            franchiseBadge={{
              slug: pick.currentSlug,
              name: pick.currentName,
              abbreviation: pick.currentAbbreviation,
              brandingColor: pick.currentBrandingColor,
              avatarUrl: pick.currentAvatarUrl,
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-semibold text-text-primary">{pick.playerName}</p>
            {pick.originalName && (
              <p className="truncate text-body-sm text-text-tertiary">via {pick.originalName}</p>
            )}
          </div>
        </PlayerLink>
      ) : (
        <>
          <TeamCrest
            slug={pick.currentSlug}
            name={pick.currentName}
            abbreviation={pick.currentAbbreviation}
            brandingColor={pick.currentBrandingColor}
            avatarUrl={pick.currentAvatarUrl}
          />
          <div className="min-w-0 flex-1">
            {pick.roster && (
              <p className="truncate font-mono text-body-sm tabular-nums text-text-secondary">
                {pick.roster.QB} QB, {pick.roster.RB} RB, {pick.roster.WR} WR, {pick.roster.TE} TE
              </p>
            )}
            {pick.originalName && (
              <p className="truncate text-body-sm text-text-tertiary">via {pick.originalName}</p>
            )}
          </div>
        </>
      )}
      {pick.playerPosition && (
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium uppercase tracking-[0.06em]"
          style={{
            backgroundColor: getPositionColor(pick.playerPosition).badge.bg,
            color: getPositionColor(pick.playerPosition).badge.text,
          }}
        >
          {pick.playerPosition}
        </span>
      )}
    </div>
  );
}

function PositionLegend({ positions }: { positions: string[] }) {
  if (positions.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3.5">
      {positions.map((pos) => (
        <span key={pos} className="flex items-center gap-1.5 text-body-sm text-text-tertiary">
          <span
            className="inline-block h-2 w-2 rounded-[2px]"
            style={{ backgroundColor: getPositionColor(pos).badge.text }}
            aria-hidden="true"
          />
          {pos}
        </span>
      ))}
    </div>
  );
}

function DesktopBoard({ board }: { board: DraftBoard }) {
  if (board.columns.length === 0) return null;
  const columnStyle = { gridTemplateColumns: `repeat(${board.columns.length}, minmax(84px, 1fr))` };

  return (
    <div className="hidden md:block card-surface overflow-x-auto p-4 lg:p-[18px]">
      <div className="grid gap-1.5" style={columnStyle}>
        {board.columns.map((col) => (
          <div key={col.key} className="flex min-w-0 flex-col items-center gap-1.5 pb-2" title={col.name}>
            <TeamCrest
              slug={col.slug}
              name={col.name}
              abbreviation={col.abbreviation}
              brandingColor={col.brandingColor}
              avatarUrl={col.avatarUrl}
              size="sm"
            />
            <span className="max-w-full truncate text-[9px] font-bold text-text-tertiary">
              {teamAcronym(col.name)}
            </span>
          </div>
        ))}
      </div>

      {board.rounds.map((round) => (
        <div key={round} className="mt-1.5 grid gap-1.5" style={columnStyle}>
          {board.grid.get(round)!.map((pick, i) => (
            <BoardCell key={i} pick={pick} slot={pick ? board.slots.get(pick.pickNumber) : undefined} />
          ))}
        </div>
      ))}
    </div>
  );
}

function MobileBoard({
  board,
  basePath,
  activeRound,
}: {
  board: DraftBoard;
  basePath: string;
  activeRound: number;
}) {
  if (board.rounds.length === 0) return null;
  const round = board.rounds.includes(activeRound) ? activeRound : board.rounds[0];
  const roundPicks = (board.grid.get(round) ?? [])
    .filter((p): p is NormalizedPick => p !== null)
    .sort((a, b) => a.pickNumber - b.pickNumber);

  return (
    <div className="md:hidden space-y-4">
      <nav aria-label="Draft round" className="flex gap-2 overflow-x-auto pb-1">
        {board.rounds.map((r) => {
          const isActive = r === round;
          return (
            <Link
              key={r}
              href={`${basePath}?round=${r}`}
              scroll={false}
              aria-current={isActive ? "page" : undefined}
              className={`shrink-0 rounded-full border px-4 py-2 text-body-sm font-medium transition-colors ${
                isActive
                  ? "border-accent-gold/30 bg-accent-gold-light text-accent-gold"
                  : "border-border bg-surface text-text-tertiary"
              }`}
            >
              Round {r}
            </Link>
          );
        })}
      </nav>

      <div className="card-surface divide-y divide-divider">
        {roundPicks.map((pick) => (
          <PickRow key={pick.pickNumber} pick={pick} slot={board.slots.get(pick.pickNumber)!} />
        ))}
      </div>
    </div>
  );
}

const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF", "DST"];

function CompletedDraftSection({
  draft,
  year,
  activeRound,
}: {
  draft: { draftId: string; draftType: string; isLegacyEra: boolean; picks: DraftPickWithFranchise[] };
  year: number;
  activeRound: number;
}) {
  const normalized = draft.picks.map(normalizeCompletedPick);
  const board = buildDraftBoard(normalized);
  const positionsPresent = new Set(
    draft.picks.map((p) => p.playerPosition).filter((p): p is string => !!p)
  );
  const orderedPositions = POSITION_ORDER.filter((p) => positionsPresent.has(p));

  return (
    <section className="pb-10 md:pb-14 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SuperlativeBadge
            text={draft.draftType === "startup" ? "Startup" : "Rookie"}
            variant={draft.draftType === "startup" ? "gold" : "neutral"}
          />
          {draft.isLegacyEra && (
            <span className="text-caption text-text-tertiary bg-surface-muted px-2 py-0.5 rounded-full">
              Legacy Era
            </span>
          )}
          <span className="text-body-sm text-text-tertiary">
            {draft.picks.length} picks &middot; {board.rounds.length} rounds
          </span>
        </div>
        <PositionLegend positions={orderedPositions} />
      </div>

      <ScrollReveal>
        <DesktopBoard board={board} />
      </ScrollReveal>
      <MobileBoard board={board} basePath={`/drafts/${year}`} activeRound={activeRound} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Upcoming Draft Types & Section
// ---------------------------------------------------------------------------

interface UpcomingPick {
  pickNumber: number;
  round: number;
  franchiseId: string;
  franchiseName: string;
  franchiseSlug: string | null;
  avatarUrl: string | null;
  roster: PositionCounts;
  originalFranchiseName: string | null;
}

function UpcomingDraftSection({
  picks,
  year,
  activeRound,
}: {
  picks: UpcomingPick[];
  year: number;
  activeRound: number;
}) {
  const normalized = picks.map(normalizeUpcomingPick);
  const board = buildDraftBoard(normalized);

  return (
    <section className="pb-10 md:pb-14 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SuperlativeBadge text="Upcoming" variant="gold" />
          <span className="text-body-sm text-text-tertiary">
            {picks.length} picks &middot; {board.rounds.length} rounds
          </span>
        </div>
        <PositionLegend positions={["QB", "RB", "WR", "TE"]} />
      </div>

      <ScrollReveal>
        <DesktopBoard board={board} />
      </ScrollReveal>
      <MobileBoard board={board} basePath={`/drafts/${year}`} activeRound={activeRound} />
    </section>
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
      avatarUrl: franchiseSeasons.avatarUrl,
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
          avatarUrl: franchiseSeasons.avatarUrl,
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
        avatarUrl: displayTeam.avatarUrl,
        roster: rosterMap.get(displayTeam.franchiseId) ?? emptyRoster,
        originalFranchiseName,
      });
    }
  }

  return picks;
}
