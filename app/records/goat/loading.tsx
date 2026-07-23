import { Skeleton, SkeletonCard } from "@/components/skeleton";

export default function GoatLadderLoading() {
  return (
    <>
      <div className="pt-8 md:pt-12 space-y-4">
        <Skeleton className="h-4 w-20" />
        <div className="space-y-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-11 w-72 max-w-full" />
          <Skeleton className="h-5 w-full max-w-prose" />
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {/* #1 hero shell */}
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

        {/* Ranked rows */}
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
    </>
  );
}
