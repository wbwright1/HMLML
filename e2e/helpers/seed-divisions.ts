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

// Three divisions of four (the real league shape). The projection allocates
// one auto-qualifying winner per division plus 3 wildcards = a 6-team field,
// so with 12 teams six are genuinely excluded — a flat top-6-by-record
// implementation would produce a DIFFERENT field, which is what the
// playoff-projection spec asserts against.
export const DIVISIONS = {
  east: { number: 1, name: "Division East" },
  west: { number: 2, name: "Division West" },
  north: { number: 3, name: "Division North" },
};

type FranchiseKey =
  | "a" | "b" | "c" | "d"
  | "e" | "f" | "g" | "h"
  | "i" | "j" | "k" | "l";

interface FranchiseSeed {
  key: FranchiseKey;
  name: string;
  division: number;
  wins: number;
  losses: number;
  pointsScored: number;
}

/**
 * Records are engineered so the DB-backed queries in lib/queries/divisions.ts
 * must run the REAL division-winner-auto-qualify + tiebreak logic to pass:
 *
 *  - Division East's winner (A, 5-5) is the weakest division winner. It still
 *    auto-qualifies, and the projection's "first team out" (H, 7-3) has a
 *    strictly BETTER overall record than A. A flat top-6-by-record field
 *    would put H in and A out, so this scenario distinguishes the real
 *    feature from a deleted one.
 *  - G and H are tied on overall record (both 7-3); G swept H head-to-head
 *    (2-0, seeded below as matchups), so G takes the last wildcard and H is
 *    the first team out — decided by H2H, not record or points.
 *
 * Division standings aggregates (used by the standings-grouping spec):
 *  - East  (A,B,C,D): 5-5 + 4-6 + 3-7 + 2-8 = 14-26
 *  - West  (E,F,G,H): 9-1 + 8-2 + 7-3 + 7-3 = 31-9
 *  - North (I,J,K,L): 9-1 + 8-2 + 4-6 + 1-9 = 22-18
 */
const FRANCHISE_SEEDS: FranchiseSeed[] = [
  // Division East (weak): A is the weakest division winner in the league.
  { key: "a", name: "Division Test Alpha", division: 1, wins: 5, losses: 5, pointsScored: 550 },
  { key: "b", name: "Division Test Bravo", division: 1, wins: 4, losses: 6, pointsScored: 540 },
  { key: "c", name: "Division Test Charlie", division: 1, wins: 3, losses: 7, pointsScored: 530 },
  { key: "d", name: "Division Test Delta", division: 1, wins: 2, losses: 8, pointsScored: 520 },
  // Division West (strong): E wins; F/G are wildcards; H (tied with G) is the
  // first team out via the head-to-head sweep seeded below.
  { key: "e", name: "Division Test Echo", division: 2, wins: 9, losses: 1, pointsScored: 900 },
  { key: "f", name: "Division Test Foxtrot", division: 2, wins: 8, losses: 2, pointsScored: 880 },
  { key: "g", name: "Division Test Golf", division: 2, wins: 7, losses: 3, pointsScored: 870 },
  { key: "h", name: "Division Test Hotel", division: 2, wins: 7, losses: 3, pointsScored: 860 },
  // Division North: I wins; J is a wildcard.
  { key: "i", name: "Division Test India", division: 3, wins: 9, losses: 1, pointsScored: 890 },
  { key: "j", name: "Division Test Juliet", division: 3, wins: 8, losses: 2, pointsScored: 870 },
  { key: "k", name: "Division Test Kilo", division: 3, wins: 4, losses: 6, pointsScored: 500 },
  { key: "l", name: "Division Test Lima", division: 3, wins: 1, losses: 9, pointsScored: 480 },
];

function divisionName(division: number): string {
  if (division === 1) return DIVISIONS.east.name;
  if (division === 2) return DIVISIONS.west.name;
  return DIVISIONS.north.name;
}

export interface DivisionTestFixture {
  seasonYear: number;
  franchises: Record<
    FranchiseKey,
    { id: string; slug: string; name: string; division: number }
  >;
}

/**
 * Builds the id/slug/name set for a given season year. Ids, slugs, AND
 * display names are all suffixed with the season year so the two callers (a
 * historical season and the "latest" season) never collide — even in the
 * rendered text, since both seasons' teams can appear on the same /records
 * page at once (one in the grouped table, one in the projection rail).
 */
export function buildFixture(seasonYear: number): DivisionTestFixture {
  const franchises = {} as DivisionTestFixture["franchises"];
  for (const seed of FRANCHISE_SEEDS) {
    franchises[seed.key] = {
      id: `${TEST_PREFIX}-${seasonYear}-franchise-${seed.key}`,
      slug: `${TEST_PREFIX}-${seasonYear}-team-${seed.key}`,
      name: `${seed.name} ${seasonYear}`,
      division: seed.division,
    };
  }
  return { seasonYear, franchises };
}

/**
 * Seeds a division-aware season for the given year: 3 divisions x 4
 * franchises, with franchise_seasons.division/divisionName set, plus the two
 * matchups needed for G to sweep H head-to-head (the contested-bubble
 * tiebreaker). Returns the season ID for cleanup.
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
      divisionCount: 3,
      divisionNames: {
        "1": DIVISIONS.east.name,
        "2": DIVISIONS.west.name,
        "3": DIVISIONS.north.name,
      },
    })
    .returning({ id: seasons.id });

  const seasonId = season.id;

  await db.insert(franchiseSeasons).values(
    FRANCHISE_SEEDS.map((seed) => ({
      franchiseId: fixture.franchises[seed.key].id,
      seasonId,
      rosterId: `${TEST_PREFIX}-${seasonYear}-roster-${seed.key}`,
      userId: `${TEST_PREFIX}-${seasonYear}-user-${seed.key}`,
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

  const gId = fixture.franchises.g.id;
  const hId = fixture.franchises.h.id;
  const gRoster = `${TEST_PREFIX}-${seasonYear}-roster-g`;
  const hRoster = `${TEST_PREFIX}-${seasonYear}-roster-h`;

  // G sweeps H 2-0 head-to-head (both intra-division). G and H are tied 7-3
  // overall, so this sweep is the ONLY thing that puts G in the field and H
  // on the bubble — a record/points-only tiebreak would order them the other
  // way (H has slightly fewer points, which is the LAST fallback).
  await db.insert(matchups).values([
    {
      seasonId, week: 1, matchupId: 9601,
      franchiseId: gId, rosterId: gRoster, points: 120, isWinner: true, status: "complete",
    },
    {
      seasonId, week: 1, matchupId: 9601,
      franchiseId: hId, rosterId: hRoster, points: 100, isWinner: false, status: "complete",
    },
    {
      seasonId, week: 3, matchupId: 9602,
      franchiseId: gId, rosterId: gRoster, points: 110, isWinner: true, status: "complete",
    },
    {
      seasonId, week: 3, matchupId: 9602,
      franchiseId: hId, rosterId: hRoster, points: 95, isWinner: false, status: "complete",
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
