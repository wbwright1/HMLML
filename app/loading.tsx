import { SkeletonCard, Skeleton } from "@/components/skeleton";

export default function HubLoading() {
  return (
    <div className="py-8 md:py-12 space-y-10">
      {/* Top banner (champion / week banner) */}
      <div className="card-surface p-8 md:p-10 space-y-4">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-12 w-72 max-w-full" />
        <Skeleton className="h-5 w-56 max-w-full" />
      </div>

      {/* Curated module heading */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-52 max-w-full" />
      </div>

      {/* Curated cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
