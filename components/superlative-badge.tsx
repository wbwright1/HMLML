interface SuperlativeBadgeProps {
  text: string;
  variant?: "gold" | "silver" | "green" | "neutral" | "brown";
}

const variantClasses: Record<string, string> = {
  gold: "bg-gold/10 text-gold",
  silver: "bg-blue-800/15 text-blue-800",
  green: "bg-primary/10 text-primary",
  neutral: "bg-muted text-muted-foreground",
  brown: "bg-amber-800/10 text-amber-800",
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
