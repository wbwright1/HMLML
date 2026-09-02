import type { ReactNode } from "react";
import { PlayerLink } from "@/components/player-link";
import { TeamLink } from "@/components/team-link";

/**
 * The identity behind a Book row, chip or slip line. The Book's surfaces each
 * carry their own shape (a props subject, a futures entry), so callers narrow
 * to this before linking rather than every surface hand-wiring the same
 * player-versus-franchise dispatch.
 *
 * "none" is a real case, not a fallback: a futures market can be won by The
 * Field, and a prop can be about the whole league. Neither has one identity
 * to link to, so the children render plain.
 */
export type BookEntityTarget =
  | { kind: "player"; playerId: string | null | undefined }
  | { kind: "franchise"; slug: string | null | undefined; name: string }
  | { kind: "none" };

/**
 * Sends a Book identity to its own page: /players/[id] for a player,
 * /teams/[slug] for a franchise. The franchise branch carries an aria-label,
 * since a Book crest is decorative wherever its name is not immediately
 * beside it; pass `labelled={false}` where the link already contains the
 * visible name (or a deliberately non-decorative crest) so it is not
 * announced twice.
 */
export function BookEntityLink({
  target,
  className,
  labelled = true,
  children,
}: {
  target: BookEntityTarget;
  className?: string;
  labelled?: boolean;
  children: ReactNode;
}) {
  if (target.kind === "player") {
    return (
      <PlayerLink playerId={target.playerId} className={className}>
        {children}
      </PlayerLink>
    );
  }

  if (target.kind === "franchise") {
    return (
      <TeamLink
        slug={target.slug}
        aria-label={labelled ? target.name : undefined}
        className={className}
      >
        {children}
      </TeamLink>
    );
  }

  return <>{children}</>;
}
