interface PlayerAwardCardProps {
  category: string;
  playerName: string;
  franchiseName: string;
  stat: string;
  position?: string;
}

const positionColors: Record<string, string> = {
  QB: "bg-[#E8465D] text-white",
  RB: "bg-[#39B0AC] text-white",
  WR: "bg-[#5A8DEE] text-white",
  TE: "bg-[#F0983C] text-white",
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
        {category}
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
