"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { NavCrestMember } from "@/components/nav/nav-crest";

export type SessionState =
  | { status: "loading" }
  | { status: "ready"; member: NavCrestMember | null };

/**
 * Dedupes only the requests that are actually in flight.
 *
 * Three islands need the session on a typical page (both nav crests and the
 * smack composer slot) and they mount in the same tick, so sharing the pending
 * promise collapses them to a single request. It is cleared once settled: the
 * nav lives in the root layout and never unmounts, so a promise cached for the
 * document's lifetime would pin the signed-out result forever and the crest
 * would never appear after signing in.
 */
let inFlight: Promise<NavCrestMember | null> | null = null;

function loadSessionMember(): Promise<NavCrestMember | null> {
  if (!inFlight) {
    inFlight = fetch("/api/session", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : { data: null }))
      .then((body: { data?: NavCrestMember | null }) => body?.data ?? null)
      .catch(() => null)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/**
 * Resolves the signed-in member client-side, sharing one fetch across islands.
 *
 * Re-reads on pathname change because signing in redirects with a client-side
 * navigation: the root layout (and therefore this island) never re-mounts, so
 * without this the crest would keep showing the pre-sign-in state until a hard
 * reload. Signed out costs one cheap request that never touches Postgres.
 */
export function useSessionMember(): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const pathname = usePathname();

  useEffect(() => {
    let active = true;
    loadSessionMember().then((member) => {
      if (active) setState({ status: "ready", member });
    });
    return () => {
      active = false;
    };
  }, [pathname]);

  return state;
}
