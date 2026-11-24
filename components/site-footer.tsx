import Link from "next/link";
import { SyncTimestamp } from "@/components/sync-timestamp";

/**
 * The footer carries the Players link because The Book took the Players slot in
 * the nav. Search is still the primary door to /players; this is the permanent
 * one that exists on every page.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border py-8 text-center text-text-tertiary pb-[calc(env(safe-area-inset-bottom)+96px)] lg:pb-8">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center gap-1 px-4 md:px-6 lg:px-8">
        <p className="text-caption text-text-tertiary">
          Harambe Memorial League Memorial League
        </p>
        <nav aria-label="Footer navigation">
          <Link
            href="/players"
            className="inline-flex min-h-11 items-center rounded-full px-3 text-body-sm text-text-secondary transition-colors duration-150 hover:text-accent-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            Players
          </Link>
        </nav>
        <SyncTimestamp />
      </div>
    </footer>
  );
}
