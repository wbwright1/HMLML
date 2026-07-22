import Link from "next/link";
import { FranchiseLogo } from "@/components/franchise-logo";

export interface NavCrestMember {
  franchiseSlug: string | null;
  franchiseName: string | null;
  franchiseAvatarUrl: string | null;
  displayName: string;
}

interface NavCrestProps {
  /** The signed-in member, or null when signed out. */
  member: NavCrestMember | null;
  /** Mobile skips the signed-out "Claim" affordance (56px header has no room). */
  variant?: "topbar" | "mobile";
}

/**
 * Right-cluster crest. Signed in: the member's dynasty crest (their franchise
 * logo/monogram) linking to /claim, matching the mock's user crest slot. Signed
 * out on desktop: a subtle "Claim your team" ghost pill; on mobile the header is
 * too tight for it, so signed-out renders nothing there (deep-link /claim still
 * works, and the commish hands out the URL with the code).
 */
export function NavCrest({ member, variant = "topbar" }: NavCrestProps) {
  if (member && member.franchiseSlug && member.franchiseName) {
    return (
      <Link
        href="/claim"
        aria-label={`${member.franchiseName}, manage your team`}
        className="shrink-0 rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-accent-gold/60"
      >
        <FranchiseLogo
          slug={member.franchiseSlug}
          name={member.franchiseName}
          avatarUrl={member.franchiseAvatarUrl}
          size="sm"
          decorative
        />
      </Link>
    );
  }

  // Signed in but unattached: fall through to the claim affordance too, so there
  // is always a path back into /claim.
  if (variant === "mobile") return null;

  return (
    <Link
      href="/claim"
      className="shrink-0 whitespace-nowrap rounded-full border border-border bg-surface px-3 py-1.5 text-caption font-semibold text-text-tertiary transition-colors hover:border-border-strong hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-gold/60"
    >
      Claim your team
    </Link>
  );
}
