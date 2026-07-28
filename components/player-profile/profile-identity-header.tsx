import Link from "next/link";
import { PlayerHeadshot } from "@/components/player-headshot";
import { NflTeamLogo } from "@/components/nfl-team-logo";
import { FranchiseLogo } from "@/components/franchise-logo";
import { PositionBadge } from "@/components/position-badge";
import type { PlayerProfileIdentity } from "@/lib/queries/player-profile";

interface ProfileIdentityHeaderProps {
  identity: PlayerProfileIdentity;
  variant: "page" | "modal";
}

/**
 * The profile's h1 block: headshot, name, position/team/age/experience chips,
 * and the current-owner line. The h1's id ("player-profile-title") is what
 * the modal shell's aria-labelledby points at.
 */
export function ProfileIdentityHeader({
  identity,
  variant,
}: ProfileIdentityHeaderProps) {
  const name = identity.fullName ?? "Unknown Player";
  const headshotSize = variant === "page" ? 96 : 72;
  const TitleTag = variant === "page" ? "h1" : "h2";

  return (
    <div className="flex items-start gap-4 sm:gap-5">
      <PlayerHeadshot
        playerId={identity.id}
        name={name}
        size={headshotSize}
        nflTeam={identity.nflTeam}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <TitleTag
          id="player-profile-title"
          className={
            variant === "page"
              ? "text-h1 font-serif italic text-text-primary"
              : "text-h2 font-serif italic text-text-primary"
          }
        >
          {name}
        </TitleTag>

        <div className="flex flex-wrap items-center gap-2">
          <PositionBadge position={identity.position} />
          <span className="inline-flex items-center gap-1.5 text-body-sm text-text-secondary">
            <NflTeamLogo teamAbbrev={identity.nflTeam} size={20} />
            {identity.nflTeam ?? "Free Agent"}
          </span>
          {identity.age != null && (
            <span className="text-body-sm text-text-tertiary">
              Age <span className="font-mono tabular-nums">{identity.age}</span>
            </span>
          )}
          {identity.yearsExp != null && (
            <span className="text-body-sm text-text-tertiary">
              Yr <span className="font-mono tabular-nums">{identity.yearsExp + 1}</span>
            </span>
          )}
        </div>

        {identity.ownerFranchiseSlug && identity.ownerFranchiseName ? (
          <div className="flex items-center gap-2">
            <FranchiseLogo
              slug={identity.ownerFranchiseSlug}
              name={identity.ownerFranchiseName}
              size="sm"
              decorative
            />
            <Link
              href={`/teams/${identity.ownerFranchiseSlug}`}
              className="text-body-sm font-medium text-accent-gold hover:brightness-110"
            >
              {identity.ownerFranchiseName}
            </Link>
            {identity.yearsInLeague > 0 && (
              <span className="text-body-sm text-text-tertiary">
                &middot; Yr{" "}
                <span className="font-mono tabular-nums">
                  {identity.yearsInLeague}
                </span>{" "}
                in HMLML
              </span>
            )}
          </div>
        ) : (
          <p className="text-body-sm text-text-tertiary italic">Free Agent</p>
        )}
      </div>
    </div>
  );
}
