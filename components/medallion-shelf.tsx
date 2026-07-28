import Link from "next/link";
import { PlayerHeadshot } from "@/components/player-headshot";
import { MedallionIcon, type MedallionIconType } from "@/lib/medallion-icons";

interface MedallionShelfProps {
  label: string;
  count: number;
  children: React.ReactNode;
}

/**
 * One "shelf" of medallions for a single award type: a labeled header row
 * (award name + mono count), a free-scrolling strip of medallion items, and a
 * gold gradient line underneath. Server component, zero client JS.
 */
export function MedallionShelf({ label, count, children }: MedallionShelfProps) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-caption text-text-tertiary">{label}</span>
        <span className="font-mono text-[11px] text-text-muted">×{count}</span>
      </div>
      <div className="medallion-strip no-scrollbar">{children}</div>
      <div className="medallion-shelf-line" />
    </div>
  );
}

interface MedallionProps {
  iconType: MedallionIconType;
  href: string | null;
  ariaLabel: string;
  plate: React.ReactNode;
}

/**
 * A single minted-coin trophy: spotlight glow, engraved coin, podium wedge,
 * and an engraved plate carrying the data. The whole item is one tap target
 * (a next/link) when href is given; otherwise a plain div. Never nest a link
 * inside the plate.
 */
export function Medallion({ iconType, href, ariaLabel, plate }: MedallionProps) {
  const content = (
    <>
      <div className="medallion-spotlight" aria-hidden="true" />
      <div className="medallion-coin">
        <MedallionIcon type={iconType} />
      </div>
      <div className="medallion-podium" aria-hidden="true" />
      <div className="medallion-plate">{plate}</div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        prefetch={false}
        aria-label={ariaLabel}
        className="medallion-item"
      >
        {content}
      </Link>
    );
  }

  return (
    <div aria-label={ariaLabel} className="medallion-item">
      {content}
    </div>
  );
}

interface PlayerAwardPlateProps {
  playerId: string | null;
  playerName: string;
  position: string | null;
  seasonYear: number;
}

/**
 * Plate content for a player-level award: headshot + name + "POS · YEAR".
 * Plain text only (no nested links) — the enclosing Medallion is the tap
 * target when the player has a profile.
 */
export function PlayerAwardPlate({
  playerId,
  playerName,
  position,
  seasonYear,
}: PlayerAwardPlateProps) {
  return (
    <div className="flex w-full items-center gap-2.5">
      <span className="medallion-plate-headshot shrink-0">
        <PlayerHeadshot playerId={playerId} name={playerName} size={28} showTeamBadge={false} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-bold text-text-primary">
          {playerName}
        </span>
        <span className="block text-[9.5px] text-text-tertiary">
          {position && <span>{position} · </span>}
          <span className="font-mono text-accent-gold">{seasonYear}</span>
        </span>
      </span>
    </div>
  );
}
