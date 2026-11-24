import Link from "next/link";
import { FranchiseLogo } from "@/components/franchise-logo";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export interface NavCrestMember {
  franchiseSlug: string | null;
  franchiseName: string | null;
  franchiseAvatarUrl: string | null;
  displayName: string;
}

interface NavCrestProps {
  /** The signed-in member, or null when signed out. */
  member: NavCrestMember | null;
  /** Topbar shows "Claim your team"; the 56px mobile header shows "Claim". */
  variant?: "topbar" | "mobile";
}

/** The header's single gold primary. Exported so the island's loading
 *  placeholder reserves exactly the same box (no layout shift). */
export const CLAIM_CTA_CLASS = {
  topbar: buttonVariants({ size: "sm" }),
  // A 32px pill inside a 44px-tall hit area (the Link carries the height).
  mobile: cn(buttonVariants({ size: "sm" }), "h-8 px-3 text-[13px]"),
} as const;

export const CLAIM_CTA_LABEL = {
  topbar: "Claim your team",
  mobile: "Claim",
} as const;

/**
 * Right-cluster crest. Signed in: the member's dynasty crest (their franchise
 * logo/monogram) linking to /claim. Signed out (or signed in but unattached,
 * so there is always a path back into /claim): the gold "Claim" primary, as
 * "Claim your team" on the topbar and a compact "Claim" on the mobile header.
 */
export function NavCrest({ member, variant = "topbar" }: NavCrestProps) {
  if (member && member.franchiseSlug && member.franchiseName) {
    return (
      <Link
        href="/claim"
        aria-label={`${member.franchiseName}, manage your team`}
        className="flex size-11 shrink-0 items-center justify-center rounded-[12px] transition-[scale] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
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

  if (variant === "mobile") {
    return (
      <Link
        href="/claim"
        className="group/claim flex h-11 shrink-0 items-center rounded-full px-1 focus-visible:outline-none"
      >
        <span
          className={cn(
            CLAIM_CTA_CLASS.mobile,
            "group-active/claim:scale-[0.97] group-focus-visible/claim:ring-2 group-focus-visible/claim:ring-ring group-focus-visible/claim:ring-offset-2 group-focus-visible/claim:ring-offset-canvas"
          )}
        >
          {CLAIM_CTA_LABEL.mobile}
        </span>
      </Link>
    );
  }

  return (
    <Link href="/claim" className={CLAIM_CTA_CLASS.topbar}>
      {CLAIM_CTA_LABEL.topbar}
    </Link>
  );
}
