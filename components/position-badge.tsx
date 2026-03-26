import { getPositionColor } from "@/lib/position-colors";

export function PositionBadge({ position }: { position: string | null }) {
  if (!position)
    return (
      <span className="text-sm" style={{ color: "var(--text-muted)" }}>
        -
      </span>
    );

  const color = getPositionColor(position);

  return (
    <span
      className="inline-block text-[12px] font-medium uppercase tracking-[0.06em] px-2 py-0.5 rounded-full"
      style={{
        backgroundColor: color.badge.bg,
        color: color.badge.text,
      }}
    >
      {position}
    </span>
  );
}
