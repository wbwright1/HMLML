import Link from "next/link";
import { cn } from "@/lib/utils";

interface PlayerLinkProps {
  /** Sleeper player ID. Falsy (null/undefined/empty) renders children plain
   * (legacy draft picks with no resolved player, defense/team rows). */
  playerId: string | null | undefined;
  children: React.ReactNode;
  className?: string;
  /**
   * Next.js Link prefetch. Defaults to false: pages can render hundreds of
   * player links (tables, boards), and prefetching all of them is wasteful.
   */
  prefetch?: boolean;
}

/**
 * Sitewide wrapper that turns a player name (optionally with its headshot)
 * into a tap target linking to /players/[id]. Server component, zero client
 * JS. Falls back to rendering children unwrapped when playerId is falsy, so
 * callers never need to branch on nullability themselves.
 */
export function PlayerLink({
  playerId,
  children,
  className,
  prefetch,
}: PlayerLinkProps) {
  if (!playerId) {
    return <>{children}</>;
  }

  return (
    <Link
      href={`/players/${playerId}`}
      prefetch={prefetch ?? false}
      className={cn("transition-colors hover:text-accent-gold", className)}
    >
      {children}
    </Link>
  );
}
