"use client";

import { useState } from "react";
import Image from "next/image";
import { NflTeamLogo } from "@/components/nfl-team-logo";

export interface PlayerHeadshotProps {
  playerId: string;
  name: string;
  /** Common sizes: 26/32px in table rows, 52px in detail cards. */
  size: number;
  nflTeam?: string | null;
  /** Renders an NflTeamLogo badge bottom-right, ~50% of headshot size. Defaults to true when nflTeam is given. */
  showTeamBadge?: boolean;
  className?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Circular player headshot, keyed by Sleeper player ID. Falls back to a
 * 2-letter initials monogram on load error — never color alone.
 *
 * DEF/DST rows: Sleeper does not serve headshots for team defenses. Callers
 * rendering a DEF/DST slot should use <NflTeamLogo> (nfl-team-logo.tsx) as
 * the primary circular mark instead of this component, keyed by the
 * defense's team abbreviation.
 */
export function PlayerHeadshot({
  playerId,
  name,
  size,
  nflTeam,
  showTeamBadge = true,
  className = "",
}: PlayerHeadshotProps) {
  const [failed, setFailed] = useState(false);
  const badgeSize = Math.round(size * 0.5);

  return (
    <div
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {failed ? (
        <div
          className="flex h-full w-full items-center justify-center rounded-full bg-surface text-text-tertiary select-none"
          style={{ fontSize: Math.max(9, Math.round(size * 0.36)) }}
          role="img"
          aria-label={name}
        >
          <span className="font-bold">{getInitials(name)}</span>
        </div>
      ) : (
        <Image
          src={`https://sleepercdn.com/content/nfl/players/${playerId}.jpg`}
          alt={name}
          width={size}
          height={size}
          className="rounded-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
      {nflTeam && showTeamBadge && (
        <span
          className="absolute -bottom-0.5 -right-0.5 overflow-hidden rounded-full ring-2 ring-canvas"
          style={{ width: badgeSize, height: badgeSize }}
        >
          <NflTeamLogo teamAbbrev={nflTeam} size={badgeSize} />
        </span>
      )}
    </div>
  );
}
