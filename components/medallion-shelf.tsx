import Link from "next/link";
import { PlayerHeadshot } from "@/components/player-headshot";
import {
  MedallionIcon,
  isShameMedallion,
  type MedallionIconType,
} from "@/lib/medallion-icons";

/** Gold for real hardware, tarnished rust for hardware nobody wanted. */
export type MedallionTone = "gold" | "shame";

interface MedallionShelfProps {
  label: string;
  count: number;
  tone?: MedallionTone;
  children: React.ReactNode;
}

/**
 * One "shelf" of medallions for a single award type: a labeled header row
 * (award name + mono count), a free-scrolling strip of medallion items, and a
 * gradient line underneath. Server component, zero client JS. The shame tone
 * swaps gold for rust, keeping the geometry identical.
 */
export function MedallionShelf({
  label,
  count,
  tone = "gold",
  children,
}: MedallionShelfProps) {
  const isShame = tone === "shame";
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className={`text-kicker ${isShame ? "text-accent-warm" : ""}`}>
          {label}
        </span>
        <span className="font-mono text-[11px] text-text-muted">×{count}</span>
      </div>
      <div className="medallion-strip no-scrollbar">{children}</div>
      <div
        className="medallion-shelf-line"
        data-tone={isShame ? "shame" : undefined}
      />
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
  const tone = isShameMedallion(iconType) ? "shame" : undefined;
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
        data-tone={tone}
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="medallion-item"
      data-tone={tone}
    >
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
        <PlayerHeadshot playerId={playerId} name={playerName} size={40} showTeamBadge={false} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold text-text-primary">
          {playerName}
        </span>
        <span className="block whitespace-nowrap text-[10px] text-text-tertiary">
          {position && <span>{position} · </span>}
          <span className="font-mono text-accent-gold">{seasonYear}</span>
        </span>
      </span>
    </div>
  );
}
