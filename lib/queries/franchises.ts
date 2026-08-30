import { cache } from "react";
import { cachedQuery } from "@/lib/cache";
import { rethrowUnlessTolerable } from "@/lib/db-guard";
import { db } from "@/lib/db";
import {
  franchises,
  franchiseSeasons,
  seasons,
  rosterPlayers,
  players,
} from "@/lib/db/schema";
import { eq, desc, and, count, sum, sql } from "drizzle-orm";
import { getLatestAvatarUrls } from "@/lib/queries/franchise-avatars";
import { resolveOwnerName, resolveCoOwnerNames } from "@/lib/owner-names";

/**
 * Returns all franchises with aggregate career stats:
 * total championships, wins, losses, and points scored.
 * Also fetches the current owner from the most recent season.
 *
 * Wrapped in React `cache()` so repeated calls within the same request (e.g.
 * a page body plus generateMetadata) dedupe to a single set of queries.
 */
const getAllFranchisesUncached = cache(async function getAllFranchises() {
  try {
    const rowsQuery = db
      .select({
        id: franchises.id,
        slug: franchises.slug,
        name: franchises.name,
        abbreviation: franchises.abbreviation,
        brandingColor: franchises.brandingColor,
        totalWins: sum(franchiseSeasons.wins),
        totalLosses: sum(franchiseSeasons.losses),
        totalPointsScored: sum(franchiseSeasons.pointsScored),
        championships: count(
          sql`CASE WHEN ${franchiseSeasons.playoffResult} = 'champion' THEN 1 END`
        ),
      })
      .from(franchises)
      .leftJoin(
        franchiseSeasons,
        eq(franchises.id, franchiseSeasons.franchiseId)
      )
      .groupBy(franchises.id)
      .orderBy(franchises.name);

    // Fetch current owner for each franchise (from the most recent season only)
    const ownerRowsQuery = db.execute(sql`
      SELECT DISTINCT ON (fs.franchise_id)
        fs.franchise_id,
        fs.user_id,
        fs.owner_display_name,
        fs.co_owner_display_name
      FROM franchise_seasons fs
      INNER JOIN seasons s ON fs.season_id = s.id
      WHERE fs.owner_display_name IS NOT NULL
      ORDER BY fs.franchise_id, s.season_year DESC
    `);

    // rows and ownerRows are independent queries; avatars depend on rows'
    // franchise ids, so it joins the Promise.all once rows resolves.
    const [rows, ownerRows] = await Promise.all([rowsQuery, ownerRowsQuery]);

    const ownerMap = new Map<string, { owner: string; coOwner?: string }>();
    for (const row of ownerRows.rows as Array<Record<string, unknown>>) {
      const owner = resolveOwnerName({
        userId: row.user_id as string | null,
        displayName: row.owner_display_name as string,
      });
      ownerMap.set(row.franchise_id as string, {
        owner: owner as string,
        coOwner: resolveCoOwnerNames(row.co_owner_display_name as string | null),
      });
    }

    const avatarUrls = await getLatestAvatarUrls(rows.map((r) => r.id));

    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      abbreviation: r.abbreviation ?? undefined,
      brandingColor: r.brandingColor ?? undefined,
      avatarUrl: avatarUrls.get(r.id) ?? null,
      ownerName: ownerMap.get(r.id)?.owner,
      coOwnerName: ownerMap.get(r.id)?.coOwner,
      totalWins: Number(r.totalWins ?? 0),
      totalLosses: Number(r.totalLosses ?? 0),
      totalPointsScored: Number(r.totalPointsScored ?? 0),
      championships: r.championships,
    }));
  } catch (e) {
    rethrowUnlessTolerable(e);
    return null;
  }
});

/**
 * Lightweight franchise-id -> crest lookup (name/slug/abbreviation/color),
 * for callers (e.g. player-lore cards) that already have a franchiseId and
 * just need a link + branding, without the full getFranchiseBySlug payload.
 */
export async function getFranchiseCrestById(franchiseId: string) {
  try {
    const [row] = await db
      .select({
        id: franchises.id,
        slug: franchises.slug,
        name: franchises.name,
        abbreviation: franchises.abbreviation,
        brandingColor: franchises.brandingColor,
      })
      .from(franchises)
      .where(eq(franchises.id, franchiseId))
      .limit(1);

    if (!row) return null;

    const avatarUrls = await getLatestAvatarUrls([row.id]);

    return { ...row, avatarUrl: avatarUrls.get(row.id) ?? null };
  } catch (e) {
    console.error("[franchises] getFranchiseCrestById error:", e);
    return null;
  }
}

/**
 * Returns a single franchise by slug, together with all of its
 * franchise_seasons rows joined with season info, ordered newest-first.
 *
 * Wrapped in React `cache()` so generateMetadata + the page body dedupe to a
 * single set of queries per request.
 */
