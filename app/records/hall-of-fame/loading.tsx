import { Skeleton, SkeletonCard } from "@/components/skeleton";

export default function HallOfFameLoading() {
  return (
    <>
      <div className="pt-8 md:pt-12 space-y-4">
        <Skeleton className="h-4 w-20" />
        <div className="space-y-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-11 w-80 max-w-full" />
          <Skeleton className="h-5 w-full max-w-prose" />
        </div>
      </div>

      {/* GOAT Ladder module shell */}
      <div className="mt-6 space-y-3">
        <div className="space-y-2 pb-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-48" />
        </div>

        <SkeletonCard>
          <div className="flex items-center gap-5">
            <Skeleton className="h-16 w-12" />
            <Skeleton className="h-24 w-24 rounded-2xl" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-56 max-w-full" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
          </div>
        </SkeletonCard>

        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[14px] border border-border bg-surface p-4 md:p-5"
          >
            <div className="flex items-center gap-4">
              <Skeleton className="h-7 w-8" />
              <Skeleton className="h-12 w-12 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-40 max-w-full" />
              </div>
              <Skeleton className="h-8 w-12" />
            </div>
          </div>
        ))}
      </div>

      {/* Player Wing module shell */}
      <div className="mt-10 space-y-3">
        <div className="space-y-2 pb-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </>
  );
}
