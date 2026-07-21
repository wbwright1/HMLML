"use client";

import { useState } from "react";
import Image from "next/image";

export interface NflTeamLogoProps {
  /** NFL team abbreviation, e.g. "BUF". Null/empty renders the "FA" (free agent) monogram. */
  teamAbbrev?: string | null;
  size: number;
  className?: string;
}

/**
 * Small NFL team logo badge, keyed by team abbreviation. Falls back to a
 * text monogram (the abbreviation itself, or "FA" for free agents) on load
 * error or when no team is given — never color alone.
 */
export function NflTeamLogo({ teamAbbrev, size, className = "" }: NflTeamLogoProps) {
  const [failed, setFailed] = useState(false);
  const hasTeam = Boolean(teamAbbrev?.trim());
  const abbrev = hasTeam ? teamAbbrev!.trim().toUpperCase() : "FA";
  const showFallback = failed || !hasTeam;

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface ${className}`}
      style={{ width: size, height: size }}
    >
      {showFallback ? (
        <span
          className="font-bold text-text-tertiary select-none"
          style={{ fontSize: Math.max(7, Math.round(size * (abbrev.length > 2 ? 0.28 : 0.36))) }}
          aria-hidden="true"
        >
          {abbrev}
        </span>
      ) : (
        <Image
          src={`https://sleepercdn.com/images/team_logos/nfl/${abbrev.toLowerCase()}.png`}
          alt={abbrev}
          width={size}
          height={size}
          className="object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
