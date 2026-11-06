import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { matchups } from "@/lib/db/schema";
import { computeSeasonArc, type ArcGame, type SeasonArc } from "@/lib/season-arc";

/**
 * Week-by-week rank lines for one season (see lib/season-arc.ts).
 *
 * Reads completed REGULAR-SEASON games only: a game counts when it is not
 * flagged playoff and, when the season knows its playoff start, falls before
 * it. Playoff and consolation weeks would otherwise drag the lines around for
 * reasons that have nothing to do with the regular season.
 *
 * Throws on a DB error; the season page routes that through
 * rethrowUnlessTolerable like the rest of its data.
 */
export async function getSeasonArc(
  seasonId: number,
  playoffWeekStart: number | null,
  franchiseIds: string[]
): Promise<SeasonArc | null> {
  if (franchiseIds.length === 0) return null;

  const rows = await db
    .select({
      franchiseId: matchups.franchiseId,
      week: matchups.week,
      points: matchups.points,
      isWinner: matchups.isWinner,
    })
    .from(matchups)
    .where(
      and(
        eq(matchups.seasonId, seasonId),
        eq(matchups.status, "complete"),
        eq(matchups.isPlayoff, false),
        playoffWeekStart != null ? lt(matchups.week, playoffWeekStart) : undefined
      )
    );

  const known = new Set(franchiseIds);
  const games: ArcGame[] = rows
    .filter((r) => known.has(r.franchiseId))
    .map((r) => ({
      franchiseId: r.franchiseId,
      week: r.week,
      points: r.points ?? 0,
      isWinner: r.isWinner,
    }));

  // One week is a dot, not a line; the chart starts earning its space at two.
  const arc = computeSeasonArc(franchiseIds, games);
  return arc.weeks.length >= 2 ? arc : null;
}
