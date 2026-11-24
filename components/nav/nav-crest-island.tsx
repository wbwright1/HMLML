"use client";

import {
  NavCrest,
  CLAIM_CTA_CLASS,
  CLAIM_CTA_LABEL,
} from "@/components/nav/nav-crest";
import { useSessionMember } from "@/components/use-session-member";
import { cn } from "@/lib/utils";

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
    // Same classes as the signed-out Claim pill, made invisible and inert.
    return (
      <span
        aria-hidden="true"
        className={cn(
          variant === "mobile" ? "flex h-11 shrink-0 items-center px-1" : "inline-flex"
        )}
      >
        <span
          className={cn(
            CLAIM_CTA_CLASS[variant],
            "invisible shadow-none"
          )}
        >
          {CLAIM_CTA_LABEL[variant]}
        </span>
      </span>
    );
  }

  return <NavCrest member={session.member} variant={variant} />;
}
