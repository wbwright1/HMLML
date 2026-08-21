import { db } from "@/lib/db";
import { cachedQuery } from "@/lib/cache";
import { rethrowUnlessTolerable } from "@/lib/db-guard";
import { matchups, franchises, franchiseSeasons } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { pairMatchupRows, type PairedMatchup } from "@/lib/queries/matchups";
import { getLatestAvatarUrls } from "@/lib/queries/franchise-avatars";

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
async function getSeasonScheduleUncached(
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

    // Past seasons only have avatarUrl populated on their own franchise_seasons
    // row for 2026+; coalesce to each franchise's latest known avatar (across
    // any season) so older schedule views still show a real crest instead of
    // the monogram fallback. A season with its own real avatar keeps it, since
    // the coalesce only fires when avatarUrl is null.
    const fallbackAvatars = await getLatestAvatarUrls(
      rows.map((r) => r.franchiseId)
    );
    const rowsWithAvatars = rows.map((row) => ({
      ...row,
      avatarUrl: row.avatarUrl ?? fallbackAvatars.get(row.franchiseId) ?? null,
    }));

    const byWeek = new Map<number, typeof rowsWithAvatars>();
    for (const row of rowsWithAvatars) {
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
    rethrowUnlessTolerable(e);
    console.error("[schedule] getSeasonSchedule error:", e);
    return new Map();
  }
}

/**
 * Returns a single franchise's per-week schedule for a season: opponent,
 * status, result (W/L/T), and upcoming/live flags. Built from the same
 * `matchups` rows as the league-wide schedule (no separate data source).
 */
async function getFranchiseScheduleUncached(
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

    // See getSeasonSchedule: coalesce to each franchise's latest known avatar
    // so past seasons (avatarUrl populated only for 2026+) still show a real
    // crest rather than the monogram fallback.
    const fallbackAvatars = await getLatestAvatarUrls(
      rows.map((r) => r.franchiseId)
    );
    const rowsWithAvatars = rows.map((row) => ({
      ...row,
      avatarUrl: row.avatarUrl ?? fallbackAvatars.get(row.franchiseId) ?? null,
    }));

    // Group all rows (both sides of every matchup) by (week, matchupId) so we
    // can find the opponent row for each matchup. matchupId is only unique
    // WITHIN a week (Sleeper reuses small ids like 1-6 every week), so the
    // grouping key must include the week or rows from different weeks that
    // happen to share a matchupId get merged together.
    const byWeekMatchupId = new Map<string, typeof rowsWithAvatars>();
    for (const row of rowsWithAvatars) {
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
    rethrowUnlessTolerable(e);
    console.error("[schedule] getFranchiseSchedule error:", e);
    return [];
  }
}

/**
 * Cached wrapper (#209). Stores ENTRIES, not the Map: unstable_cache serializes
 * through JSON, where a Map becomes {} and silently loses the entire schedule.
 * cachedQuery's JsonSafe guard rejects the Map outright, so the conversion is
 * explicit here and the Map is rebuilt below, leaving callers unchanged.
 * Cleared by revalidateSite().
 */
const getSeasonScheduleEntries = cachedQuery(
  ["season-schedule"],
  async (seasonId: number) => [...(await getSeasonScheduleUncached(seasonId))],
);

export async function getSeasonSchedule(seasonId: number) {
  return new Map(await getSeasonScheduleEntries(seasonId));
}

/** Cached wrapper (#209): see lib/cache.ts. Cleared by revalidateSite(). */
export const getFranchiseSchedule = cachedQuery(["franchise-schedule"], getFranchiseScheduleUncached);
