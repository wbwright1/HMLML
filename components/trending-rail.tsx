import { ArrowUp } from "lucide-react";
import { PlayerHeadshot } from "@/components/player-headshot";
import { PositionBadge } from "@/components/position-badge";
import type { TrendingAddPlayer } from "@/lib/queries/player-points";

interface TrendingRailProps {
  players: TrendingAddPlayer[];
}

/**
 * Sidebar rail of the most-added players across Sleeper (last 24h). Server
 * component, zero client JS. Renders nothing when the list is empty, which
 * covers a Sleeper API failure or rate limit as well as a genuinely quiet
 * waiver period (getTrendingAddPlayers degrades to [] rather than throwing).
 */
export function TrendingRail({ players }: TrendingRailProps) {
  if (players.length === 0) return null;

  return (
    <div className="card-surface p-4">
      <p className="text-kicker mb-3">Trending &middot; Adds</p>
      <ul className="divide-y divide-divider">
        {players.map((player) => (
          <li
            key={player.playerId}
            className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
          >
            <PlayerHeadshot
              playerId={player.playerId}
              name={player.name ?? "Unknown"}
              size={48}
              nflTeam={player.nflTeam}
            />
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-medium text-text-primary truncate">
                {player.name ?? "Unknown"}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <PositionBadge position={player.position} />
                <span className="text-caption text-text-tertiary">
                  {player.nflTeam ?? "FA"}
                </span>
              </div>
            </div>
            <span
              className="inline-flex shrink-0 items-center gap-1 text-caption font-mono font-semibold text-accent-green"
              title={`${player.count} adds in the last 24 hours`}
            >
              <ArrowUp className="size-3" aria-hidden="true" />
              {player.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