const getFranchiseBySlugUncached = cache(async function getFranchiseBySlug(
  slug: string
) {
  try {
    const [franchise] = await db
      .select()
      .from(franchises)
      .where(eq(franchises.slug, slug))
      .limit(1);

    if (!franchise) return null;

    // seasonHistory and avatarUrls both depend only on franchise.id, not on
    // each other, so they run concurrently rather than serially.
    const [seasonHistory, avatarUrls] = await Promise.all([
      db
        .select({
          id: franchiseSeasons.id,
          franchiseId: franchiseSeasons.franchiseId,
          seasonId: franchiseSeasons.seasonId,
          rosterId: franchiseSeasons.rosterId,
          userId: franchiseSeasons.userId,
          ownerDisplayName: franchiseSeasons.ownerDisplayName,
          coOwnerDisplayName: franchiseSeasons.coOwnerDisplayName,
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
          seasonYear: seasons.seasonYear,
          seasonStatus: seasons.status,
        })
        .from(franchiseSeasons)
        .innerJoin(seasons, eq(franchiseSeasons.seasonId, seasons.id))
        .where(eq(franchiseSeasons.franchiseId, franchise.id))
        .orderBy(desc(seasons.seasonYear)),
      getLatestAvatarUrls([franchise.id]),
    ]);

    const seasonHistoryWithNames = seasonHistory.map((row) => ({
      ...row,
      ownerDisplayName: resolveOwnerName({
        userId: row.userId,
        displayName: row.ownerDisplayName,
      }),
      coOwnerDisplayName: resolveCoOwnerNames(row.coOwnerDisplayName),
    }));

    // Compute aggregate stats
    let totalWins = 0;
    let totalLosses = 0;
    let totalPointsScored = 0;
    let championships = 0;

    for (const s of seasonHistory) {
      totalWins += s.wins ?? 0;
      totalLosses += s.losses ?? 0;
      totalPointsScored += s.pointsScored ?? 0;
      if (s.playoffResult === "champion") championships++;
    }

    return {
      ...franchise,
      abbreviation: franchise.abbreviation ?? undefined,
      brandingColor: franchise.brandingColor ?? undefined,
      avatarUrl: avatarUrls.get(franchise.id) ?? null,
      seasonHistory: seasonHistoryWithNames,
      totalWins,
      totalLosses,
      totalPointsScored,
      championships,
    };
  } catch (e) {
    rethrowUnlessTolerable(e);
    return null;
  }
});

/**
 * Returns roster_players for a franchise/season, joined with player info.
 *
 * A franchise with no roster rows for that season is a real outcome and comes
 * back as an empty array. A rejected query goes through rethrowUnlessTolerable
 * so a DB outage reaches the error boundary instead of ISR-caching a hollow
 * roster page (#253).
 */
export async function getFranchiseRoster(
  franchiseId: string,
  seasonId: number
) {
  try {
    const roster = await db
      .select({
        id: rosterPlayers.id,
        playerId: rosterPlayers.playerId,
        slot: rosterPlayers.slot,
        fullName: players.fullName,
        firstName: players.firstName,
        lastName: players.lastName,
        position: players.position,
        nflTeam: players.nflTeam,
        status: players.status,
        injuryStatus: players.injuryStatus,
        age: players.age,
        yearsExp: players.yearsExp,
        pointsPpr: players.pointsPpr,
        statsSeason: players.statsSeason,
        projPointsPpr: players.projPointsPpr,
        projSeason: players.projSeason,
      })
      // leftJoin, not innerJoin: the hourly roster sync can add a player
      // before the daily players sync has written their row, and an
      // innerJoin would silently drop that roster spot instead of showing it
      // with a placeholder name (mirrors the pattern in lib/queries/drafts.ts).
      .from(rosterPlayers)
      .leftJoin(players, eq(rosterPlayers.playerId, players.id))
      .where(
        and(
          eq(rosterPlayers.franchiseId, franchiseId),
          eq(rosterPlayers.seasonId, seasonId)
        )
      )
      .orderBy(players.position, players.lastName);

    return roster.map((r) => ({
      ...r,
      fullName: r.fullName ?? `Unknown Player (${r.playerId})`,
      position: r.position ?? "N/A",
    }));
  } catch (e) {
    rethrowUnlessTolerable(e);
    return null;
  }
}

/** Cached wrapper (#209): see lib/cache.ts. Cleared by revalidateSite(). */
export const getAllFranchises = cachedQuery(["all-franchises"], getAllFranchisesUncached);

/**
 * Cached wrapper (#209). createdAt/updatedAt are dropped for the same reason as
 * getAllSeasons: JSON round-tripping would turn them into strings behind a Date
 * type, and no caller reads them. Cleared by revalidateSite().
 */
export const getFranchiseBySlug = cachedQuery(
  ["franchise-by-slug"],
  async (slug: string) => {
    const row = await getFranchiseBySlugUncached(slug);
    if (!row) return null;
    const { createdAt: _c, updatedAt: _u, ...rest } = row;
    return rest;
  },
);
