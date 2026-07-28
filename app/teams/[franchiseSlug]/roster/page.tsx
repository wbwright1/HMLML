import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FranchiseLogo } from "@/components/franchise-logo";
import { FranchisePicker } from "@/components/franchise-picker";
import { PositionBadge } from "@/components/position-badge";
import { PlayerStatusBadge } from "@/components/player-status-badge";
import { PlayerHeadshot } from "@/components/player-headshot";
import { PlayerLink } from "@/components/player-link";
import { NflTeamLogo } from "@/components/nfl-team-logo";
import { EmptyState } from "@/components/empty-state";
import {
  getAllFranchises,
  getFranchiseBySlug,
  getFranchiseRoster,
} from "@/lib/queries/franchises";
import { getNflState } from "@/lib/queries/nfl-state";
import { getCurrentWeekProjectionsByPlayer } from "@/lib/queries/player-points";

export const dynamic = "force-dynamic";

interface RosterPageProps {
  params: Promise<{ franchiseSlug: string }>;
}

export async function generateMetadata({ params }: RosterPageProps) {
  const { franchiseSlug } = await params;

  let franchise: Awaited<ReturnType<typeof getFranchiseBySlug>> = null;
  try {
    franchise = await getFranchiseBySlug(franchiseSlug);
  } catch {
    // DB may not be connected in dev
  }

  if (!franchise) {
    return { title: "Roster Not Found | Harambe Memorial League Memorial League" };
  }

  return {
    title: `${franchise.name} Roster | Harambe Memorial League Memorial League`,
    description: `Current roster for ${franchise.name} in the Harambe Memorial League Memorial League.`,
  };
}

// Position display order for sorting
const positionOrder: Record<string, number> = {
  QB: 1,
  RB: 2,
  WR: 3,
  TE: 4,
  K: 5,
  DEF: 6,
};

function getPositionSort(position: string | null): number {
  return positionOrder[position ?? ""] ?? 99;
}

