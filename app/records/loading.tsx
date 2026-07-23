import { PageSkeletonHeader, SkeletonCard, Skeleton } from "@/components/skeleton";

export default function RecordsLoading() {
  return (
    <>
      <PageSkeletonHeader />
      <Skeleton className="h-5 w-full max-w-prose" />

      {/* Superlative / award card row */}
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i}>
            <div className="space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-40" />
            </div>
          </SkeletonCard>
        ))}
      </div>

      {/* Record book table shell */}
      <div className="mt-10 card-surface p-5 sm:p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </>
  );
}
