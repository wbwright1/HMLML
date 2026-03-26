import { getAwardIcon } from "@/lib/award-icons";

interface PlayerAwardCardProps {
  category: string;
  playerName: string;
  franchiseName: string;
  stat: string;
  position?: string;
}

const positionColors: Record<string, string> = {
  QB: "bg-accent-warm text-white",
  RB: "bg-accent-green text-white",
  WR: "bg-accent-gold text-white",
  TE: "bg-text-secondary text-white",
};

export function PlayerAwardCard({
  category,
  playerName,
  franchiseName,
  stat,
  position,
}: PlayerAwardCardProps) {
  const badgeColor = position
    ? positionColors[position] ?? "bg-text-muted text-white"
    : "bg-text-muted text-white";

  return (
    <div className="rounded-lg border border-accent-gold/20 bg-accent-gold-light p-5 text-center">
      <p className="text-caption uppercase text-accent-gold mb-3">
        <span className="flex items-center justify-center gap-1.5">
          {getAwardIcon(category)}
          {category}
        </span>
      </p>

      {/* Position badge circle */}
      <div className="flex justify-center mb-3">
        <div
          className={`flex items-center justify-center rounded-full w-16 h-16 text-body font-bold ${badgeColor}`}
        >
          {position ?? "?"}
        </div>
      </div>

      <p className="text-body font-bold text-text-primary">{playerName}</p>
      <p className="text-body-sm text-text-tertiary">{franchiseName}</p>
      <p className="text-h3 font-bold text-text-primary mt-2 tabular-nums">
        {stat}
      </p>
    </div>
  );
}
