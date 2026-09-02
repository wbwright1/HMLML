import Link from "next/link";
import { PlayerLink } from "@/components/player-link";
import { PlayerHeadshot } from "@/components/player-headshot";
import { FranchiseLogo } from "@/components/franchise-logo";
import {
  getAwardsHonorRoll,
  type AwardEntry,
  type AwardFranchiseCrest,
} from "@/lib/queries/awards";
import {
  getBestWaiverPickupsBySeason,
  type WaiverPickupRow,
} from "@/lib/queries/records";
import { getLatestAvatarUrls } from "@/lib/queries/franchise-avatars";
import { AWARD_METADATA } from "@/lib/awards";
import { getAwardTypeIcon } from "@/lib/award-icons";

/** Small franchise crest chip linking to the franchise page. */
function FranchiseCrestChip({ franchise }: { franchise: AwardFranchiseCrest }) {
  return (
    <Link
      href={`/teams/${franchise.slug}`}
      className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-surface px-2 py-1 text-caption text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
    >
      <FranchiseLogo
        slug={franchise.slug}
        name={franchise.name}
        abbreviation={franchise.abbreviation ?? undefined}
        brandingColor={franchise.brandingColor ?? undefined}
        avatarUrl={franchise.avatarUrl}
        size={18}
        decorative
      />
      <span className="max-w-[9rem] truncate normal-case tracking-normal">
        {franchise.name}
      </span>
    </Link>
  );
}

