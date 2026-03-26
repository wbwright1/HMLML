import Link from "next/link";
import { SeasonalPillBadge } from "@/components/seasonal-pill-badge";
import { SiteNavClient } from "@/components/site-nav-client";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-6 lg:px-8 h-14"
      >
        <Link
          href="/"
          className="text-lg font-bold text-primary"
          aria-label="HMLML — Home"
        >
          HMLML
        </Link>

        <SiteNavClient
          pillBadge={
            <SeasonalPillBadge />
          }
        />
      </nav>
    </header>
  );
}
