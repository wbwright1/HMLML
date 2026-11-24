"use client";

import Link from "next/link";
import { UserPlus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { useSessionMember } from "@/components/use-session-member";

/**
 * The between-weeks hero's one primary action for a signed-out visitor:
 * "Claim your team". A client island for the same reason the nav crest and
 * the smack composer slot are: the hub is ISR-cached HTML served to everyone,
 * and reading the session on the server would call cookies() and opt the
 * homepage out of static rendering.
 *
 * Signed out is the correct first paint (crawlers and logged-out visitors are
 * the common case), so the button renders while the session loads and only a
 * signed-in member's fetch removes it.
 *
 * The label comes in as a prop (HUB_CLAIM_CTA, passed by the server hub):
 * lib/content.ts pulls in DB query modules, so a client island must never
 * import it directly or pg ends up in the browser bundle.
 */
export function HeroClaimCta({ label }: { label: string }) {
  const session = useSessionMember();
  if (session.status === "ready" && session.member) return null;

  return (
    <Link
      href="/claim"
      data-testid="hero-claim-cta"
      className={buttonVariants({ variant: "default", size: "lg" })}
    >
      <UserPlus aria-hidden="true" strokeWidth={2} data-icon="inline-start" />
      {label}
    </Link>
  );
}
