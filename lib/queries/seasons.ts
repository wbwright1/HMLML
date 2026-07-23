import { cache } from "react";
import { db } from "@/lib/db";
import { seasons, franchises, franchiseSeasons } from "@/lib/db/schema";
import { eq, desc, asc, sql } from "drizzle-orm";

/**
 * Returns all seasons ordered by season_year DESC.
 * Includes champion franchise info when available.
 * Uses a single query with a LEFT JOIN to avoid N+1.
 */
export async function getAllSeasons() {
  try {
    const rows = await db
      .select({
        id: seasons.id,
        seasonYear: seasons.seasonYear,
        leagueId: seasons.leagueId,
        previousLeagueId: seasons.previousLeagueId,
        status: seasons.status,
        championFranchiseId: seasons.championFranchiseId,
        totalRosters: seasons.totalRosters,
        playoffWeekStart: seasons.playoffWeekStart,
        settingsJson: seasons.settingsJson,
        createdAt: seasons.createdAt,
        updatedAt: seasons.updatedAt,
        championName: sql<string | null>`champ.name`,
      })
      .from(seasons)
      .leftJoin(
        sql`${franchises} champ`,
        sql`champ.id = ${seasons.championFranchiseId}`
      )
      .orderBy(desc(seasons.seasonYear));

    return rows;
  } catch (e) {
    console.error("[seasons] getAllSeasons error:", e);
    return [];
  }
}

/**
 * Loads a season's scoring_settings map from seasons.settings_json, keyed by
 * season year (not the internal season id). Returns the map used to weight raw
 * projection/stat lines into league-scored fantasy points.
 *
 * Falls back to the latest season's scoring settings when no row exists for
 * projSeason (e.g. the upcoming season has no row yet), since scoring settings
 * carry over year to year. Returns null only when there is no season row at
 * all, or the row carries no scoring_settings.
 */
export async function loadSeasonScoringSettings(
  projSeason: number
): Promise<Record<string, number> | null> {
  try {
    const [exact] = await db
      .select({ settingsJson: seasons.settingsJson })
      .from(seasons)
      .where(eq(seasons.seasonYear, projSeason))
      .limit(1);

    // Fall back to the latest season's scoring settings whenever the exact
    // row is missing OR present but carrying no scoring_settings (not just
    // when the row itself doesn't exist), since scoring settings carry over
    // year to year.
    const exactSettings = (exact?.settingsJson ?? null) as {
      scoring_settings?: Record<string, number>;
    } | null;

    if (exactSettings?.scoring_settings) {
      return exactSettings.scoring_settings;
    }

    const [latest] = await db
      .select({ settingsJson: seasons.settingsJson })
      .from(seasons)
      .orderBy(desc(seasons.seasonYear))
      .limit(1);

    const latestSettings = (latest?.settingsJson ?? null) as {
      scoring_settings?: Record<string, number>;
    } | null;
    return latestSettings?.scoring_settings ?? null;
  } catch (e) {
    console.error("[seasons] loadSeasonScoringSettings error:", e);
    return null;
  }
}

/**
 * Returns the most recent season with status 'complete'.
 * Used by preseason/offseason hubs to pull awards and recap from the last finished season.
 */
export async function getLastCompletedSeason() {
  try {
    const [season] = await db
      .select({
        id: seasons.id,
        seasonYear: seasons.seasonYear,
        status: seasons.status,
        playoffWeekStart: seasons.playoffWeekStart,
      })
      .from(seasons)
      .where(eq(seasons.status, "complete"))
      .orderBy(desc(seasons.seasonYear))
      .limit(1);
    return season ?? null;
  } catch (e) {
    console.error("[seasons] getLastCompletedSeason error:", e);
    return null;
  }
}

/**
 * Returns a single season by year, with its franchise_seasons data joined.
 */
export async function getSeasonByYear(year: number) {
  try {
    const [season] = await db
      .select()
      .from(seasons)
      .where(eq(seasons.seasonYear, year))
      .limit(1);

    if (!season) return null;

    const standings = await db
      .select()
      .from(franchiseSeasons)
      .where(eq(franchiseSeasons.seasonId, season.id))
      .orderBy(asc(franchiseSeasons.standingsFinish));

    // Get champion name if available
    let championName: string | null = null;
    if (season.championFranchiseId) {
      const [franchise] = await db
        .select({ name: franchises.name })
        .from(franchises)
        .where(eq(franchises.id, season.championFranchiseId))
        .limit(1);

      championName = franchise?.name ?? null;
    }

    return { ...season, championName, standings };
  } catch (e) {
    console.error("[seasons] getSeasonByYear error:", e);
    return null;
  }
}

/**
 * Returns franchise_seasons for a given season ID, ordered by standings_finish,
 * with franchise info (name, abbreviation, branding color) joined.
 *
 * Wrapped in React `cache()` so the nav and the page dedupe the standings read
 * for the same season within a request.
 */
export const getSeasonStandings = cache(async function getSeasonStandings(seasonId: number) {
  try {
    const standings = await db
      .select({
        id: franchiseSeasons.id,
        franchiseId: franchiseSeasons.franchiseId,
        seasonId: franchiseSeasons.seasonId,
        rosterId: franchiseSeasons.rosterId,
        userId: franchiseSeasons.userId,
        ownerDisplayName: franchiseSeasons.ownerDisplayName,
        coOwnerDisplayName: franchiseSeasons.coOwnerDisplayName,
        avatarUrl: franchiseSeasons.avatarUrl,
        division: franchiseSeasons.division,
        divisionName: franchiseSeasons.divisionName,
        wins: franchiseSeasons.wins,
        losses: franchiseSeasons.losses,
        ties: franchiseSeasons.ties,
        pointsScored: franchiseSeasons.pointsScored,
        pointsAgainst: franchiseSeasons.pointsAgainst,
        standingsFinish: franchiseSeasons.standingsFinish,
        playoffResult: franchiseSeasons.playoffResult,
        isLegacyEra: franchiseSeasons.isLegacyEra,
        franchiseSlug: franchises.slug,
        franchiseName: franchises.name,
        franchiseAbbreviation: franchises.abbreviation,
        franchiseBrandingColor: franchises.brandingColor,
      })
      .from(franchiseSeasons)
      .innerJoin(franchises, eq(franchiseSeasons.franchiseId, franchises.id))
      .where(eq(franchiseSeasons.seasonId, seasonId))
      .orderBy(asc(franchiseSeasons.standingsFinish));

    return standings;
  } catch (e) {
    console.error("[seasons] getSeasonStandings error:", e);
    return [];
  }
});
