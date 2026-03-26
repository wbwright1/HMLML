import Link from "next/link";

interface TeamAwardCardProps {
  label: string;
  stat: string;
  context: string;
  franchiseName: string;
  franchiseSlug: string;
  tone: "positive" | "sting" | "neutral";
}

const toneStyles = {
  positive: "bg-accent-gold-light border-accent-gold/20",
  sting: "bg-accent-warm-light border-accent-warm/20",
  neutral: "bg-surface border-border",
} as const;

const labelStyles = {
  positive: "text-accent-gold",
  sting: "text-accent-warm",
  neutral: "text-text-tertiary",
} as const;

export function TeamAwardCard({
  label,
  stat,
  context,
  franchiseName,
  franchiseSlug,
  tone,
}: TeamAwardCardProps) {
  return (
    <Link
      href={`/teams/${franchiseSlug}`}
      className={`block rounded-lg border p-5 transition-colors duration-150 hover:border-border-strong ${toneStyles[tone]}`}
    >
      <p className={`text-caption uppercase mb-2 ${labelStyles[tone]}`}>
        {label}
      </p>
      <p className="text-display tabular-nums text-text-primary">{stat}</p>
      <p className="text-body-sm text-text-tertiary mt-1">{context}</p>
      <p className="text-body font-bold text-text-primary mt-3">
        {franchiseName}
      </p>
    </Link>
  );
}
