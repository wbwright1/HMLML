import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * Returns enriched season timeline data for the history page.
 * Includes champion, runner-up, and most PF per season.
 * Uses a single query with subqueries instead of N+1 pattern.
 */
export async function getSeasonTimelineData() {
  try {
    const rows = await db.execute(sql`
      SELECT
        s.id,
        s.season_year,
        s.status,
        s.total_rosters,
        champ.name AS champion_name,
        champ.slug AS champion_slug,
        champ_avatar.avatar_url AS champion_avatar_url,
        runner_up.name AS runner_up_name,
        top_scorer.name AS most_pf_name,
        top_scorer.points_scored AS most_pf_points,
        COALESCE(legacy.is_legacy, false) AS is_legacy
      FROM seasons s
      LEFT JOIN franchises champ ON champ.id = s.champion_franchise_id
      LEFT JOIN LATERAL (
        SELECT fs.avatar_url
        FROM franchise_seasons fs
        WHERE fs.season_id = s.id
          AND fs.franchise_id = s.champion_franchise_id
        LIMIT 1
      ) champ_avatar ON true
      LEFT JOIN LATERAL (
        SELECT f.name
        FROM franchise_seasons fs
        JOIN franchises f ON f.id = fs.franchise_id
        WHERE fs.season_id = s.id AND fs.playoff_result = 'runner_up'
        LIMIT 1
      ) runner_up ON true
      LEFT JOIN LATERAL (
        SELECT f.name, fs.points_scored
        FROM franchise_seasons fs
        JOIN franchises f ON f.id = fs.franchise_id
        WHERE fs.season_id = s.id AND fs.points_scored > 0
        ORDER BY fs.points_scored DESC
        LIMIT 1
      ) top_scorer ON true
      LEFT JOIN LATERAL (
        SELECT true AS is_legacy
        FROM franchise_seasons fs
        WHERE fs.season_id = s.id AND fs.is_legacy_era = true
        LIMIT 1
      ) legacy ON true
      ORDER BY s.season_year DESC
    `);

    return (rows.rows as Array<Record<string, unknown>>).map((row) => ({
      seasonYear: row.season_year as number,
      teamCount: (row.total_rosters as number) ?? 12,
      championName: (row.champion_name as string) ?? null,
      championSlug: (row.champion_slug as string) ?? null,
      championAvatarUrl: (row.champion_avatar_url as string) ?? null,
      runnerUpName: (row.runner_up_name as string) ?? null,
      mostPF: row.most_pf_name
        ? {
            franchiseName: row.most_pf_name as string,
            points: row.most_pf_points as number,
          }
        : null,
      isLegacy: row.is_legacy as boolean,
      status: row.status as string | null,
    }));
  } catch (error) {
    console.error("[history] getSeasonTimelineData error:", error);
    return [];
  }
}
