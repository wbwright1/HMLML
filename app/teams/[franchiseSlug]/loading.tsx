import { Skeleton } from "@/components/skeleton";

export default function FranchiseLoading() {
  return (
    <>
      {/* Franchise header — centered crest, name, stat row */}
      <section className="py-8 md:py-12 space-y-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <Skeleton className="h-20 w-20 rounded-full" />
          <Skeleton className="h-10 w-64 max-w-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 pt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </section>

      {/* Season history rows */}
      <section className="py-8 md:py-12 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[14px] border border-border bg-surface p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-5 w-32" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
