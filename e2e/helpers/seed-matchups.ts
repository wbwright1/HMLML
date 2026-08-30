import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { seasons, franchises, matchups, franchiseSeasons } from "../../lib/db/schema";
import { eq } from "drizzle-orm";

function getTestDb() {
  const sql = neon(process.env.POSTGRES_URL!);
  return drizzle(sql);
}

// Test-specific IDs to avoid collisions with real data
const TEST_PREFIX = "e2e-4-1";
const SEASON_YEAR = 1999; // unlikely to collide with real data
const FRANCHISE_A_ID = `${TEST_PREFIX}-franchise-a`;
const FRANCHISE_B_ID = `${TEST_PREFIX}-franchise-b`;
const FRANCHISE_C_ID = `${TEST_PREFIX}-franchise-c`;
const FRANCHISE_D_ID = `${TEST_PREFIX}-franchise-d`;

export const TEST_DATA = {
  seasonYear: SEASON_YEAR,
  week: 1,
  // Extra weeks seeded alongside week 1 so schedule views can exercise
  // completed / in-progress / scheduled (upcoming) status distinctions.
  weekInProgress: 2,
  weekScheduled: 3,
  franchiseA: {
    id: FRANCHISE_A_ID,
    slug: `${TEST_PREFIX}-team-alpha`,
    name: "Team Alpha",
    abbreviation: "ALP",
    brandingColor: "#2D5A3D", // green
  },
  franchiseB: {
    id: FRANCHISE_B_ID,
    slug: `${TEST_PREFIX}-team-bravo`,
    name: "Team Bravo",
    abbreviation: "BRV",
    brandingColor: "#B8860B", // gold
  },
  franchiseC: {
    id: FRANCHISE_C_ID,
    slug: `${TEST_PREFIX}-team-charlie`,
    name: "Team Charlie",
    abbreviation: "CHL",
    brandingColor: null, // no branding color, should fallback
  },
  franchiseD: {
    id: FRANCHISE_D_ID,
    slug: `${TEST_PREFIX}-team-delta`,
    name: "Team Delta",
    abbreviation: "DLT",
    brandingColor: "#C45D3E", // rust
  },
};

/**
 * Seeds test franchises, a season, franchise_seasons, and matchups.
 * Returns the season ID for cleanup.
 */
