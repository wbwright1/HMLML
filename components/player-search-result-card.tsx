import Link from "next/link";
import { PlayerHeadshot } from "@/components/player-headshot";
import { PlayerStatusBadge } from "@/components/player-status-badge";

interface PlayerSearchResultCardProps {
  playerId: string;
  playerName: string;
  position: string | null;
  nflTeam: string | null;
  status: string | null;
  injuryStatus: string | null;
  ownerFranchise?: {
    name: string;
    slug: string;
  } | null;
  pointsPpr?: number | null;
}

export function PlayerSearchResultCard({
  playerId,
  playerName,
  position,
  nflTeam,
  status,
  injuryStatus,
  ownerFranchise,
  pointsPpr,
}: PlayerSearchResultCardProps) {
  return (
    <div className="card-surface p-4 transition-colors hover:bg-surface-muted">
      <div className="flex items-center gap-4">
        <PlayerHeadshot
          playerId={playerId}
          name={playerName}
          size={72}
          nflTeam={nflTeam}
        />

        {/* Player info */}
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-body font-bold text-text-primary truncate">{playerName}</p>
          <div className="flex flex-wrap items-center gap-2 text-body-sm text-text-tertiary">
            {position && <span>{position}</span>}
            {nflTeam && (
              <>
                <span aria-hidden="true">·</span>
                <span>{nflTeam}</span>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PlayerStatusBadge
              status={status}
              injuryStatus={injuryStatus}
              isRostered={!!ownerFranchise}
            />
            {ownerFranchise ? (
              <Link
                href={`/teams/${ownerFranchise.slug}`}
                className="text-caption text-accent-gold hover:brightness-110"
              >
                {ownerFranchise.name}
              </Link>
            ) : (
              <span className="text-caption text-text-tertiary">Unowned</span>
            )}
          </div>
        </div>

        {/* Points */}
        {pointsPpr != null && pointsPpr > 0 && (
          <div className="shrink-0 text-right">
            <p className="text-stat text-h3 text-text-primary">
              {pointsPpr.toFixed(1)}
            </p>
            <p className="text-caption text-text-tertiary">PPR pts</p>
          </div>
        )}
      </div>
    </div>
  );
}