/** Shared row layout for both award rows and the waiver-pickup row. */
function TrophyRow({
  seasonYear,
  playerId,
  playerName,
  position,
  franchise,
  repeatCount,
  highlight,
  stat,
}: {
  seasonYear: number;
  playerId: string | null;
  playerName: string;
  position: string | null;
  franchise: AwardFranchiseCrest | null;
  repeatCount: number;
  highlight: boolean;
  stat?: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-[10px] border p-3 ${
        highlight
          ? "border-accent-gold/25 bg-accent-gold-light"
          : "border-transparent"
      }`}
    >
      <span className="w-9 shrink-0 font-mono text-body-sm font-bold tabular-nums text-accent-gold">
        {String(seasonYear).slice(-2)}
        <span className="text-[10px] text-text-tertiary">&rsquo;</span>
      </span>
      <div className="min-w-0 flex-1">
        {/* ONE link over headshot and name, not two to the same place. */}
        <PlayerLink
          playerId={playerId}
          className="flex min-w-0 items-center gap-3 text-text-primary"
        >
          <PlayerHeadshot
            playerId={playerId}
            name={playerName}
            size={40}
            showTeamBadge={false}
          />
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-body-sm font-semibold">
              {playerName}
            </span>
            {repeatCount > 1 && (
              <span className="inline-flex shrink-0 items-center rounded-full bg-accent-gold-light px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-accent-gold">
                {repeatCount}x
              </span>
            )}
          </span>
        </PlayerLink>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          {position && (
            <span className="text-caption text-text-tertiary">{position}</span>
          )}
          {franchise ? (
            <FranchiseCrestChip franchise={franchise} />
          ) : (
            <span className="text-caption text-text-muted normal-case tracking-normal">
              Franchise unknown
            </span>
          )}
          {stat && (
            <span className="ml-auto shrink-0 font-mono text-caption font-bold tabular-nums text-accent-gold">
              {stat}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function AwardRow({
  award,
  repeatCount,
  highlight,
}: {
  award: AwardEntry;
  repeatCount: number;
  highlight: boolean;
}) {
  return (
    <TrophyRow
      seasonYear={award.seasonYear}
      playerId={award.playerId}
      playerName={award.playerName}
      position={award.position}
      franchise={award.franchise}
      repeatCount={repeatCount}
      highlight={highlight}
    />
  );
}

function WaiverRow({
  row,
  avatarUrl,
}: {
  row: WaiverPickupRow;
  avatarUrl: string | null;
}) {
  const franchise: AwardFranchiseCrest | null =
    row.franchiseId && row.franchiseSlug && row.franchiseName
      ? {
          id: row.franchiseId,
          slug: row.franchiseSlug,
          name: row.franchiseName,
          abbreviation: row.franchiseAbbreviation,
          brandingColor: row.franchiseBrandingColor,
          avatarUrl,
        }
      : null;

  return (
    <TrophyRow
      seasonYear={row.seasonYear}
      playerId={row.playerId}
      playerName={row.playerName ?? "Unknown player"}
      position={row.playerPosition}
      franchise={franchise}
      repeatCount={1}
      highlight={false}
      stat={row.points.toFixed(1)}
    />
  );
}

/**
 * The Trophy Case: the "Yearly Hardware" subsection of the Player Wing
 * module, surfacing every league award (Regular Season MVP, Championship
 * MVP, Rookie of the Year) plus the season's best waiver pickup, in four
 * columns. Self-fetching async RSC; renders NOTHING when there is no award
 * data AND no waiver data (empty tables or pre-migration), so the page never
 * shows an empty shell.
 */
export async function TrophyCase() {
  const [roll, waiverMap] = await Promise.all([
    getAwardsHonorRoll(),
    getBestWaiverPickupsBySeason(),
  ]);

  const waiverRows = Array.from(waiverMap.values()).sort(
    (a, b) => b.seasonYear - a.seasonYear,
  );

  const hasAwards = roll.total > 0 && roll.groups.length > 0;
  const hasWaivers = waiverRows.length > 0;
  if (!hasAwards && !hasWaivers) return null;

  const totalGroups = roll.groups.length + (hasWaivers ? 1 : 0);

  const waiverFranchiseIds = waiverRows
    .map((r) => r.franchiseId)
    .filter((id): id is string => id != null);
  const waiverAvatarUrls = await getLatestAvatarUrls(waiverFranchiseIds);

  return (
    <div data-testid="trophy-case" className="space-y-3">
      <div className="pb-1">
        <p className="text-kicker text-accent-gold mb-1.5">Yearly Hardware</p>
        <h3 className="text-h3 text-text-primary">The Trophy Case</h3>
        <p className="text-body-sm text-text-tertiary mt-1">
          Every MVP, Finals MVP, Rookie of the Year, and waiver heist, and the
          roster that cashed the ticket.
        </p>
      </div>

      <p className="lg:hidden text-caption text-text-tertiary mb-2">
        Swipe for all {totalGroups} trophies &rarr;
      </p>

      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 no-scrollbar md:-mx-6 md:px-6 lg:mx-0 lg:grid lg:grid-cols-2 lg:overflow-visible lg:px-0 lg:pb-0">
        {roll.groups.map((group) => {
          const meta = AWARD_METADATA[group.awardType];
          return (
            <div
              key={group.awardType}
              className="snap-center shrink-0 basis-[85%] sm:basis-[60%] lg:basis-auto"
            >
              <div className="card-surface p-5 h-full">
                <p className="text-kicker text-accent-gold mb-3 flex items-center gap-1.5">
                  {getAwardTypeIcon(group.awardType)}
                  {meta.label}
                </p>
                <div className="space-y-2">
                  {group.awards.map((award) => (
                    <AwardRow
                      key={award.id}
                      award={award}
                      repeatCount={
                        award.playerId
                          ? (roll.awardCountByPlayer[award.playerId] ?? 1)
                          : 1
                      }
                      highlight={
                        !!award.playerId &&
                        award.playerId === roll.mostDecoratedPlayerId
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {hasWaivers && (
          <div
            key="waiver"
            className="snap-center shrink-0 basis-[85%] sm:basis-[60%] lg:basis-auto"
          >
            <div className="card-surface p-5 h-full">
              <p className="text-kicker text-accent-gold mb-3 flex items-center gap-1.5">
                Best Waiver Pickup
              </p>
              <div className="space-y-2">
                {waiverRows.map((row) => (
                  <WaiverRow
                    key={row.seasonYear}
                    row={row}
                    avatarUrl={
                      row.franchiseId
                        ? (waiverAvatarUrls.get(row.franchiseId) ?? null)
                        : null
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
