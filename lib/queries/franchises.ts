import { db } from "@/lib/db";
import {
  franchises,
  franchiseSeasons,
  seasons,
  rosterPlayers,
  players,
} from "@/lib/db/schema";
import { eq, desc, and, count, sum, sql } from "drizzle-orm";

/**
 * Returns all franchises with aggregate career stats:
 * total championships, wins, losses, and points scored.
 * Also fetches the current owner from the most recent season.
 */
export async function getAllFranchises() {
  try {
    const rows = await db
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
    const ownerRows = await db.execute(sql`
      SELECT DISTINCT ON (fs.franchise_id)
        fs.franchise_id,
        fs.owner_display_name,
        fs.co_owner_display_name
      FROM franchise_seasons fs
      INNER JOIN seasons s ON fs.season_id = s.id
      WHERE fs.owner_display_name IS NOT NULL
      ORDER BY fs.franchise_id, s.season_year DESC
    `);

    const ownerMap = new Map<string, { owner: string; coOwner?: string }>();
    for (const row of ownerRows.rows as Array<Record<string, unknown>>) {
      ownerMap.set(row.franchise_id as string, {
        owner: row.owner_display_name as string,
        coOwner: (row.co_owner_display_name as string) ?? undefined,
      });
    }

    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      abbreviation: r.abbreviation ?? undefined,
      brandingColor: r.brandingColor ?? undefined,
      ownerName: ownerMap.get(r.id)?.owner,
      coOwnerName: ownerMap.get(r.id)?.coOwner,
      totalWins: Number(r.totalWins ?? 0),
      totalLosses: Number(r.totalLosses ?? 0),
      totalPointsScored: Number(r.totalPointsScored ?? 0),
      championships: r.championships,
    }));
  } catch {
    return null;
  }
}

/**
 * Returns a single franchise by slug, together with all of its
 * franchise_seasons rows joined with season info, ordered newest-first.
 */
export async function getFranchiseBySlug(slug: string) {
  try {
    const [franchise] = await db
      .select()
      .from(franchises)
      .where(eq(franchises.slug, slug))
      .limit(1);

    if (!franchise) return null;

    const seasonHistory = await db
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
      .orderBy(desc(seasons.seasonYear));

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
      seasonHistory,
      totalWins,
      totalLosses,
      totalPointsScored,
      championships,
    };
  } catch {
    return null;
  }
}

/**
 * Returns roster_players for a franchise/season, joined with player info.
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
      })
      .from(rosterPlayers)
      .innerJoin(players, eq(rosterPlayers.playerId, players.id))
      .where(
        and(
          eq(rosterPlayers.franchiseId, franchiseId),
          eq(rosterPlayers.seasonId, seasonId)
        )
      )
      .orderBy(players.position, players.lastName);

    return roster;
  } catch {
    return null;
  }
}
