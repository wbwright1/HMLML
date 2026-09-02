import { getAwardIcon } from "@/lib/award-icons";
import { getPositionColor } from "@/lib/position-colors";
import { PlayerHeadshot } from "@/components/player-headshot";
import { PlayerLink } from "@/components/player-link";
import { TeamLink } from "@/components/team-link";

interface PlayerAwardCardProps {
  category: string;
  playerName: string;
  franchiseName: string;
  /** Franchise slug, when the caller has it: makes the attribution line a link
   * to the team page. Optional, since the preseason awards query does not
   * select it. */
  franchiseSlug?: string | null;
  stat: string;
  position?: string;
  /** Sleeper player ID. When present, renders a circular headshot instead of
   * the position-color fallback circle. The current preseason awards query
   * does not select this yet, so callers may omit it. */
  playerId?: string;
  nflTeam?: string | null;
}

export function PlayerAwardCard({
  category,
  playerName,
  franchiseName,
  franchiseSlug,
  stat,
  position,
  playerId,
  nflTeam,
}: PlayerAwardCardProps) {
  const color = getPositionColor(position ?? null);

  return (
    <div className="card-surface card-tint-gold p-5 text-center">
      <p className="text-kicker text-accent-gold mb-3">
        <span className="flex items-center justify-center gap-1.5">
          {getAwardIcon(category)}
          {category}
        </span>
      </p>

      <div className="flex justify-center mb-3">
        {playerId ? (
          <PlayerLink playerId={playerId} className="inline-flex">
            <PlayerHeadshot
              playerId={playerId}
              name={playerName}
              size={96}
              nflTeam={nflTeam}
            />
          </PlayerLink>
        ) : (
          <div
            className="flex items-center justify-center rounded-full w-24 h-24 text-body-lg font-bold"
            style={{ backgroundColor: color.cell.bg, color: color.cell.text }}
          >
            {position ?? "?"}
          </div>
        )}
      </div>

      <PlayerLink playerId={playerId} className="block">
        <p className="text-body font-bold text-text-primary">{playerName}</p>
      </PlayerLink>
      <div className="text-body-sm text-text-tertiary">
        <TeamLink slug={franchiseSlug}>{franchiseName}</TeamLink>
      </div>
      <p className="text-stat text-h3 text-text-primary mt-2">
        {stat}
      </p>
    </div>
  );
}
