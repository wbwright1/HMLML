import Link from "next/link";
import { Calendar, Users, Search, AlertCircle, Trophy, BarChart3 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Canonical iconMap keys and their page-variant mappings:
 *
 *   "calendar" (Calendar)    -> Matchups (no data), Seasons (no data)
 *   "users"    (Users)       -> Teams (no data)
 *   "search"   (Search)      -> Player search (no results)
 *   "alert"    (AlertCircle) -> Error page (inline section)
 *   "trophy"   (Trophy)      -> Records / trophies pages
 *   "chart"    (BarChart3)   -> Homepage (no data), H2H (no data)
 */
const iconMap: Record<string, LucideIcon> = {
  calendar: Calendar,
  users: Users,
  search: Search,
  alert: AlertCircle,
  trophy: Trophy,
  chart: BarChart3,
};

interface EmptyStateProps {
  icon?: keyof typeof iconMap;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
}: EmptyStateProps) {
  const Icon = icon ? iconMap[icon] : null;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center max-w-[400px] mx-auto">
      {Icon && (
        <Icon
          className="size-12 text-text-tertiary/50 mb-4"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      )}
      <h3 className="text-h3 mb-2">{title}</h3>
      <p className="text-body text-text-tertiary">{description}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-4 text-sm text-primary font-medium hover:underline"
        >
          {actionLabel} &rarr;
        </Link>
      )}
    </div>
  );
}
