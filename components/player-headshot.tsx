"use client";

import { useState } from "react";
import Image from "next/image";
import { NflTeamLogo } from "@/components/nfl-team-logo";
import { FranchiseLogo } from "@/components/franchise-logo";

export interface PlayerHeadshotFranchiseBadge {
  slug: string | null;
  name: string;
  abbreviation?: string | null;
  brandingColor?: string | null;
  avatarUrl?: string | null;
}

export interface PlayerHeadshotProps {
  /** Sleeper player ID. Null/empty renders the initials monogram directly (legacy picks). */
  playerId: string | null;
  name: string;
  /** Common sizes: 44/48px in table rows, 48-56px in rail/hub rows, 72px in detail cards, 96px in award cards. */
  size: number;
  nflTeam?: string | null;
  /** Renders an NflTeamLogo badge bottom-right, ~50% of headshot size. Defaults to true when nflTeam is given. */
  showTeamBadge?: boolean;
  /**
   * Renders a franchise crest badge bottom-right (~50% of headshot size) instead
   * of the NFL team logo. Wins over nflTeam when both are supplied. Keeps the
   * crest's rounded-square shape.
   */
  franchiseBadge?: PlayerHeadshotFranchiseBadge | null;
  /**
   * Renders alt="" and drops the monogram's role="img"/aria-label. Pass only
   * when the player's name is already visible immediately adjacent (the same
   * contract as FranchiseLogo's `decorative`), so the identity isn't
   * announced twice by a screen reader. Defaults to false.
   */
  decorative?: boolean;
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
 * 2-letter initials monogram on load error or when no player ID is given
 * (legacy picks) — never color alone.
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
  franchiseBadge,
  decorative = false,
  className = "",
}: PlayerHeadshotProps) {
  const [failed, setFailed] = useState(false);
  const badgeSize = Math.round(size * 0.5);
  const hasPlayerId = Boolean(playerId && playerId.trim());
  const showMonogram = failed || !hasPlayerId;

  return (
    <div
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {showMonogram ? (
        <div
          className="flex h-full w-full items-center justify-center rounded-full bg-surface text-text-tertiary select-none"
          style={{ fontSize: Math.max(9, Math.round(size * 0.36)) }}
          {...(decorative ? {} : { role: "img", "aria-label": name })}
        >
          <span className="font-bold">{getInitials(name)}</span>
        </div>
      ) : (
        <Image
          src={`https://sleepercdn.com/content/nfl/players/${playerId}.jpg`}
          alt={decorative ? "" : name}
          width={size}
          height={size}
          className="rounded-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
      {franchiseBadge ? (
        <span
          className="absolute -bottom-0.5 -right-0.5 overflow-hidden ring-2 ring-canvas"
          style={{
            width: badgeSize,
            height: badgeSize,
            borderRadius: Math.round(badgeSize * 0.28),
          }}
        >
          <FranchiseLogo
            slug={franchiseBadge.slug ?? ""}
            name={franchiseBadge.name}
            abbreviation={franchiseBadge.abbreviation ?? undefined}
            brandingColor={franchiseBadge.brandingColor ?? undefined}
            avatarUrl={franchiseBadge.avatarUrl}
            size={badgeSize}
            decorative
          />
        </span>
      ) : (
        nflTeam &&
        showTeamBadge && (
          <span
            className="absolute -bottom-0.5 -right-0.5 overflow-hidden rounded-full ring-2 ring-canvas"
            style={{ width: badgeSize, height: badgeSize }}
          >
            <NflTeamLogo teamAbbrev={nflTeam} size={badgeSize} />
          </span>
        )
      )}
    </div>
  );
}
