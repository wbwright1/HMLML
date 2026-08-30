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
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center gap-2 px-4 md:px-6 lg:px-8">
        <p className="text-caption text-text-tertiary">
          Harambe Memorial League Memorial League
        </p>
        <nav aria-label="Footer navigation">
          <Link
            href="/players"
            className="text-body-sm text-text-tertiary transition-colors duration-150 hover:text-accent-gold"
          >
            Players
          </Link>
        </nav>
        <SyncTimestamp />
      </div>
    </footer>
  );
}
