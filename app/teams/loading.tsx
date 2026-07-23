import { PageSkeletonHeader, SkeletonCard, Skeleton } from "@/components/skeleton";

export default function TeamsLoading() {
  return (
    <>
      <PageSkeletonHeader />
      <Skeleton className="h-5 w-full max-w-prose" />
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 sm:gap-8">
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </>
  );
}
