import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { seasons, franchises, franchiseSeasons } from "../../lib/db/schema";
import { eq } from "drizzle-orm";

function getTestDb() {
  const sql = neon(process.env.POSTGRES_URL!);
  return drizzle(sql);
}

const TEST_PREFIX = "e2e-4-3";
const SEASON_YEAR = 1997;
const FRANCHISE_BRANDED_ID = `${TEST_PREFIX}-branded`;
const FRANCHISE_UNBRANDED_ID = `${TEST_PREFIX}-unbranded`;

export const TEST_DATA = {
  seasonYear: SEASON_YEAR,
  branded: {
    id: FRANCHISE_BRANDED_ID,
    slug: `${TEST_PREFIX}-branded-team`,
    name: "Gradient Heroes",
    abbreviation: "GRD",
    brandingColor: "#2D5A3D",
  },
  unbranded: {
    id: FRANCHISE_UNBRANDED_ID,
    slug: `${TEST_PREFIX}-unbranded-team`,
    name: "Plain Janes",
    abbreviation: "PLN",
    brandingColor: null,
  },
};

export async function seedHeroGradientData(): Promise<number> {
  const db = getTestDb();

  // Clean up any existing test data first
  for (const fId of [FRANCHISE_BRANDED_ID, FRANCHISE_UNBRANDED_ID]) {
    await db.delete(franchiseSeasons).where(eq(franchiseSeasons.franchiseId, fId)).catch(() => {});
    await db.delete(franchises).where(eq(franchises.id, fId)).catch(() => {});
  }
  await db.delete(seasons).where(eq(seasons.seasonYear, SEASON_YEAR)).catch(() => {});

  // Insert franchises
  await db.insert(franchises).values([
    {
      id: TEST_DATA.branded.id,
      slug: TEST_DATA.branded.slug,
      name: TEST_DATA.branded.name,
      abbreviation: TEST_DATA.branded.abbreviation,
      brandingColor: TEST_DATA.branded.brandingColor,
    },
    {
      id: TEST_DATA.unbranded.id,
      slug: TEST_DATA.unbranded.slug,
      name: TEST_DATA.unbranded.name,
      abbreviation: TEST_DATA.unbranded.abbreviation,
      brandingColor: TEST_DATA.unbranded.brandingColor,
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

  // Insert franchise_seasons so the detail page has content
  await db.insert(franchiseSeasons).values([
    {
      franchiseId: TEST_DATA.branded.id,
      seasonId,
      rosterId: `${TEST_PREFIX}-roster-branded`,
      userId: `${TEST_PREFIX}-user-branded`,
      ownerDisplayName: "Gradient Owner",
      wins: 10,
      losses: 4,
      pointsScored: 1850.5,
      standingsFinish: 2,
    },
    {
      franchiseId: TEST_DATA.unbranded.id,
      seasonId,
      rosterId: `${TEST_PREFIX}-roster-unbranded`,
      userId: `${TEST_PREFIX}-user-unbranded`,
      ownerDisplayName: "Plain Owner",
      wins: 6,
      losses: 8,
      pointsScored: 1420.3,
      standingsFinish: 7,
    },
  ]);

  return seasonId;
}

export async function cleanupHeroGradientData(seasonId: number): Promise<void> {
  const db = getTestDb();

  await db.delete(franchiseSeasons).where(eq(franchiseSeasons.seasonId, seasonId)).catch(() => {});
  await db.delete(seasons).where(eq(seasons.id, seasonId)).catch(() => {});

  for (const fId of [FRANCHISE_BRANDED_ID, FRANCHISE_UNBRANDED_ID]) {
    await db.delete(franchises).where(eq(franchises.id, fId)).catch(() => {});
  }
}
