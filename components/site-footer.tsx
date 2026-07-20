import { SyncTimestamp } from "@/components/sync-timestamp";

export function SiteFooter() {
  return (
    <footer className="border-t border-border py-8 text-center text-text-tertiary pb-[calc(env(safe-area-inset-bottom)+148px)] lg:pb-8">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center gap-2 px-4 md:px-6 lg:px-8">
        <p className="text-caption text-text-tertiary">
          Harambe Memorial League Memorial League
        </p>
        <SyncTimestamp />
      </div>
    </footer>
  );
}
