import { db } from "@/lib/db";
import { matchups, franchises, franchiseSeasons } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { pairMatchupRows, type PairedMatchup } from "@/lib/queries/matchups";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FranchiseScheduleWeek {
  week: number;
  matchupId: number;
  opponent: {
    franchiseId: string;
    franchiseName: string;
    franchiseSlug: string;
    franchiseAbbreviation: string | null;
    franchiseBrandingColor: string | null;
    avatarUrl: string | null;
  } | null;
  points: number;
  opponentPoints: number;
  status: string;
  result: "W" | "L" | "T" | null;
  isUpcoming: boolean;
  isLive: boolean;
  isPlayoff: boolean;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Returns every matchup for a season, grouped and paired by week. Same
 * select/join as getMatchupsByWeek, but without a week filter — used for the
 * full-season schedule view. Shares pairMatchupRows with lib/queries/matchups.ts
 * so pairing logic isn't duplicated.
 */
export async function getSeasonSchedule(
  seasonId: number
): Promise<Map<number, PairedMatchup[]>> {
  try {
    const rows = await db
      .select({
        id: matchups.id,
        matchupId: matchups.matchupId,
        week: matchups.week,
        seasonId: matchups.seasonId,
        franchiseId: matchups.franchiseId,
        rosterId: matchups.rosterId,
        points: matchups.points,
        isWinner: matchups.isWinner,
        isPlayoff: matchups.isPlayoff,
        status: matchups.status,
        franchiseName: franchises.name,
        franchiseSlug: franchises.slug,
        franchiseAbbreviation: franchises.abbreviation,
        franchiseBrandingColor: franchises.brandingColor,
        avatarUrl: franchiseSeasons.avatarUrl,
      })
      .from(matchups)
      .innerJoin(franchises, eq(matchups.franchiseId, franchises.id))
      .leftJoin(
        franchiseSeasons,
        and(
          eq(franchiseSeasons.franchiseId, matchups.franchiseId),
          eq(franchiseSeasons.seasonId, matchups.seasonId)
        )
      )
      .where(eq(matchups.seasonId, seasonId));

    const byWeek = new Map<number, typeof rows>();
    for (const row of rows) {
      if (!byWeek.has(row.week)) {
        byWeek.set(row.week, []);
      }
      byWeek.get(row.week)!.push(row);
    }

    const result = new Map<number, PairedMatchup[]>();
    for (const [week, weekRows] of byWeek) {
      result.set(week, pairMatchupRows(weekRows));
    }

    // Sort by week ascending for stable iteration by callers.
    return new Map([...result.entries()].sort((a, b) => a[0] - b[0]));
  } catch (e) {
    console.error("[schedule] getSeasonSchedule error:", e);
    return new Map();
  }
}

/**
 * Returns a single franchise's per-week schedule for a season: opponent,
 * status, result (W/L/T), and upcoming/live flags. Built from the same
 * `matchups` rows as the league-wide schedule (no separate data source).
 */
export async function getFranchiseSchedule(
  franchiseId: string,
  seasonId: number
): Promise<FranchiseScheduleWeek[]> {
  try {
    const rows = await db
      .select({
        matchupId: matchups.matchupId,
        week: matchups.week,
        franchiseId: matchups.franchiseId,
        points: matchups.points,
        isWinner: matchups.isWinner,
        isPlayoff: matchups.isPlayoff,
        status: matchups.status,
        franchiseName: franchises.name,
        franchiseSlug: franchises.slug,
        franchiseAbbreviation: franchises.abbreviation,
        franchiseBrandingColor: franchises.brandingColor,
        avatarUrl: franchiseSeasons.avatarUrl,
      })
      .from(matchups)
      .innerJoin(franchises, eq(matchups.franchiseId, franchises.id))
      .leftJoin(
        franchiseSeasons,
        and(
          eq(franchiseSeasons.franchiseId, matchups.franchiseId),
          eq(franchiseSeasons.seasonId, matchups.seasonId)
        )
      )
      .where(eq(matchups.seasonId, seasonId));

    // Group all rows (both sides of every matchup) by (week, matchupId) so we
    // can find the opponent row for each matchup. matchupId is only unique
    // WITHIN a week (Sleeper reuses small ids like 1-6 every week), so the
    // grouping key must include the week or rows from different weeks that
    // happen to share a matchupId get merged together.
    const byWeekMatchupId = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.week}:${row.matchupId}`;
      if (!byWeekMatchupId.has(key)) {
        byWeekMatchupId.set(key, []);
      }
      byWeekMatchupId.get(key)!.push(row);
    }

    const weeks: FranchiseScheduleWeek[] = [];

    for (const pair of byWeekMatchupId.values()) {
      const mine = pair.find((r) => r.franchiseId === franchiseId);
      if (!mine) continue;

      const opponentRow = pair.find((r) => r.franchiseId !== franchiseId);
      const status = mine.status ?? "scheduled";
      const points = mine.points ?? 0;
      const opponentPoints = opponentRow?.points ?? 0;

      // A tie is equal, non-null points on a completed matchup with a real
      // opponent; check that first so a bye/incomplete opponent row (which
      // defaults opponentPoints to 0 and can coincidentally equal a
      // not-yet-started `mine.points` of 0) never gets labeled "T". Beyond
      // that, W and L are each only assigned from an explicit is_winner
      // value; a completed matchup with unequal points and a null is_winner
      // (a sync backstop row, or a legacy row without a resolved winner) is
      // left as null rather than defaulting to "L".
      let result: "W" | "L" | "T" | null = null;
      if (status === "complete" && opponentRow) {
        if (points === opponentPoints) result = "T";
        else if (mine.isWinner === true) result = "W";
        else if (mine.isWinner === false) result = "L";
      }

      weeks.push({
        week: mine.week,
        matchupId: mine.matchupId,
        opponent: opponentRow
          ? {
              franchiseId: opponentRow.franchiseId,
              franchiseName: opponentRow.franchiseName,
              franchiseSlug: opponentRow.franchiseSlug,
              franchiseAbbreviation: opponentRow.franchiseAbbreviation,
              franchiseBrandingColor: opponentRow.franchiseBrandingColor,
              avatarUrl: opponentRow.avatarUrl,
            }
          : null,
        points,
        opponentPoints,
        status,
        result,
        isUpcoming: status === "scheduled",
        isLive: status === "in_progress",
        isPlayoff: mine.isPlayoff ?? false,
      });
    }

    weeks.sort((a, b) => a.week - b.week);
    return weeks;
  } catch (e) {
    console.error("[schedule] getFranchiseSchedule error:", e);
    return [];
  }
}
