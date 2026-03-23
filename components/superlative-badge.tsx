interface SuperlativeBadgeProps {
  text: string;
  variant?: "gold" | "silver" | "green" | "neutral" | "brown";
}

const variantStyles: Record<string, { backgroundColor: string; color: string }> = {
  gold: { backgroundColor: "rgba(184, 134, 11, 0.1)", color: "#B8860B" },
  silver: { backgroundColor: "rgba(44, 82, 130, 0.15)", color: "#2C5282" },
  green: { backgroundColor: "rgba(45, 90, 61, 0.1)", color: "#2D5A3D" },
  neutral: { backgroundColor: "#F0ECE8", color: "#6B6560" },
  brown: { backgroundColor: "rgba(139, 115, 85, 0.1)", color: "#8B7355" },
};

export function SuperlativeBadge({
  text,
  variant = "neutral",
}: SuperlativeBadgeProps) {
  const styles = variantStyles[variant] ?? variantStyles.neutral;

  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "0.75rem",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        fontWeight: 500,
        borderRadius: "9999px",
        paddingLeft: "0.5rem",
        paddingRight: "0.5rem",
        paddingTop: "0.125rem",
        paddingBottom: "0.125rem",
        backgroundColor: styles.backgroundColor,
        color: styles.color,
      }}
    >
      {text}
    </span>
  );
}
