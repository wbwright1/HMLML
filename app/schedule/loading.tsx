import { PageSkeletonHeader, Skeleton } from "@/components/skeleton";

export default function ScheduleLoading() {
  return (
    <>
      <PageSkeletonHeader />
      <Skeleton className="h-5 w-full max-w-prose" />

      <div className="mt-8 space-y-10">
        {Array.from({ length: 2 }).map((_, weekIndex) => (
          <div key={weekIndex} className="space-y-4">
            <Skeleton className="h-6 w-24" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
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
          </div>
        ))}
      </div>
    </>
  );
}
