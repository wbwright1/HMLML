import Link from "next/link";
import { Calendar, Users, Search, AlertCircle, Trophy, BarChart3, ChevronRight } from "lucide-react";
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
      <p className="text-body text-text-secondary">{description}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-4 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-body-sm font-medium text-accent-gold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          {actionLabel}
          <ChevronRight className="size-4" strokeWidth={2} aria-hidden />
        </Link>
      )}
    </div>
  );
}
