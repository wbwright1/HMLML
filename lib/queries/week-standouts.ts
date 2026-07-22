import { db } from "@/lib/db";
import { playerWeekPoints, players, franchises } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WeekStandout {
  playerId: string;
  name: string;
  team: string | null;
  position: string | null;
  points: number;
  franchiseName: string;
  franchiseSlug: string;
}

export interface WeekStandouts {
  /** Highest-scoring started player of the week. */
  playerOfWeek: WeekStandout | null;
  /** Lowest-scoring started player who was actually expected to produce. */
  dudStarter: WeekStandout | null;
}

// Below this projection a low score is a forgotten bye-week kicker, not a bust;
// dud-starter candidates must clear it. Falls back to all starters if the
// filter empties the field (e.g. a week with no stored projections).
const DUD_MIN_PROJECTED = 5;

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Player of the Week + Dud Starter for a completed fantasy week. Both are drawn
 * from STARTED players only (started = true); bench performances never qualify.
 *
 * - playerOfWeek: highest actual points among started players.
 * - dudStarter: lowest actual points among started players whose projected
 *   points were >= DUD_MIN_PROJECTED. If none carry a projection that high,
 *   we fall back to the lowest-scoring starter overall so the slot is never
 *   empty when starters exist.
 *
 * Returns nulls (not throwing) when no started rows exist or the query fails.
 */
export async function getWeekStandouts(
  seasonId: number,
  week: number
): Promise<WeekStandouts> {
  const empty: WeekStandouts = { playerOfWeek: null, dudStarter: null };

  try {
    const rows = await db
      .select({
        playerId: playerWeekPoints.playerId,
        points: playerWeekPoints.points,
        projectedPoints: playerWeekPoints.projectedPoints,
        name: players.fullName,
        position: players.position,
        team: players.nflTeam,
        franchiseName: franchises.name,
        franchiseSlug: franchises.slug,
      })
      .from(playerWeekPoints)
      .leftJoin(players, eq(playerWeekPoints.playerId, players.id))
      .innerJoin(franchises, eq(playerWeekPoints.franchiseId, franchises.id))
      .where(
        and(
          eq(playerWeekPoints.seasonId, seasonId),
          eq(playerWeekPoints.week, week),
          eq(playerWeekPoints.started, true)
        )
      );

    if (rows.length === 0) return empty;

    const toStandout = (r: (typeof rows)[number]): WeekStandout => ({
      playerId: r.playerId,
      name: r.name ?? "Unknown",
      team: r.team,
      position: r.position,
      points: r.points,
      franchiseName: r.franchiseName,
      franchiseSlug: r.franchiseSlug,
    });

    const best = rows.reduce((a, b) => (b.points > a.points ? b : a));

    const dudPool = rows.filter(
      (r) => (r.projectedPoints ?? 0) >= DUD_MIN_PROJECTED
    );
    const dudRows = dudPool.length > 0 ? dudPool : rows;
    const worst = dudRows.reduce((a, b) => (b.points < a.points ? b : a));

    return {
      playerOfWeek: toStandout(best),
      dudStarter: toStandout(worst),
    };
  } catch (e) {
    console.error("[week-standouts] getWeekStandouts error:", e);
    return empty;
  }
}
