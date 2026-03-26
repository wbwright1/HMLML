import { Star } from "lucide-react";

interface ChampionshipStarsProps {
  count: number;
  variant?: "inline" | "hero";
}

export function ChampionshipStars({
  count,
  variant = "inline",
}: ChampionshipStarsProps) {
  if (count <= 0) return null;

  const size = variant === "hero" ? 20 : 14;
  const shadow =
    variant === "hero"
      ? { filter: "drop-shadow(0 1px 2px color-mix(in srgb, var(--gold) 30%, transparent))" }
      : undefined;

  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`${count} championship${count !== 1 ? "s" : ""}`}
      role="img"
    >
      {Array.from({ length: count }, (_, i) => (
        <Star
          key={i}
          size={size}
          className="text-gold"
          fill="currentColor"
          aria-hidden="true"
          style={shadow}
        />
      ))}
    </span>
  );
}
