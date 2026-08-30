import { BookRailIsland } from "@/components/book/book-rail-island";
import type { BookGame } from "@/lib/queries/book";

/**
 * Thin server wrapper around the Book rail island: computes the league-wide
 * fallback line from data the hub already fetched (getBookBoard), so the
 * client island never has to guess or fabricate a number for a signed-out or
 * pre-fetch visitor. Renders nothing when there is nothing true to say yet
 * (caller already gates on games.length > 0, but this stays defensive).
 */
export function BookRailCard({ games, week }: { games: BookGame[]; week: number }) {
  if (games.length === 0) return null;

  const totalPicks = games.reduce((n, g) => n + g.homePicks + g.awayPicks, 0);
  const openCount = games.filter((g) => g.status === "open").length;

  const fallbackLine =
    totalPicks > 0
      ? `${totalPicks} pick${totalPicks === 1 ? "" : "s"} in this week. ${openCount} game${openCount === 1 ? "" : "s"} still open.`
      : "The board opens once picks come in.";

  return <BookRailIsland week={week} games={games} fallbackLine={fallbackLine} />;
}
