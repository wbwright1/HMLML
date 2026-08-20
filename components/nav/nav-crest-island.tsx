"use client";

import { useEffect, useState } from "react";
import { NavCrest, type NavCrestMember } from "@/components/nav/nav-crest";

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
 * While the fetch is in flight the crest's 32px box is reserved so the header
 * does not shift when the session resolves.
 */
export function NavCrestIsland({ variant = "topbar" }: NavCrestIslandProps) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; member: NavCrestMember | null }
  >({ status: "loading" });

  useEffect(() => {
    let active = true;

    fetch("/api/session", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : { data: null }))
      .then((body: { data?: NavCrestMember | null }) => {
        if (!active) return;
        setState({ status: "ready", member: body?.data ?? null });
      })
      .catch(() => {
        if (!active) return;
        setState({ status: "ready", member: null });
      });

    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") {
    return <div aria-hidden="true" className="size-8 shrink-0" />;
  }

  return <NavCrest member={state.member} variant={variant} />;
}
