import Link from "next/link";
import type { ReactNode } from "react";
import { PlayerHeadshot } from "@/components/player-headshot";
import { PlayerLink } from "@/components/player-link";
import { FranchiseLogo } from "@/components/franchise-logo";
import type { AwardFranchiseCrest } from "@/lib/queries/awards";

/** Small franchise crest chip linking to the franchise page. */
export function FranchiseCrestChip({
  franchise,
}: {
  franchise: AwardFranchiseCrest;
}) {
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

export interface TrophyInstanceCellProps {
  seasonYear: number;
  playerId?: string | null;
  playerName?: string | null;
  position?: string | null;
  franchise?: AwardFranchiseCrest | null;
}

/**
 * One instance card inside a Trophy Row's scroller: a championship-style cell
 * (season year only, no player) when `playerName` is absent, otherwise a
 * player award cell (headshot + name + position + season year), optionally
 * with a franchise crest chip.
 */
export function TrophyInstanceCell({
  seasonYear,
  playerId,
  playerName,
  position,
  franchise,
}: TrophyInstanceCellProps) {
  if (!playerName) {
    return (
      <div className="card-surface flex h-full w-[104px] shrink-0 snap-center flex-col justify-end p-4">
        <span className="font-mono text-h3 tabular-nums text-accent-gold">
          {seasonYear}
        </span>
      </div>
    );
  }

  return (
    <div className="card-surface flex h-full w-[132px] shrink-0 snap-center flex-col gap-2 p-4">
      <PlayerHeadshot
        playerId={playerId ?? null}
        name={playerName}
        size={44}
        showTeamBadge={false}
      />
      <div className="min-w-0">
        <p className="text-body-sm font-semibold text-text-primary truncate">
          <PlayerLink playerId={playerId ?? null}>{playerName}</PlayerLink>
        </p>
        {position && (
          <p className="text-caption text-text-tertiary">{position}</p>
        )}
      </div>
      {franchise && <FranchiseCrestChip franchise={franchise} />}
      <span className="mt-auto font-mono text-body-sm font-bold tabular-nums text-accent-gold">
        {seasonYear}
      </span>
    </div>
  );
}

export interface TrophyRowProps {
  icon: ReactNode;
  label: string;
  count?: number;
  cells: TrophyInstanceCellProps[];
}

/**
 * One horizontally-scrolling trophy row: a fixed identity chip (icon, label,
 * count) on the left, followed by one instance cell per win. Shared by the
 * franchise-page Trophy Case and (soon) the league-wide Trophy Case.
 */
export function TrophyRow({ icon, label, count, cells }: TrophyRowProps) {
  const total = count ?? cells.length;

  return (
    <div className="flex items-stretch gap-4">
      <div className="card-surface card-tint-gold flex w-[132px] shrink-0 flex-col justify-between gap-3 p-4 sm:w-[160px]">
        <p className="text-kicker text-accent-gold flex items-center gap-1.5">
          {icon}
          {label}
        </p>
        <span className="font-mono text-h3 tabular-nums text-accent-gold">
          {total}
          <span className="text-caption text-text-tertiary ml-1.5 font-sans">
            {total === 1 ? "time" : "times"}
          </span>
        </span>
      </div>
      <div className="-mr-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pr-4 pb-2 no-scrollbar">
        {cells.map((cell, i) => (
          <TrophyInstanceCell
            key={`${cell.seasonYear}-${cell.playerId ?? cell.franchise?.id ?? i}`}
            {...cell}
          />
        ))}
      </div>
    </div>
  );
}
