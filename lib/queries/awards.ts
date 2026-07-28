import { db } from "@/lib/db";
import { leagueAwards, seasons, franchises } from "@/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { getLatestAvatarUrls } from "@/lib/queries/franchise-avatars";
import { AWARD_TYPE_ORDER, type AwardType, isAwardType } from "@/lib/awards";

/**
 * League-award queries swallow "relation does not exist" (Postgres 42P01)
 * silently so pages render before migration 0010 is applied; every other
 * error is logged before returning empty so a query regression is visible
 * in server logs instead of silently emptying the Trophy Case.
 */
function logUnlessMissingTable(context: string, error: unknown): void {
  const code = (error as { code?: string } | null)?.code;
  if (code !== "42P01") {
    console.error(`[queries/awards] ${context} failed:`, error);
  }
}

export interface AwardFranchiseCrest {
  id: string;
  slug: string;
  name: string;
  abbreviation: string | null;
  brandingColor: string | null;
  avatarUrl: string | null;
}

export interface AwardEntry {
  id: number;
  awardType: AwardType;
  seasonYear: number;
  playerId: string | null;
  playerName: string;
  position: string | null;
  franchise: AwardFranchiseCrest | null;
  note: string | null;
}

export interface HonorRollGroup {
  awardType: AwardType;
  awards: AwardEntry[];
}

export interface AwardsHonorRoll {
  groups: HonorRollGroup[];
  /** How many awards each (non-null) playerId holds, for "Nx" repeat chips. */
  awardCountByPlayer: Record<string, number>;
  /** The playerId with the most awards (ties broken by first seen); null when empty. */
  mostDecoratedPlayerId: string | null;
  total: number;
}

interface RawAwardRow {
  id: number;
  awardType: string;
  seasonYear: number;
  playerId: string | null;
  playerName: string;
  position: string | null;
  note: string | null;
  franchiseId: string | null;
  franchiseSlug: string | null;
  franchiseName: string | null;
  franchiseAbbreviation: string | null;
  franchiseBrandingColor: string | null;
}

async function fetchAwardRows(): Promise<RawAwardRow[]> {
  return db
    .select({
      id: leagueAwards.id,
      awardType: leagueAwards.awardType,
      seasonYear: seasons.seasonYear,
      playerId: leagueAwards.playerId,
      playerName: leagueAwards.playerName,
      position: leagueAwards.position,
      note: leagueAwards.note,
      franchiseId: leagueAwards.franchiseId,
      franchiseSlug: franchises.slug,
      franchiseName: franchises.name,
      franchiseAbbreviation: franchises.abbreviation,
      franchiseBrandingColor: franchises.brandingColor,
    })
    .from(leagueAwards)
    .innerJoin(seasons, eq(leagueAwards.seasonId, seasons.id))
    .leftJoin(franchises, eq(leagueAwards.franchiseId, franchises.id))
    .orderBy(desc(seasons.seasonYear));
}

function toEntry(
  row: RawAwardRow,
  avatarUrls: Map<string, string>,
): AwardEntry {
  return {
    id: row.id,
    awardType: row.awardType as AwardType,
    seasonYear: row.seasonYear,
    playerId: row.playerId,
    playerName: row.playerName,
    position: row.position,
    franchise:
      row.franchiseId && row.franchiseSlug && row.franchiseName
        ? {
            id: row.franchiseId,
            slug: row.franchiseSlug,
            name: row.franchiseName,
            abbreviation: row.franchiseAbbreviation,
            brandingColor: row.franchiseBrandingColor,
            avatarUrl: avatarUrls.get(row.franchiseId) ?? null,
          }
        : null,
    note: row.note,
  };
}

/**
 * The full Trophy Case: every league award grouped by type (canonical order),
 * each group season-descending, with franchise crest info. Also computes the
 * per-player award counts (for "Nx" repeat chips) and the single most-decorated
 * player. Returns an empty roll (no throw) when the table is empty OR does not
 * yet exist (pre-migration), so pages never crash.
 */
export async function getAwardsHonorRoll(): Promise<AwardsHonorRoll> {
  try {
    const rows = await fetchAwardRows();
    if (rows.length === 0) {
      return { groups: [], awardCountByPlayer: {}, mostDecoratedPlayerId: null, total: 0 };
    }

    const franchiseIds = [
      ...new Set(rows.map((r) => r.franchiseId).filter((v): v is string => !!v)),
    ];
    const avatarUrls = await getLatestAvatarUrls(franchiseIds);

    const awardCountByPlayer: Record<string, number> = {};
    for (const r of rows) {
      if (r.playerId) {
        awardCountByPlayer[r.playerId] = (awardCountByPlayer[r.playerId] ?? 0) + 1;
      }
    }
    let mostDecoratedPlayerId: string | null = null;
    let mostCount = 1;
    for (const [pid, c] of Object.entries(awardCountByPlayer)) {
      if (c > mostCount) {
        mostCount = c;
        mostDecoratedPlayerId = pid;
      }
    }

    const groups: HonorRollGroup[] = AWARD_TYPE_ORDER.map((awardType) => ({
      awardType,
      awards: rows
        .filter((r) => r.awardType === awardType)
        .map((r) => toEntry(r, avatarUrls)),
    })).filter((g) => g.awards.length > 0);

    return {
      groups,
      awardCountByPlayer,
      mostDecoratedPlayerId,
      total: rows.length,
    };
  } catch (error) {
    // Table may not exist yet (pre-migration) or the DB may be unavailable.
    logUnlessMissingTable("getAwardsHonorRoll", error);
    return { groups: [], awardCountByPlayer: {}, mostDecoratedPlayerId: null, total: 0 };
  }
}

/**
 * Awards held by a single franchise, season-descending. Empty on missing table.
 */
