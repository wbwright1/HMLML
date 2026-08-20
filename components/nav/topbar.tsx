import Link from "next/link";
import { NavPills } from "@/components/nav/nav-pills";
import { SearchCommand } from "@/components/search/search-command";
import type { LivePillProps } from "@/components/live-pill";
import { LivePillIsland } from "@/components/nav/live-pill-island";
import { NavCrestIsland } from "@/components/nav/nav-crest-island";

interface TopbarProps {
  livePill: LivePillProps;
}

/** Desktop chrome (lg+): sticky 64px pill topbar with inline search. */
export function Topbar({ livePill }: TopbarProps) {
  return (
    <div className="sticky top-0 z-40 hidden h-16 border-b border-border bg-canvas/85 backdrop-blur-md lg:block">
      <div className="mx-auto flex h-full w-full max-w-[1200px] items-center gap-3 px-8 xl:gap-4">
        <Link
          href="/"
          aria-label="HMLML, Home"
          className="mr-2 font-serif text-[22px] italic text-accent-gold"
        >
          HMLML
        </Link>

        <nav aria-label="Main navigation">
          <NavPills variant="topbar" />
        </nav>

        <div className="ml-auto flex items-center gap-2 xl:gap-3">
          <SearchCommand variant="desktop" />
          <LivePillIsland initial={livePill} />
          <NavCrestIsland variant="topbar" />
        </div>
      </div>
    </div>
  );
}
