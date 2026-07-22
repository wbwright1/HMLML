import Link from "next/link";
import { LivePill, type LivePillProps } from "@/components/live-pill";
import { NavCrest, type NavCrestMember } from "@/components/nav/nav-crest";

interface MobileHeaderProps {
  livePill: LivePillProps;
  member: NavCrestMember | null;
}

/** Mobile chrome (<lg): sticky 56px header with wordmark + compact live pill.
 *  A signed-in member's 32px crest fits at the right edge; signed out shows
 *  nothing there (NavCrest handles the variant). */
export function MobileHeader({ livePill, member }: MobileHeaderProps) {
  return (
    <div className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-border bg-canvas/85 px-4 backdrop-blur-md lg:hidden">
      <Link
        href="/"
        aria-label="HMLML, Home"
        className="font-serif text-[21px] italic text-accent-gold"
      >
        HMLML
      </Link>
      <div className="flex items-center gap-2">
        <LivePill {...livePill} format="compact" />
        <NavCrest member={member} variant="mobile" />
      </div>
    </div>
  );
}
