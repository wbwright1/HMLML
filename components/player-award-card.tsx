import { getAwardIcon } from "@/lib/award-icons";
import { getPositionColor } from "@/lib/position-colors";
import { PlayerHeadshot } from "@/components/player-headshot";

interface PlayerAwardCardProps {
  category: string;
  playerName: string;
  franchiseName: string;
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
  stat,
  position,
  playerId,
  nflTeam,
}: PlayerAwardCardProps) {
  const color = getPositionColor(position ?? null);

  return (
    <div className="rounded-[14px] border border-accent-gold/20 bg-accent-gold-light p-5 text-center">
      <p className="text-caption text-accent-gold mb-3">
        <span className="flex items-center justify-center gap-1.5">
          {getAwardIcon(category)}
          {category}
        </span>
      </p>

      <div className="flex justify-center mb-3">
        {playerId ? (
          <PlayerHeadshot
            playerId={playerId}
            name={playerName}
            size={96}
            nflTeam={nflTeam}
          />
        ) : (
          <div
            className="flex items-center justify-center rounded-full w-24 h-24 text-body-lg font-bold"
            style={{ backgroundColor: color.cell.bg, color: color.cell.text }}
          >
            {position ?? "?"}
          </div>
        )}
      </div>

      <p className="text-body font-bold text-text-primary">{playerName}</p>
      <p className="text-body-sm text-text-tertiary">{franchiseName}</p>
      <p className="text-h3 font-mono font-bold tabular-nums text-text-primary mt-2">
        {stat}
      </p>
    </div>
  );
}
