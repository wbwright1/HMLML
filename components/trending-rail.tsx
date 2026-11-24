import { TrendingUp } from "lucide-react";
import { PlayerHeadshot } from "@/components/player-headshot";
import { PlayerLink } from "@/components/player-link";
import { NflTeamLogo } from "@/components/nfl-team-logo";
import { formatAddCount } from "@/lib/format-adds";
import type { TrendingAddPlayer } from "@/lib/queries/player-points";

interface TrendingRailProps {
  players: TrendingAddPlayer[];
}

/**
 * Sidebar rail of the most-added players across Sleeper (last 24h). Server
 * component, zero client JS. Renders nothing when the list is empty, which
 * covers a Sleeper API failure or rate limit as well as a genuinely quiet
 * waiver period (getTrendingAddPlayers degrades to [] rather than throwing).
 *
 * Team defenses have no headshot, so they show the NFL team logo; their name
 * ("Commanders D/ST") is resolved in getTrendingAddPlayers.
 */
export function TrendingRail({ players }: TrendingRailProps) {
  if (players.length === 0) return null;

  return (
    <section aria-labelledby="trending-adds-heading" className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="trending-adds-heading" className="text-kicker">
          Trending adds
        </h2>
        <span className="text-caption text-text-tertiary">
          Sleeper, last 24 hours
        </span>
      </div>
      <ul className="card-surface divide-y divide-divider px-4 py-1">
        {players.map((player) => {
          const isDefense = player.position === "DEF";
          const name = player.name ?? "Unknown player";
          const meta = [player.position, player.nflTeam ?? "FA"]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={player.playerId}>
              <PlayerLink
                playerId={player.playerId}
                className="flex min-h-14 items-center gap-3 py-2 transition-[scale,color] duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                {isDefense && player.nflTeam ? (
                  <NflTeamLogo teamAbbrev={player.nflTeam} size={36} />
                ) : (
                  <PlayerHeadshot
                    playerId={player.playerId}
                    name={name}
                    size={36}
                    nflTeam={player.nflTeam}
                    decorative
                  />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-sm font-semibold text-text-primary">
                    {name}
                  </span>
                  <span className="text-caption text-text-tertiary">{meta}</span>
                </span>
                <span
                  className="inline-flex shrink-0 items-center gap-1"
                  title={`${player.count.toLocaleString("en-US")} adds in the last 24 hours`}
                >
                  <TrendingUp
                    className="size-4 text-accent-green"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  <span className="font-mono text-body-sm font-bold tabular-nums text-text-primary">
                    {formatAddCount(player.count)}
                  </span>
                  <span className="text-caption text-text-tertiary">adds</span>
                </span>
              </PlayerLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
