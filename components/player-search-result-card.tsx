import Link from "next/link";
import { PositionBadge } from "@/components/position-badge";
import { PlayerStatusBadge } from "@/components/player-status-badge";

interface PlayerSearchResultCardProps {
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
  playerName,
  position,
  nflTeam,
  status,
  injuryStatus,
  ownerFranchise,
  pointsPpr,
}: PlayerSearchResultCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/30">
      <div className="flex items-center gap-4">
        {/* Position circle */}
        <div className="shrink-0 flex items-center justify-center w-16 h-16 rounded-full bg-surface-muted border border-border">
          <PositionBadge position={position} />
        </div>

        {/* Player info */}
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-body font-bold truncate">{playerName}</p>
          <div className="flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">
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
                className="text-xs text-accent-green hover:underline"
              >
                {ownerFranchise.name}
              </Link>
            ) : (
              <span className="text-xs text-muted-foreground">Unowned</span>
            )}
          </div>
        </div>

        {/* Points */}
        {pointsPpr != null && pointsPpr > 0 && (
          <div className="shrink-0 text-right">
            <p className="text-h3 font-bold tabular-nums">
              {pointsPpr.toFixed(1)}
            </p>
            <p className="text-caption text-muted-foreground">PPR pts</p>
          </div>
        )}
      </div>
    </div>
  );
}
