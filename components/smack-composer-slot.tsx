"use client";

import Link from "next/link";
import { SmackComposer } from "@/components/smack-composer";
import { useSessionMember } from "@/components/use-session-member";

/**
 * Session-gated slot above the smack feed: the composer for a signed-in member
 * with a franchise, the "claim your team" prompt otherwise.
 *
 * This is a client island for the same reason the nav crest is: resolving the
 * session on the server calls cookies(), and the hubs render inside the root
 * layout's route, so a server-side session read would opt the homepage out of
 * static rendering and defeat ISR on the single most-crawled page on the site.
 *
 * The signed-out prompt is the correct first paint here (it is what a crawler
 * and every logged-out visitor sees), so there is no placeholder state; a
 * signed-in member's composer swaps in once /api/session resolves.
 */
export function SmackComposerSlot() {
  const session = useSessionMember();
  const canPost =
    session.status === "ready" && Boolean(session.member?.franchiseSlug);

  if (canPost) return <SmackComposer />;

  return (
    <Link
      href="/claim"
      className="card-surface block p-4 text-body-sm text-text-tertiary transition-colors duration-150 hover:text-text-secondary"
    >
      Got something to say?{" "}
      <span className="font-semibold text-accent-gold">Claim your team.</span>
    </Link>
  );
}
