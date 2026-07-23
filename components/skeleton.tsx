import { cn } from "@/lib/utils";

/**
 * Skeleton — a single placeholder block for route-level loading.tsx boundaries.
 * Renders the shared `.skeleton` surface + pulse (neutralized under
 * prefers-reduced-motion). Defaults to a pill radius; pass className to size and
 * reshape. Purely decorative, so it is hidden from assistive tech.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("skeleton rounded-md", className)} />
  );
}

/**
 * SkeletonCard — a `.card-surface` shell wrapping skeleton lines, matching the
 * primary card language used across pages. Children override the default lines.
 */
export function SkeletonCard({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div aria-hidden className={cn("card-surface p-5 sm:p-6", className)}>
      {children ?? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <div className="border-t border-divider pt-3">
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * PageSkeletonHeader — mirrors PageSection's kicker + serif title block so a
 * loading state lands in the same visual position as the resolved page.
 */
export function PageSkeletonHeader() {
  return (
    <div className="py-8 md:py-12 space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-56 max-w-full" />
      </div>
    </div>
  );
}
