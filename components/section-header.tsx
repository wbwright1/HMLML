import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface SectionHeaderProps {
  title: string;
  viewAllHref?: string;
  viewAllLabel?: string;
}

export function SectionHeader({
  title,
  viewAllHref,
  viewAllLabel,
}: SectionHeaderProps) {
  const linkLabel = viewAllLabel ?? (viewAllHref ? "View all" : undefined);

  return (
    <div className="flex items-center justify-between pb-2 border-b border-border mb-4">
      <h3 className="text-h3 text-text-primary">{title}</h3>
      {viewAllHref && linkLabel && (
        <Link
          href={viewAllHref}
          className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 -mr-2 text-body-sm font-medium text-accent-gold hover:brightness-110 transition-[scale] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          {linkLabel}
          <ChevronRight className="size-4" strokeWidth={2} aria-hidden />
        </Link>
      )}
    </div>
  );
}
