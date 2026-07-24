import Link from "next/link";
import { getAwardIcon } from "@/lib/award-icons";

interface TeamAwardCardProps {
  label: string;
  stat: string;
  context: string;
  franchiseName: string;
  franchiseSlug: string;
  tone: "positive" | "sting" | "neutral";
}

const toneStyles = {
  positive: "card-tint-gold",
  sting: "card-tint-warm",
  neutral: "",
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
      className={`card-surface ${toneStyles[tone]} block p-5 transition-colors duration-150 hover:border-border-strong`}
    >
      <p className={`text-kicker mb-2 ${labelStyles[tone]}`}>
        <span className="flex items-center gap-1.5">
          {getAwardIcon(label)}
          {label}
        </span>
      </p>
      <p className="text-stat text-h2 text-text-primary">{stat}</p>
      <p className="text-body-sm text-text-tertiary mt-1">{context}</p>
      <p className="text-body font-bold text-text-primary mt-3">
        {franchiseName}
      </p>
    </Link>
  );
}
