import Link from "next/link";

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
  const linkLabel = viewAllLabel ?? (viewAllHref ? "View All \u2192" : undefined);

  return (
    <div className="flex items-center justify-between pb-2 border-b border-border mb-4">
      <h3 className="text-h3 font-bold">{title}</h3>
      {viewAllHref && linkLabel && (
        <Link
          href={viewAllHref}
          className="text-body-sm font-medium text-primary hover:underline py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:rounded-sm"
        >
          {linkLabel}
        </Link>
      )}
    </div>
  );
}
