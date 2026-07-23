import { PageSkeletonHeader, SkeletonCard, Skeleton } from "@/components/skeleton";

export default function DraftsLoading() {
  return (
    <>
      <PageSkeletonHeader />
      <Skeleton className="h-5 w-full max-w-prose" />
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i}>
            <div className="space-y-3">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-4 w-40" />
              <div className="border-t border-divider pt-3 space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          </SkeletonCard>
        ))}
      </div>
    </>
  );
}
