import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { seasons, franchises, franchiseSeasons, matchups } from "../../lib/db/schema";
import { eq } from "drizzle-orm";

function getTestDb() {
  const sql = neon(process.env.POSTGRES_URL!);
  return drizzle(sql);
}

// Test-specific IDs to avoid collisions with real data and other e2e helpers
// (seed-hero-gradient uses 1997, seed-player-week-points uses 1998,
// seed-matchups uses 1999). Franchise ids are suffixed by season year so the
// two callers below (a historical season and a "latest" season) never touch
// the same rows even when their specs run in parallel.
const TEST_PREFIX = "e2e-div";

// Historical (non-latest) season: used by the records-page grouping spec,
// which selects a specific season year via the season picker regardless of
// which season is "current".
export const SEASON_YEAR = 1996;

// Far-future season: used by the playoff-projection spec, which needs this
// seeded season to be the DB's *latest* season (by seasonYear DESC) so the
// homepage/records "current season" projection queries pick it up for real.
export const LATEST_SEASON_YEAR = 2099;

export const DIVISIONS = {
  east: { number: 1, name: "Division East" },
  west: { number: 2, name: "Division West" },
};

interface FranchiseSeed {
  key: "a" | "b" | "c" | "d" | "e" | "f";
  name: string;
  division: number;
  wins: number;
  losses: number;
  pointsScored: number;
}

/**
 * Two divisions of three franchises each, engineered so the DB-backed
 * queries in lib/queries/divisions.ts have to run the real grouping and
 * tiebreak logic to pass:
 *
 *  - Division East's winner (A, 5-3) has a WORSE overall record than
 *    Division West's non-winner (E, 6-2) — E must still not bump A from the
 *    field; both must qualify (A as a division winner, E as a wildcard).
 *  - B (East, 4-4) and F (West, 4-4) are tied on overall record; B swept F
 *    head-to-head (2-0), so B must out-seed F for the contested wildcard
 *    spot on the bubble.
 */
const FRANCHISE_SEEDS: FranchiseSeed[] = [
  { key: "a", name: "Division Test Alpha", division: 1, wins: 5, losses: 3, pointsScored: 900 },
  { key: "b", name: "Division Test Bravo", division: 1, wins: 4, losses: 4, pointsScored: 850 },
  { key: "c", name: "Division Test Charlie", division: 1, wins: 2, losses: 6, pointsScored: 700 },
  { key: "d", name: "Division Test Delta", division: 2, wins: 7, losses: 1, pointsScored: 1000 },
  { key: "e", name: "Division Test Echo", division: 2, wins: 6, losses: 2, pointsScored: 950 },
  // More PF than B, but loses the H2H tiebreak below.
  { key: "f", name: "Division Test Foxtrot", division: 2, wins: 4, losses: 4, pointsScored: 1200 },
];

function divisionName(division: number): string {
  return division === 1 ? DIVISIONS.east.name : DIVISIONS.west.name;
}

export interface DivisionTestFixture {
  seasonYear: number;
  franchises: Record<
    FranchiseSeed["key"],
    { id: string; slug: string; name: string; division: number }
  >;
}

/** Builds the id/slug set for a given season year (keeps parallel specs isolated). */
export function buildFixture(seasonYear: number): DivisionTestFixture {
  const franchises = {} as DivisionTestFixture["franchises"];
  for (const seed of FRANCHISE_SEEDS) {
    franchises[seed.key] = {
      id: `${TEST_PREFIX}-${seasonYear}-franchise-${seed.key}`,
      slug: `${TEST_PREFIX}-${seasonYear}-team-${seed.key}`,
      name: seed.name,
      division: seed.division,
    };
  }
  return { seasonYear, franchises };
}

/**
 * Seeds a division-aware season for the given year: 2 divisions x 3
 * franchises, with franchise_seasons.division/divisionName set, plus the
 * specific matchups needed to produce a decisive head-to-head between B and
 * F (the bubble tiebreaker case). Returns the season ID for cleanup.
 */
export async function seedDivisionData(seasonYear: number): Promise<number> {
  const db = getTestDb();
  const fixture = buildFixture(seasonYear);

  for (const f of Object.values(fixture.franchises)) {
    await db.delete(franchises).where(eq(franchises.id, f.id)).catch(() => {});
  }
  await db.delete(seasons).where(eq(seasons.seasonYear, seasonYear)).catch(() => {});

  await db.insert(franchises).values(
    Object.values(fixture.franchises).map((f) => ({
      id: f.id,
      slug: f.slug,
      name: f.name,
    })),
  );

  const [season] = await db
    .insert(seasons)
    .values({
      seasonYear,
      leagueId: `${TEST_PREFIX}-league-${seasonYear}`,
      status: "in_season",
      divisionCount: 2,
      divisionNames: {
        "1": DIVISIONS.east.name,
        "2": DIVISIONS.west.name,
      },
    })
    .returning({ id: seasons.id });

  const seasonId = season.id;

  await db.insert(franchiseSeasons).values(
    FRANCHISE_SEEDS.map((seed, i) => ({
      franchiseId: fixture.franchises[seed.key].id,
      seasonId,
      rosterId: `${TEST_PREFIX}-${seasonYear}-roster-${i}`,
      userId: `${TEST_PREFIX}-${seasonYear}-user-${i}`,
      ownerDisplayName: `Owner ${seed.name}`,
      division: seed.division,
      divisionName: divisionName(seed.division),
      wins: seed.wins,
      losses: seed.losses,
      ties: 0,
      pointsScored: seed.pointsScored,
      pointsAgainst: 0,
    })),
  );

  const bId = fixture.franchises.b.id;
  const fId = fixture.franchises.f.id;
  const bRoster = `${TEST_PREFIX}-${seasonYear}-roster-1`;
  const fRoster = `${TEST_PREFIX}-${seasonYear}-roster-5`;

  // The only matchups that matter for the tiebreak tests: B sweeps F 2-0
  // head-to-head despite the two being tied on overall record.
  await db.insert(matchups).values([
    {
      seasonId,
      week: 1,
      matchupId: 9601,
      franchiseId: bId,
      rosterId: bRoster,
      points: 120,
      isWinner: true,
      status: "complete",
    },
    {
      seasonId,
      week: 1,
      matchupId: 9601,
      franchiseId: fId,
      rosterId: fRoster,
      points: 100,
      isWinner: false,
      status: "complete",
    },
    {
      seasonId,
      week: 3,
      matchupId: 9602,
      franchiseId: bId,
      rosterId: bRoster,
      points: 110,
      isWinner: true,
      status: "complete",
    },
    {
      seasonId,
      week: 3,
      matchupId: 9602,
      franchiseId: fId,
      rosterId: fRoster,
      points: 95,
      isWinner: false,
      status: "complete",
    },
  ]);

  return seasonId;
}

/**
 * Cleans up all division test data seeded by seedDivisionData for a given
 * season year.
 */
export async function cleanupDivisionData(seasonId: number, seasonYear: number): Promise<void> {
  const db = getTestDb();
  const fixture = buildFixture(seasonYear);

  await db.delete(matchups).where(eq(matchups.seasonId, seasonId)).catch(() => {});
  await db.delete(franchiseSeasons).where(eq(franchiseSeasons.seasonId, seasonId)).catch(() => {});
  await db.delete(seasons).where(eq(seasons.id, seasonId)).catch(() => {});

  for (const f of Object.values(fixture.franchises)) {
    await db.delete(franchises).where(eq(franchises.id, f.id)).catch(() => {});
  }
}
