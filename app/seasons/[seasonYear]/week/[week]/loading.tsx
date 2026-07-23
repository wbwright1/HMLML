import { PageSkeletonHeader, Skeleton } from "@/components/skeleton";

export default function WeekResultsLoading() {
  return (
    <>
      <PageSkeletonHeader />
      <div className="flex items-center gap-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>

      <div className="mt-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            aria-hidden
            className="card-surface p-4 flex items-center gap-3"
          >
            <div className="flex-1 flex items-center gap-3">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-4 w-8" />
            <div className="flex-1 flex items-center justify-end gap-3">
              <Skeleton className="h-4 w-8" />
              <Skeleton className="size-8 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