export async function getFranchiseAwards(
  franchiseId: string,
): Promise<AwardEntry[]> {
  try {
    const rows = await db
      .select({
        id: leagueAwards.id,
        awardType: leagueAwards.awardType,
        seasonYear: seasons.seasonYear,
        playerId: leagueAwards.playerId,
        playerName: leagueAwards.playerName,
        position: leagueAwards.position,
        note: leagueAwards.note,
        franchiseId: leagueAwards.franchiseId,
        franchiseSlug: franchises.slug,
        franchiseName: franchises.name,
        franchiseAbbreviation: franchises.abbreviation,
        franchiseBrandingColor: franchises.brandingColor,
      })
      .from(leagueAwards)
      .innerJoin(seasons, eq(leagueAwards.seasonId, seasons.id))
      .leftJoin(franchises, eq(leagueAwards.franchiseId, franchises.id))
      .where(eq(leagueAwards.franchiseId, franchiseId))
      .orderBy(desc(seasons.seasonYear));

    return rows.map((r) => toEntry(r as RawAwardRow, new Map()));
  } catch (error) {
    logUnlessMissingTable("awards query", error);
    return [];
  }
}

/**
 * Awards for a single season (the reigning honors), in canonical award order.
 * Empty on missing table.
 */
export async function getSeasonAwards(seasonId: number): Promise<AwardEntry[]> {
  try {
    const rows = await db
      .select({
        id: leagueAwards.id,
        awardType: leagueAwards.awardType,
        seasonYear: seasons.seasonYear,
        playerId: leagueAwards.playerId,
        playerName: leagueAwards.playerName,
        position: leagueAwards.position,
        note: leagueAwards.note,
        franchiseId: leagueAwards.franchiseId,
        franchiseSlug: franchises.slug,
        franchiseName: franchises.name,
        franchiseAbbreviation: franchises.abbreviation,
        franchiseBrandingColor: franchises.brandingColor,
      })
      .from(leagueAwards)
      .innerJoin(seasons, eq(leagueAwards.seasonId, seasons.id))
      .leftJoin(franchises, eq(leagueAwards.franchiseId, franchises.id))
      .where(eq(leagueAwards.seasonId, seasonId));

    const franchiseIds = [
      ...new Set(rows.map((r) => r.franchiseId).filter((v): v is string => !!v)),
    ];
    const avatarUrls = await getLatestAvatarUrls(franchiseIds);

    const order = new Map(AWARD_TYPE_ORDER.map((t, i) => [t as string, i]));
    return rows
      .map((r) => toEntry(r as RawAwardRow, avatarUrls))
      .sort(
        (a, b) =>
          (order.get(a.awardType) ?? 99) - (order.get(b.awardType) ?? 99),
      );
  } catch (error) {
    logUnlessMissingTable("awards query", error);
    return [];
  }
}

/**
 * Every league award held by a single player, season-descending, with franchise
 * crest info (and avatar). Uses the same row shape/toEntry mapping as the Trophy
 * Case. Empty on missing table / error. Powers the player-profile award rail.
 */
export async function getAwardsForPlayer(
  playerId: string,
): Promise<AwardEntry[]> {
  try {
    const rows = await db
      .select({
        id: leagueAwards.id,
        awardType: leagueAwards.awardType,
        seasonYear: seasons.seasonYear,
        playerId: leagueAwards.playerId,
        playerName: leagueAwards.playerName,
        position: leagueAwards.position,
        note: leagueAwards.note,
        franchiseId: leagueAwards.franchiseId,
        franchiseSlug: franchises.slug,
        franchiseName: franchises.name,
        franchiseAbbreviation: franchises.abbreviation,
        franchiseBrandingColor: franchises.brandingColor,
      })
      .from(leagueAwards)
      .innerJoin(seasons, eq(leagueAwards.seasonId, seasons.id))
      .leftJoin(franchises, eq(leagueAwards.franchiseId, franchises.id))
      .where(eq(leagueAwards.playerId, playerId))
      .orderBy(desc(seasons.seasonYear));

    const franchiseIds = [
      ...new Set(rows.map((r) => r.franchiseId).filter((v): v is string => !!v)),
    ];
    const avatarUrls = await getLatestAvatarUrls(franchiseIds);

    return rows.map((r) => toEntry(r as RawAwardRow, avatarUrls));
  } catch (error) {
    logUnlessMissingTable("getAwardsForPlayer", error);
    return [];
  }
}

export interface PlayerAwardBadge {
  awardType: AwardType;
  seasonYear: number;
}

/**
 * Award badges keyed by playerId, for the given visible player ids. Returns a
 * Map (empty when none / table missing). Each player's badges are ordered
 * season-descending. Only awards with a non-null playerId are included.
 */
export async function getAwardsByPlayerIds(
  playerIds: string[],
): Promise<Map<string, PlayerAwardBadge[]>> {
  const result = new Map<string, PlayerAwardBadge[]>();
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (ids.length === 0) return result;

  try {
    const rows = await db
      .select({
        playerId: leagueAwards.playerId,
        awardType: leagueAwards.awardType,
        seasonYear: seasons.seasonYear,
      })
      .from(leagueAwards)
      .innerJoin(seasons, eq(leagueAwards.seasonId, seasons.id))
      .where(inArray(leagueAwards.playerId, ids))
      .orderBy(desc(seasons.seasonYear));

    for (const r of rows) {
      if (!r.playerId || !isAwardType(r.awardType)) continue;
      const list = result.get(r.playerId) ?? [];
      list.push({ awardType: r.awardType, seasonYear: r.seasonYear });
      result.set(r.playerId, list);
    }
    return result;
  } catch (error) {
    logUnlessMissingTable("getAwardsByPlayerIds", error);
    return result;
  }
}
