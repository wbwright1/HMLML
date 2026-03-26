import Link from "next/link";
import { getAwardIcon } from "@/lib/award-icons";

interface StingCardProps {
  label: string;
  franchiseName: string;
  franchiseSlug: string;
  context: string;
  stat: string;
}

export function StingCard({
  label,
  franchiseName,
  franchiseSlug,
  context,
  stat,
}: StingCardProps) {
  return (
    <Link
      href={`/teams/${franchiseSlug}`}
      className="block rounded-lg border border-accent-warm/30 bg-accent-warm-light p-5 transition-colors duration-150 hover:border-accent-warm/50"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-caption uppercase text-accent-warm mb-2">
            <span className="flex items-center gap-1.5">
              {getAwardIcon(label)}
              {label}
            </span>
          </p>
          <p className="text-body font-bold text-text-primary">
            {franchiseName}
          </p>
          <p className="text-body-sm text-text-tertiary mt-1">{context}</p>
        </div>
        <p className="text-h3 font-bold text-text-primary tabular-nums shrink-0">
          {stat}
        </p>
      </div>
    </Link>
  );
}
