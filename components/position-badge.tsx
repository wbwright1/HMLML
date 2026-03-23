const POSITION_COLORS: Record<string, string> = {
  QB: "text-primary bg-primary/10",
  RB: "text-gold bg-gold/10",
  WR: "text-foreground bg-muted",
  TE: "text-muted-foreground bg-muted",
  K: "text-muted-foreground bg-muted",
  DEF: "text-muted-foreground bg-muted",
};

export function PositionBadge({ position }: { position: string | null }) {
  if (!position)
    return <span className="text-sm text-muted-foreground">-</span>;

  const colorClass =
    POSITION_COLORS[position] ?? "text-muted-foreground bg-muted";

  return (
    <span
      className={`inline-block text-xs font-semibold uppercase px-2 py-0.5 rounded ${colorClass}`}
    >
      {position}
    </span>
  );
}
