import Link from "next/link";
import { getAwardIcon } from "@/lib/award-icons";
import type { LabelTone } from "@/lib/content";

interface SuperlativeCardProps {
  label: string;
  stat: string;
  context: string;
  franchiseName: string;
  franchiseSlug: string;
  tone: LabelTone;
}

const toneTint = { positive: "card-tint-gold", sting: "card-tint-warm", neutral: "" } as const;
const toneLabel = { positive: "text-accent-gold", sting: "text-accent-warm", neutral: "text-text-tertiary" } as const;

export function SuperlativeCard({ label, stat, context, franchiseName, franchiseSlug, tone }: SuperlativeCardProps) {
  return (
    <Link
      href={`/teams/${franchiseSlug}`}
      className={`card-surface ${toneTint[tone]} flex h-full min-h-[196px] flex-col p-5 transition-colors duration-150 hover:border-border-strong`}
    >
      <p className={`text-kicker mb-3 flex items-center gap-1.5 ${toneLabel[tone]}`}>
        {getAwardIcon(label)}
        {label}
      </p>
      <p className="text-stat text-h2 text-text-primary">{stat}</p>
      <p className="text-body-sm text-text-tertiary mt-1 line-clamp-2">{context}</p>
      <p className="text-body font-bold text-text-primary mt-auto pt-3">{franchiseName}</p>
    </Link>
  );
}
