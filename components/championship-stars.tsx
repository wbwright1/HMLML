interface ChampionshipStarsProps {
  count: number;
  variant?: "inline" | "hero";
}

function StarIcon({ className, shadow }: { className?: string; shadow?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={shadow ? { filter: "drop-shadow(0 1px 2px rgba(184, 134, 11, 0.3))" } : undefined}
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

export function ChampionshipStars({
  count,
  variant = "inline",
}: ChampionshipStarsProps) {
  if (count <= 0) return null;

  const starSize = variant === "hero" ? "w-5 h-5" : "w-3.5 h-3.5";

  return (
    <div
      className="inline-flex items-center gap-0.5"
      aria-label={`${count} championship${count !== 1 ? "s" : ""}`}
      role="img"
    >
      {Array.from({ length: count }, (_, i) => (
        <StarIcon key={i} className={`${starSize} text-gold`} shadow={variant === "hero"} />
      ))}
    </div>
  );
}
