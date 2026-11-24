import Link from "next/link";
import { NavPills } from "@/components/nav/nav-pills";
import { SearchCommand } from "@/components/search/search-command";
import type { LivePillProps } from "@/components/live-pill";
import { LivePillIsland } from "@/components/nav/live-pill-island";
import { NavCrestIsland } from "@/components/nav/nav-crest-island";

interface TopbarProps {
  livePill: LivePillProps;
}

/** Desktop chrome (lg+): sticky 64px pill topbar. From 1024 to 1279px the
 *  search collapses to an icon button and the live pill drops its secondary
 *  clause, so no pill text ever wraps. */
export function Topbar({ livePill }: TopbarProps) {
  return (
    <div className="sticky top-0 z-(--z-sticky) hidden h-16 border-b border-border bg-canvas/85 backdrop-blur-md lg:block">
      <div className="mx-auto flex h-full w-full max-w-[1200px] items-center gap-3 px-6 xl:gap-4 xl:px-8">
        <Link
          href="/"
          aria-label="HMLML, Home"
          className="mr-1 shrink-0 rounded-[6px] font-serif text-[22px] italic text-accent-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas xl:mr-2"
        >
          HMLML
        </Link>

        <nav aria-label="Main navigation" className="shrink-0">
          <NavPills variant="topbar" />
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 xl:gap-3">
          <SearchCommand variant="desktop" />
          <LivePillIsland initial={livePill} />
          <NavCrestIsland variant="topbar" />
        </div>
      </div>
    </div>
  );
}
