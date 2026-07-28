import { Skeleton } from "@/components/skeleton";

/** Loading placeholder for both the full page and the intercepted modal. */
export function ProfileSkeleton() {
  return (
    <div aria-hidden className="space-y-6">
      <div className="flex items-start gap-4 sm:gap-5">
        <Skeleton className="size-[72px] sm:size-24 rounded-full shrink-0" />
        <div className="flex-1 space-y-3 pt-1">
          <Skeleton className="h-8 w-1/2 max-w-xs" />
          <Skeleton className="h-4 w-2/3 max-w-sm" />
          <Skeleton className="h-4 w-1/3 max-w-xs" />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 flex-1 min-w-[7rem] rounded-[10px]" />
        ))}
      </div>

      <Skeleton className="h-[220px] w-full rounded-[10px]" />

      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-[10px]" />
        ))}
      </div>
    </div>
  );
}
