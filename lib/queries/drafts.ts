import { db } from "@/lib/db";
import {
  draftPicks,
  seasons,
  franchises,
  franchiseSeasons,
  players,
} from "@/lib/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DraftPickWithFranchise {
  id: number;
  seasonId: number;
  draftId: string;
  draftType: string;
  round: number;
  pickNumber: number;
  rosterId: string | null;
  franchiseId: string | null;
  playerId: string | null;
  playerName: string | null;
  playerPosition: string | null;
  isLegacyEra: boolean | null;
  franchiseName: string | null;
  franchiseSlug: string | null;
  franchiseAbbreviation: string | null;
  franchiseBrandingColor: string | null;
  originalFranchiseId: string | null;
  originalFranchiseName: string | null;
}

export interface DraftSummary {
  seasonYear: number;
  seasonId: number;
  draftId: string;
  draftType: string;
  isLegacyEra: boolean;
  pickCount: number;
}

// ---------------------------------------------------------------------------
// getDraftsByYear — all drafts grouped by season year
// ---------------------------------------------------------------------------

export async function getDraftsByYear(): Promise<DraftSummary[]> {
  try {
    // Get all draft picks joined with seasons, ordered by season year desc
    const rows = await db
      .select({
        seasonYear: seasons.seasonYear,
        seasonId: draftPicks.seasonId,
        draftId: draftPicks.draftId,
        draftType: draftPicks.draftType,
        isLegacyEra: draftPicks.isLegacyEra,
      })
      .from(draftPicks)
      .innerJoin(seasons, eq(draftPicks.seasonId, seasons.id))
      .orderBy(desc(seasons.seasonYear));

    // Group by draftId to produce one summary per draft
    const draftMap = new Map<
      string,
      { seasonYear: number; seasonId: number; draftType: string; isLegacyEra: boolean; count: number }
    >();

    for (const row of rows) {
      if (!draftMap.has(row.draftId)) {
        draftMap.set(row.draftId, {
          seasonYear: row.seasonYear,
          seasonId: row.seasonId,
          draftType: row.draftType,
          isLegacyEra: row.isLegacyEra ?? false,
          count: 0,
        });
      }
      draftMap.get(row.draftId)!.count++;
    }

    const summaries: DraftSummary[] = [];
    for (const [draftId, info] of draftMap) {
      summaries.push({
        seasonYear: info.seasonYear,
        seasonId: info.seasonId,
        draftId,
        draftType: info.draftType,
        isLegacyEra: info.isLegacyEra,
        pickCount: info.count,
      });
    }

    // Sort by season year descending, then startup before rookie
    summaries.sort((a, b) => {
      if (a.seasonYear !== b.seasonYear) return b.seasonYear - a.seasonYear;
      if (a.draftType === "startup" && b.draftType !== "startup") return -1;
      if (b.draftType === "startup" && a.draftType !== "startup") return 1;
      return 0;
    });

    return summaries;
  } catch (e) {
    console.error("[drafts] getDraftsByYear error:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// getDraftBySeasonYear — full draft with all picks for a season
// ---------------------------------------------------------------------------

export async function getDraftBySeasonYear(
  year: number
): Promise<{
  seasonYear: number;
  drafts: { draftId: string; draftType: string; isLegacyEra: boolean; picks: DraftPickWithFranchise[] }[];
} | null> {
  try {
    // Get the season record
    const [season] = await db
      .select({ id: seasons.id, seasonYear: seasons.seasonYear })
      .from(seasons)
      .where(eq(seasons.seasonYear, year))
      .limit(1);

    if (!season) return null;

    // Get all picks for this season, joined with franchise and player info
    const originalFranchises = alias(franchises, "originalFranchises");
    const rows = await db
      .select({
        id: draftPicks.id,
        seasonId: draftPicks.seasonId,
        draftId: draftPicks.draftId,
        draftType: draftPicks.draftType,
        round: draftPicks.round,
        pickNumber: draftPicks.pickNumber,
        rosterId: draftPicks.rosterId,
        franchiseId: draftPicks.franchiseId,
        playerId: draftPicks.playerId,
        playerName: draftPicks.playerName,
        playerPosition: players.position,
        isLegacyEra: draftPicks.isLegacyEra,
        franchiseName: franchises.name,
        franchiseSlug: franchises.slug,
        franchiseAbbreviation: franchises.abbreviation,
        franchiseBrandingColor: franchises.brandingColor,
        originalFranchiseId: draftPicks.originalFranchiseId,
        originalFranchiseName: originalFranchises.name,
      })
      .from(draftPicks)
      .leftJoin(franchises, eq(draftPicks.franchiseId, franchises.id))
      .leftJoin(originalFranchises, eq(draftPicks.originalFranchiseId, originalFranchises.id))
      .leftJoin(players, eq(draftPicks.playerId, players.id))
      .where(eq(draftPicks.seasonId, season.id))
      .orderBy(asc(draftPicks.pickNumber));

    if (rows.length === 0) return null;

    // Group by draftId
    const draftMap = new Map<
      string,
      { draftType: string; isLegacyEra: boolean; picks: DraftPickWithFranchise[] }
    >();

    for (const row of rows) {
      if (!draftMap.has(row.draftId)) {
        draftMap.set(row.draftId, {
          draftType: row.draftType,
          isLegacyEra: row.isLegacyEra ?? false,
          picks: [],
        });
      }
      draftMap.get(row.draftId)!.picks.push(row);
    }

    const drafts = Array.from(draftMap.entries()).map(([draftId, info]) => ({
      draftId,
      draftType: info.draftType,
      isLegacyEra: info.isLegacyEra,
      picks: info.picks,
    }));

    // Sort startup before rookie
    drafts.sort((a, b) => {
      if (a.draftType === "startup" && b.draftType !== "startup") return -1;
      if (b.draftType === "startup" && a.draftType !== "startup") return 1;
      return 0;
    });

    return { seasonYear: year, drafts };
  } catch (e) {
    console.error("[drafts] getDraftBySeasonYear error:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// getFranchiseDraftHistory — all draft picks for a franchise across all years
// ---------------------------------------------------------------------------

export async function getFranchiseDraftHistory(
  franchiseId: string
): Promise<
  {
    seasonYear: number;
    draftId: string;
    draftType: string;
    isLegacyEra: boolean;
    picks: DraftPickWithFranchise[];
  }[]
> {
  try {
    const originalFranchises = alias(franchises, "originalFranchises");
    const rows = await db
      .select({
        id: draftPicks.id,
        seasonId: draftPicks.seasonId,
        draftId: draftPicks.draftId,
        draftType: draftPicks.draftType,
        round: draftPicks.round,
        pickNumber: draftPicks.pickNumber,
        rosterId: draftPicks.rosterId,
        franchiseId: draftPicks.franchiseId,
        playerId: draftPicks.playerId,
        playerName: draftPicks.playerName,
        playerPosition: players.position,
        isLegacyEra: draftPicks.isLegacyEra,
        franchiseName: franchises.name,
        franchiseSlug: franchises.slug,
        franchiseAbbreviation: franchises.abbreviation,
        franchiseBrandingColor: franchises.brandingColor,
        originalFranchiseId: draftPicks.originalFranchiseId,
        originalFranchiseName: originalFranchises.name,
        seasonYear: seasons.seasonYear,
      })
      .from(draftPicks)
      .leftJoin(franchises, eq(draftPicks.franchiseId, franchises.id))
      .leftJoin(originalFranchises, eq(draftPicks.originalFranchiseId, originalFranchises.id))
      .leftJoin(players, eq(draftPicks.playerId, players.id))
      .innerJoin(seasons, eq(draftPicks.seasonId, seasons.id))
      .where(eq(draftPicks.franchiseId, franchiseId))
      .orderBy(desc(seasons.seasonYear), asc(draftPicks.pickNumber));

    // Group by draftId, preserving seasonYear
    const draftMap = new Map<
      string,
      {
        seasonYear: number;
        draftType: string;
        isLegacyEra: boolean;
        picks: DraftPickWithFranchise[];
      }
    >();

    for (const row of rows) {
      if (!draftMap.has(row.draftId)) {
        draftMap.set(row.draftId, {
          seasonYear: row.seasonYear,
          draftType: row.draftType,
          isLegacyEra: row.isLegacyEra ?? false,
          picks: [],
        });
      }
      draftMap.get(row.draftId)!.picks.push(row);
    }

    const result = Array.from(draftMap.entries()).map(([draftId, info]) => ({
      draftId,
      ...info,
    }));

    // Sort by season year descending, startup before rookie within same year
    result.sort((a, b) => {
      if (a.seasonYear !== b.seasonYear) return b.seasonYear - a.seasonYear;
      if (a.draftType === "startup" && b.draftType !== "startup") return -1;
      if (b.draftType === "startup" && a.draftType !== "startup") return 1;
      return 0;
    });

    return result;
  } catch (e) {
    console.error("[drafts] getFranchiseDraftHistory error:", e);
    return [];
  }
}