function getPlayerName(player: {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  return (
    player.fullName ??
    (`${player.firstName ?? ""} ${player.lastName ?? ""}`.trim() ||
    "Unknown")
  );
}

type RosterPlayer = NonNullable<
  Awaited<ReturnType<typeof getFranchiseRoster>>
>[number];

// Shared cell padding, matching app/players/player-table.tsx's desktop
// table so roster tables and the players table read as one system.
const TH_CLASS =
  "px-2.5 py-2.5 md:px-0 md:pr-4 md:py-3 text-caption text-text-tertiary text-left";
const TD_CLASS = "px-2.5 py-2.5 md:px-0 md:pr-4 md:py-3";

// Sticky-left "Player" column: no transform/will-change anywhere in this
// subtree (see the ScrollReveal note in RosterPage below) so position:sticky
// keeps working across the horizontal scroll container.
const STICKY_CLASS = "sticky left-0 z-[1] bg-canvas border-r border-divider";

function RosterSection({
  label,
  players,
  projectionsByPlayer,
  showProjColumn,
}: {
  label: string;
  players: RosterPlayer[];
  projectionsByPlayer: Map<string, number>;
  showProjColumn: boolean;
}) {
  if (players.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-kicker">
        {label}
        <span className="ml-2 text-text-tertiary normal-case tracking-normal font-normal">
          ({players.length})
        </span>
      </h2>
      <div className="card-surface p-4 md:p-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="border-b border-divider">
                <th className={`${TH_CLASS} ${STICKY_CLASS}`} title="Player">
                  Player
                </th>
                <th
                  className={TH_CLASS}
                  title="Roster position"
                  aria-label="Roster position"
                >
                  POS
                </th>
                {showProjColumn && (
                  <th
                    className={`${TH_CLASS} text-right`}
                    title="Projected points, current week"
                    aria-label="Projected points, current week"
                  >
                    PROJ
                  </th>
                )}
                <th
                  className={`${TH_CLASS} text-right`}
                  title="Player age"
                  aria-label="Player age"
                >
                  AGE
                </th>
                <th
                  className={`${TH_CLASS} text-right`}
                  title="Years of NFL experience"
                  aria-label="Years of NFL experience"
                >
                  EXP
                </th>
                <th
                  className={TH_CLASS}
                  title="NFL team"
                  aria-label="NFL team"
                >
                  TM
                </th>
                <th
                  className={TH_CLASS}
                  title="Injury / roster status"
                  aria-label="Injury / roster status"
                >
                  INJ
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => {
                const name = getPlayerName(player);
                const isDef = player.position === "DEF";
                const projection = projectionsByPlayer.get(player.playerId);

                return (
                  <tr
                    key={player.playerId}
                    className="border-b border-divider last:border-0 hover:bg-surface transition-colors"
                  >
                    <td className={`${TD_CLASS} ${STICKY_CLASS}`}>
                      <PlayerLink
                        playerId={isDef ? null : player.playerId}
                        className="flex min-w-0 items-center gap-2.5"
                      >
                        {isDef ? (
                          <NflTeamLogo teamAbbrev={player.nflTeam} size={32} />
                        ) : (
                          <PlayerHeadshot
                            playerId={player.playerId}
                            name={name}
                            size={32}
                            nflTeam={player.nflTeam}
                          />
                        )}
                        <span className="font-medium text-text-primary truncate">
                          {name}
                        </span>
                      </PlayerLink>
                    </td>
                    <td className={TD_CLASS}>
                      <PositionBadge position={player.position} />
                    </td>
                    {showProjColumn && (
                      <td className={`${TD_CLASS} text-right`}>
                        <span className="text-stat font-mono text-text-tertiary">
                          {projection != null ? projection.toFixed(1) : "-"}
                        </span>
                      </td>
                    )}
                    <td className={`${TD_CLASS} text-right`}>
                      <span className="text-stat text-text-secondary">
                        {player.age ?? "-"}
                      </span>
                    </td>
                    <td className={`${TD_CLASS} text-right`}>
                      <span className="text-stat text-text-secondary">
                        {player.yearsExp ?? "-"}
                      </span>
                    </td>
                    <td className={TD_CLASS}>
                      <NflTeamLogo teamAbbrev={player.nflTeam} size={28} />
                    </td>
                    <td className={TD_CLASS}>
                      <PlayerStatusBadge
                        status={player.status}
                        injuryStatus={player.injuryStatus}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SnapshotRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-t border-divider first:border-t-0 first:pt-0">
      <span className="text-body-sm text-text-tertiary">{label}</span>
      <span
        className={`text-body-sm font-mono font-semibold tabular-nums text-text-primary ${
          valueClassName ?? ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export default async function RosterPage({ params }: RosterPageProps) {
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

  // Use the most recent season to fetch the roster
  const latestSeason = franchise.seasonHistory[0];

  // These three are independent; fetch in parallel. Each degrades to null on
  // failure (roster data missing, DB down in dev, NFL state unavailable) so one
  // failure doesn't sink the others.
  const [roster, allFranchises, nflState] = await Promise.all([
    latestSeason
      ? getFranchiseRoster(franchise.id, latestSeason.seasonId).catch(() => null)
      : Promise.resolve(null),
    getAllFranchises().catch(() => null),
    getNflState().catch(() => null),
  ]);

  const isCurrentSeason =
    !!latestSeason && !!nflState && Number(nflState.season) === latestSeason.seasonYear;

  let projectionsByPlayer = new Map<string, number>();
  if (isCurrentSeason && latestSeason && nflState) {
    try {
      projectionsByPlayer = await getCurrentWeekProjectionsByPlayer(
        latestSeason.seasonId,
        nflState.week
      );
    } catch {
      // Projections may not be available
    }
  }

  const showProjColumn = isCurrentSeason && projectionsByPlayer.size > 0;

  const sortedRoster = roster
    ? [...roster].sort(
        (a, b) => getPositionSort(a.position) - getPositionSort(b.position)
      )
    : [];

  const starters = sortedRoster.filter((p) => (p.slot ?? "bench") === "starter");
  const benchAndIr = sortedRoster.filter((p) => (p.slot ?? "bench") !== "starter");

  const pointsFor = latestSeason?.pointsScored ?? 0;
  const pointsAgainst = latestSeason?.pointsAgainst ?? null;
  const pointDiff =
    pointsAgainst != null ? pointsFor - pointsAgainst : null;

  return (
    <section className="py-8 md:py-12 space-y-8">
      <ScrollReveal>
        <div className="space-y-6">
          <BackLink href={`/teams/${franchise.slug}`} label={franchise.name} />

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="shrink-0"
                style={
                  franchise.brandingColor
                    ? {
                        boxShadow: `0 0 0 2px ${franchise.brandingColor}`,
                        borderRadius: "13px",
                      }
                    : undefined
                }
              >
                <FranchiseLogo
                  slug={franchise.slug}
                  name={franchise.name}
                  abbreviation={franchise.abbreviation}
                  brandingColor={franchise.brandingColor}
                  avatarUrl={franchise.avatarUrl}
                  size="md"
                  decorative
                />
              </div>
              <div>
                <h1 className="text-h2">{franchise.name}</h1>
                {latestSeason && (
                  <p className="text-body-sm text-text-tertiary mt-1">
                    <span className="font-mono tabular-nums font-semibold text-text-primary">
                      {latestSeason.wins ?? 0}-{latestSeason.losses ?? 0}
                    </span>
                    {latestSeason.standingsFinish != null && (
                      <>
                        <span className="mx-1.5">&middot;</span>
                        <span className="font-mono tabular-nums">
                          #{latestSeason.standingsFinish}
                        </span>
                      </>
                    )}
                    <span className="mx-1.5">&middot;</span>
                    <span className="font-mono tabular-nums">
                      {pointsFor.toFixed(1)} PF
                    </span>
                  </p>
                )}
              </div>
            </div>

            {allFranchises && allFranchises.length > 0 && (
              <FranchisePicker
                franchises={allFranchises}
                selectedSlug={franchise.slug}
                basePath="/teams"
              />
            )}
          </div>
        </div>
      </ScrollReveal>

      {sortedRoster.length === 0 ? (
        <EmptyState
          icon="users"
          title="No Roster Data"
          description="Roster data will appear once rosters have been synced from Sleeper."
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
          {/*
            Plain div, not ScrollReveal: ScrollReveal's reveal-on-load
            animation lands on translate-y-0 with a `both` fill-mode,
            leaving a permanent `transform` on this wrapper. A transformed
            ancestor breaks `position: sticky` on the Player column inside
            the tables below, so this subtree stays untransformed.
          */}
          <div className="min-w-0 space-y-8">
            <RosterSection
              label="Starting Lineup"
              players={starters}
              projectionsByPlayer={projectionsByPlayer}
              showProjColumn={showProjColumn}
            />
            <RosterSection
              label="Bench & IR"
              players={benchAndIr}
              projectionsByPlayer={projectionsByPlayer}
              showProjColumn={showProjColumn}
            />
          </div>

          <ScrollReveal delay={140}>
            <aside className="card-surface p-4 md:p-5">
              <h2 className="text-kicker mb-3">Team Snapshot</h2>
              <div>
                {latestSeason && (
                  <>
                    <SnapshotRow
                      label="Record"
                      value={`${latestSeason.wins ?? 0}-${latestSeason.losses ?? 0}`}
                    />
                    {latestSeason.standingsFinish != null && (
                      <SnapshotRow
                        label="Standing"
                        value={`#${latestSeason.standingsFinish}`}
                      />
                    )}
                    <SnapshotRow
                      label="Points For"
                      value={pointsFor.toFixed(1)}
                    />
                    {pointsAgainst != null && (
                      <SnapshotRow
                        label="Points Against"
                        value={pointsAgainst.toFixed(1)}
                      />
                    )}
                    {pointDiff != null && (
                      <SnapshotRow
                        label="Point Diff"
                        value={`${pointDiff >= 0 ? "+" : "−"}${Math.abs(pointDiff).toFixed(1)}`}
                        valueClassName={
                          pointDiff >= 0 ? "text-accent-green" : "text-accent-warm"
                        }
                      />
                    )}
                  </>
                )}
              </div>
            </aside>
          </ScrollReveal>
        </div>
      )}
    </section>
  );
}