export async function seedMatchupData(): Promise<number> {
  const db = getTestDb();

  // Insert franchises (upsert-like: delete first if they exist)
  for (const f of [TEST_DATA.franchiseA, TEST_DATA.franchiseB, TEST_DATA.franchiseC, TEST_DATA.franchiseD]) {
    await db.delete(franchises).where(eq(franchises.id, f.id)).catch(() => {});
  }

  await db.insert(franchises).values([
    {
      id: TEST_DATA.franchiseA.id,
      slug: TEST_DATA.franchiseA.slug,
      name: TEST_DATA.franchiseA.name,
      abbreviation: TEST_DATA.franchiseA.abbreviation,
      brandingColor: TEST_DATA.franchiseA.brandingColor,
    },
    {
      id: TEST_DATA.franchiseB.id,
      slug: TEST_DATA.franchiseB.slug,
      name: TEST_DATA.franchiseB.name,
      abbreviation: TEST_DATA.franchiseB.abbreviation,
      brandingColor: TEST_DATA.franchiseB.brandingColor,
    },
    {
      id: TEST_DATA.franchiseC.id,
      slug: TEST_DATA.franchiseC.slug,
      name: TEST_DATA.franchiseC.name,
      abbreviation: TEST_DATA.franchiseC.abbreviation,
      brandingColor: TEST_DATA.franchiseC.brandingColor,
    },
    {
      id: TEST_DATA.franchiseD.id,
      slug: TEST_DATA.franchiseD.slug,
      name: TEST_DATA.franchiseD.name,
      abbreviation: TEST_DATA.franchiseD.abbreviation,
      brandingColor: TEST_DATA.franchiseD.brandingColor,
    },
  ]);

  // Insert season
  const [season] = await db
    .insert(seasons)
    .values({
      seasonYear: SEASON_YEAR,
      leagueId: `${TEST_PREFIX}-league`,
      status: "complete",
    })
    .returning({ id: seasons.id });

  const seasonId = season.id;

  // Insert franchise_seasons (needed for the join)
  await db.insert(franchiseSeasons).values([
    {
      franchiseId: TEST_DATA.franchiseA.id,
      seasonId,
      rosterId: `${TEST_PREFIX}-roster-a`,
      userId: `${TEST_PREFIX}-user-a`,
      ownerDisplayName: "Owner A",
    },
    {
      franchiseId: TEST_DATA.franchiseB.id,
      seasonId,
      rosterId: `${TEST_PREFIX}-roster-b`,
      userId: `${TEST_PREFIX}-user-b`,
      ownerDisplayName: "Owner B",
    },
    {
      franchiseId: TEST_DATA.franchiseC.id,
      seasonId,
      rosterId: `${TEST_PREFIX}-roster-c`,
      userId: `${TEST_PREFIX}-user-c`,
      ownerDisplayName: "Owner C",
    },
    {
      franchiseId: TEST_DATA.franchiseD.id,
      seasonId,
      rosterId: `${TEST_PREFIX}-roster-d`,
      userId: `${TEST_PREFIX}-user-d`,
      ownerDisplayName: "Owner D",
    },
  ]);

  // Insert matchups: matchup 1 (A vs B), matchup 2 (C vs D)
  await db.insert(matchups).values([
    // Matchup 1: Team Alpha (home) vs Team Bravo (away)
    {
      seasonId,
      week: 1,
      matchupId: 901,
      franchiseId: TEST_DATA.franchiseA.id,
      rosterId: `${TEST_PREFIX}-roster-a`,
      points: 120.5,
      isWinner: true,
      status: "complete",
    },
    {
      seasonId,
      week: 1,
      matchupId: 901,
      franchiseId: TEST_DATA.franchiseB.id,
      rosterId: `${TEST_PREFIX}-roster-b`,
      points: 98.3,
      isWinner: false,
      status: "complete",
    },
    // Matchup 2: Team Charlie (home, no branding color) vs Team Delta (away)
    {
      seasonId,
      week: 1,
      matchupId: 902,
      franchiseId: TEST_DATA.franchiseC.id,
      rosterId: `${TEST_PREFIX}-roster-c`,
      points: 105.2,
      isWinner: false,
      status: "complete",
    },
    {
      seasonId,
      week: 1,
      matchupId: 902,
      franchiseId: TEST_DATA.franchiseD.id,
      rosterId: `${TEST_PREFIX}-roster-d`,
      points: 110.7,
      isWinner: true,
      status: "complete",
    },

    // Week 2, matchup 911: Team Alpha vs Team Charlie, in progress (points
    // posted, no winner determined yet).
    {
      seasonId,
      week: TEST_DATA.weekInProgress,
      matchupId: 911,
      franchiseId: TEST_DATA.franchiseA.id,
      rosterId: `${TEST_PREFIX}-roster-a`,
      points: 42.1,
      isWinner: null,
      status: "in_progress",
    },
    {
      seasonId,
      week: TEST_DATA.weekInProgress,
      matchupId: 911,
      franchiseId: TEST_DATA.franchiseC.id,
      rosterId: `${TEST_PREFIX}-roster-c`,
      points: 38.6,
      isWinner: null,
      status: "in_progress",
    },

    // Week 3, matchup 921: Team Bravo vs Team Delta, scheduled (not yet
    // played; Sleeper has paired them but points are still 0).
    {
      seasonId,
      week: TEST_DATA.weekScheduled,
      matchupId: 921,
      franchiseId: TEST_DATA.franchiseB.id,
      rosterId: `${TEST_PREFIX}-roster-b`,
      points: 0,
      isWinner: null,
      status: "scheduled",
    },
    {
      seasonId,
      week: TEST_DATA.weekScheduled,
      matchupId: 921,
      franchiseId: TEST_DATA.franchiseD.id,
      rosterId: `${TEST_PREFIX}-roster-d`,
      points: 0,
      isWinner: null,
      status: "scheduled",
    },
  ]);

  return seasonId;
}

/**
 * Cleans up all test data seeded by seedMatchupData.
 */
export async function cleanupMatchupData(seasonId: number): Promise<void> {
  const db = getTestDb();

  // Delete in order respecting foreign keys
  await db.delete(matchups).where(eq(matchups.seasonId, seasonId)).catch(() => {});
  await db.delete(franchiseSeasons).where(eq(franchiseSeasons.seasonId, seasonId)).catch(() => {});
  await db.delete(seasons).where(eq(seasons.id, seasonId)).catch(() => {});

  for (const fId of [FRANCHISE_A_ID, FRANCHISE_B_ID, FRANCHISE_C_ID, FRANCHISE_D_ID]) {
    await db.delete(franchises).where(eq(franchises.id, fId)).catch(() => {});
  }
}
