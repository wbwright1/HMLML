import { PageSkeletonHeader, Skeleton } from "@/components/skeleton";

export default function PlayersLoading() {
  return (
    <>
      <PageSkeletonHeader />
      {/* Search field */}
      <Skeleton className="h-11 w-full max-w-xl rounded-lg" />

      {/* Results list */}
      <div className="mt-8 space-y-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-[14px] border border-border bg-surface p-4"
          >
            <Skeleton className="h-11 w-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </>
  );
}
