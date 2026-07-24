interface SuperlativeBadgeProps {
  text: string;
  variant?: "gold" | "silver" | "green" | "neutral" | "brown";
}

const variantClasses: Record<string, string> = {
  gold: "bg-accent-gold-light text-accent-gold",
  silver: "bg-surface-muted text-text-secondary",
  green: "bg-accent-green-light text-accent-green",
  neutral: "bg-surface-muted text-text-tertiary",
  brown: "bg-accent-warm-light text-accent-warm",
};

export function SuperlativeBadge({
  text,
  variant = "neutral",
}: SuperlativeBadgeProps) {
  const classes = variantClasses[variant] ?? variantClasses.neutral;

  return (
    <span
      className={`inline-block text-caption uppercase tracking-wide font-medium rounded-full px-2 py-0.5 ${classes}`}
    >
      {text}
    </span>
  );
}
