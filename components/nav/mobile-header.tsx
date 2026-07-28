import Link from "next/link";
import { LivePill, type LivePillProps } from "@/components/live-pill";
import { NavCrest, type NavCrestMember } from "@/components/nav/nav-crest";
import { SearchCommand } from "@/components/search/search-command";

interface MobileHeaderProps {
  livePill: LivePillProps;
  member: NavCrestMember | null;
}

/** Mobile chrome (<lg): 56px header row with wordmark + right cluster (compact
 *  live pill, search trigger icon, crest). Positioning (sticky/z-index) lives
 *  on the ScrollChrome wrapper in site-nav.tsx, not here. A signed-in member's
 *  32px crest fits at the right edge; signed out shows nothing there (NavCrest
 *  handles the variant). */
export function MobileHeader({ livePill, member }: MobileHeaderProps) {
  return (
    <div className="flex h-14 items-center justify-between gap-2 border-b border-border bg-canvas/85 px-4 backdrop-blur-md lg:hidden">
      <Link
        href="/"
        aria-label="HMLML, Home"
        className="font-serif text-[21px] italic text-accent-gold"
      >
        HMLML
      </Link>
      <div className="flex items-center gap-1.5">
        <LivePill {...livePill} format="compact" />
        <SearchCommand variant="mobile" trigger="icon" />
        <NavCrest member={member} variant="mobile" />
      </div>
    </div>
  );
}
