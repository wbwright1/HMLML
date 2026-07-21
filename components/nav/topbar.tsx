import Link from "next/link";
import { NavPills } from "@/components/nav/nav-pills";
import { SearchCommand } from "@/components/search/search-command";
import { LivePill, type LivePillProps } from "@/components/live-pill";

/**
 * Small league crest (NOT a user avatar — the site is login-free). Gold-gradient
 * rounded square with an "HM" monogram, mirroring the dynasty crest shape.
 */
function LeagueCrest() {
  return (
    <span
      aria-hidden="true"
      className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] text-[12px] font-extrabold text-canvas shadow-[inset_0_0_0_1px_rgba(255,255,255,.10)]"
      style={{ background: "linear-gradient(140deg, #E2B858, #8E6E2A)" }}
    >
      HM
    </span>
  );
}

interface TopbarProps {
  livePill: LivePillProps;
}

/** Desktop chrome (lg+): sticky 64px pill topbar with inline search. */
export function Topbar({ livePill }: TopbarProps) {
  return (
    <div className="sticky top-0 z-40 hidden h-16 border-b border-border bg-canvas/85 backdrop-blur-md lg:block">
      <div className="mx-auto flex h-full w-full max-w-[1200px] items-center gap-4 px-8">
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

        <div className="ml-auto flex items-center gap-3">
          <SearchCommand variant="desktop" />
          <LivePill {...livePill} />
          <LeagueCrest />
        </div>
      </div>
    </div>
  );
}
