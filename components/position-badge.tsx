import { getPositionColor } from "@/lib/position-colors";

export function PositionBadge({ position }: { position: string | null }) {
  if (!position)
    return (
      <span className="text-sm text-text-tertiary">
        -
      </span>
    );

  const color = getPositionColor(position);

  return (
    <span
      className="inline-block text-caption font-semibold px-2 py-0.5 rounded-full"
      style={{
        backgroundColor: color.badge.bg,
        color: color.badge.text,
      }}
    >
      {position}
    </span>
  );
}
