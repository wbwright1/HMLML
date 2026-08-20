"use client";

import { useEffect, useState } from "react";
import type { NavCrestMember } from "@/components/nav/nav-crest";

export type SessionState =
  | { status: "loading" }
  | { status: "ready"; member: NavCrestMember | null };

/**
 * Module-level dedupe. Three islands need the session on a typical page (the
 * topbar crest, the mobile header crest, and the smack composer slot), and
 * without this each one would issue its own identical /api/session request.
 * The promise is cached for the lifetime of the document, which is correct:
 * the session cookie cannot change without a navigation.
 */
let sessionPromise: Promise<NavCrestMember | null> | null = null;

function loadSessionMember(): Promise<NavCrestMember | null> {
  if (!sessionPromise) {
    sessionPromise = fetch("/api/session", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : { data: null }))
      .then((body: { data?: NavCrestMember | null }) => body?.data ?? null)
      .catch(() => null);
  }
  return sessionPromise;
}

/** Resolves the signed-in member client-side, sharing one fetch across islands. */
export function useSessionMember(): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    loadSessionMember().then((member) => {
      if (active) setState({ status: "ready", member });
    });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
