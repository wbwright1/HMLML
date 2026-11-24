import Link from "next/link";
import type { LivePillProps } from "@/components/live-pill";
import { LivePillIsland } from "@/components/nav/live-pill-island";
import { NavCrestIsland } from "@/components/nav/nav-crest-island";
import { SearchCommand } from "@/components/search/search-command";

interface MobileHeaderProps {
  livePill: LivePillProps;
}

/** Mobile chrome (<lg): 56px header row with wordmark + right cluster (compact
 *  live pill, 44px search trigger, then the crest). Positioning (sticky/z-index)
 *  lives on the wrapper in site-nav.tsx, not here. Signed in, the member's
 *  crest sits at the right edge; signed out, a compact gold "Claim" pill does
 *  (NavCrest handles the variant). */
export function MobileHeader({ livePill }: MobileHeaderProps) {
  return (
    <div className="flex h-14 items-center justify-between gap-2 border-b border-border bg-canvas/85 pl-4 pr-2 backdrop-blur-md lg:hidden">
      <Link
        href="/"
        aria-label="HMLML, Home"
        className="rounded-[6px] font-serif text-[22px] italic text-accent-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        HMLML
      </Link>
      <div className="flex min-w-0 items-center gap-0.5">
        <LivePillIsland initial={livePill} format="compact" className="mr-0.5" />
        <SearchCommand variant="mobile" trigger="icon" />
        <NavCrestIsland variant="mobile" />
      </div>
    </div>
  );
}
