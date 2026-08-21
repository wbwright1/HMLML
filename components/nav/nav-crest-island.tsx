"use client";

import { NavCrest } from "@/components/nav/nav-crest";
import { useSessionMember } from "@/components/use-session-member";

interface NavCrestIslandProps {
  variant?: "topbar" | "mobile";
}

/**
 * Client island wrapper around the presentational NavCrest.
 *
 * The crest is the only part of the nav that depends on the request's cookies.
 * Resolving it on the server (the previous design) called cookies() inside the
 * root layout, which opts every route on the site out of static rendering and
 * silently defeats ISR everywhere. Fetching it here keeps the rest of the nav,
 * and therefore every page, cacheable.
 *
 * The loading placeholder reserves the box of the SIGNED-OUT rendering, not the
 * crest's, because signed out is the common case (crawlers and logged-out
 * visitors); matching it means no layout shift for almost every viewer.
 */
export function NavCrestIsland({ variant = "topbar" }: NavCrestIslandProps) {
  const session = useSessionMember();

  if (session.status === "loading") {
    // Desktop signed-out renders a "Claim your team" pill; mobile renders
    // nothing. Mirror each so the header does not shift when the fetch lands.
    if (variant === "mobile") return null;
    return (
      <span
        aria-hidden="true"
        className="shrink-0 whitespace-nowrap rounded-full border border-transparent px-3 py-1.5 text-caption font-semibold text-transparent"
      >
        Claim your team
      </span>
    );
  }

  return <NavCrest member={session.member} variant={variant} />;
}
