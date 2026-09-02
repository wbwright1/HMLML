import Link from "next/link";
import { cn } from "@/lib/utils";

interface TeamLinkProps {
  /** Franchise slug. Falsy (null/undefined/empty) renders children plain, so
   * callers with an optional slug never need to branch themselves. */
  slug: string | null | undefined;
  children: React.ReactNode;
  className?: string;
  /** Accessible name, for crest-only links whose logo is decorative. */
  "aria-label"?: string;
  /**
   * Next.js Link prefetch. Defaults to false: some pages render a dozen-plus
   * team links (standings tables, draft boards), and prefetching all of them
   * is wasteful.
   */
  prefetch?: boolean;
}

/**
 * Sitewide wrapper that turns a franchise name (optionally with its crest)
 * into a tap target linking to /teams/[slug]. The franchise mirror of
 * PlayerLink: server component, zero client JS, and the same falsy fallback
 * so callers never branch on nullability themselves.
 *
 * Renders an `a`, so a TeamLink wrapping a FranchiseLogo (a `div`) can never
 * sit inside a `<p>`; host it in a `div` or `span` instead.
 */
export function TeamLink({
  slug,
  children,
  className,
  prefetch,
  "aria-label": ariaLabel,
}: TeamLinkProps) {
  if (!slug) {
    return <>{children}</>;
  }

  return (
    <Link
      href={`/teams/${slug}`}
      prefetch={prefetch ?? false}
      aria-label={ariaLabel}
      className={cn("transition-colors hover:text-accent-gold", className)}
    >
      {children}
    </Link>
  );
}
