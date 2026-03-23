import { SyncTimestamp } from "@/components/sync-timestamp";

export function SiteFooter() {
  return (
    <footer className="border-t border-border py-6 text-center text-muted-foreground">
      <div className="mx-auto w-full max-w-[1200px] px-4 md:px-6 lg:px-8 flex flex-col items-center gap-2">
        <p className="text-caption">Harambe Memorial League Memorial League</p>
        <SyncTimestamp />
      </div>
    </footer>
  );
}
