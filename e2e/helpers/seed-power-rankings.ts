import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import {
  seasons,
  franchises,
  franchiseSeasons,
  matchups,
  players,
  rosterPlayers,
} from "../../lib/db/schema";
import { eq } from "drizzle-orm";

function getTestDb() {
  const sql = neon(process.env.POSTGRES_URL!);
  return drizzle(sql);
}

// Test-specific IDs, isolated from other helpers. The power-rankings model
// only operates on the *latest* season, so this seed uses a deliberately
// far-future season year to guarantee it is picked up as "latest" for the
// duration of the test; cleanupPowerRankingsData removes it afterward.
const TEST_PREFIX = "e2e-13-pr";
const SEASON_YEAR = 2999;
const WINDOW_WEEKS = [5, 6, 7, 8];

const FRANCHISE_LEADER_ID = `${TEST_PREFIX}-franchise-leader`; // best season record, cold recent form
const FRANCHISE_RISER_ID = `${TEST_PREFIX}-franchise-riser`; // worse season record, hot recent form

const ROSTER_LEADER_ID = `${TEST_PREFIX}-roster-leader`;
const ROSTER_RISER_ID = `${TEST_PREFIX}-roster-riser`;

const PLAYER_LEADER_OUT_1 = `${TEST_PREFIX}-player-leader-out-1`;
const PLAYER_LEADER_OUT_2 = `${TEST_PREFIX}-player-leader-out-2`;

export const TEST_DATA = {
  seasonYear: SEASON_YEAR,
  leader: {
    id: FRANCHISE_LEADER_ID,
    slug: `${TEST_PREFIX}-team-leader`,
    name: "Standings Leader",
    abbreviation: "LDR",
  },
  riser: {
    id: FRANCHISE_RISER_ID,
    slug: `${TEST_PREFIX}-team-riser`,
    name: "Form Riser",
    abbreviation: "RIS",
  },
};

/**
 * Seeds a throwaway "latest" season where the season-standings leader (best
 * wins/points) is cold over the last 4 weeks and banged up, while a
 * lower-standings franchise is red-hot and healthy over the same window.
 * Recent-form power rankings should rank the riser above the leader, and the
 * standings-based rank (used elsewhere) should still favor the leader.
 * Returns the season ID for cleanup.
 */
export async function seedPowerRankingsData(): Promise<number> {
  const db = getTestDb();

  for (const id of [FRANCHISE_LEADER_ID, FRANCHISE_RISER_ID]) {
    await db.delete(franchises).where(eq(franchises.id, id)).catch(() => {});
  }
  for (const id of [PLAYER_LEADER_OUT_1, PLAYER_LEADER_OUT_2]) {
    await db.delete(players).where(eq(players.id, id)).catch(() => {});
  }

  await db.insert(franchises).values([
    {
      id: TEST_DATA.leader.id,
      slug: TEST_DATA.leader.slug,
      name: TEST_DATA.leader.name,
      abbreviation: TEST_DATA.leader.abbreviation,
      brandingColor: "#C97C6A",
    },
    {
      id: TEST_DATA.riser.id,
      slug: TEST_DATA.riser.slug,
      name: TEST_DATA.riser.name,
      abbreviation: TEST_DATA.riser.abbreviation,
      brandingColor: "#8FBF7F",
    },
  ]);

  const [season] = await db
    .insert(seasons)
    .values({
      seasonYear: SEASON_YEAR,
      leagueId: `${TEST_PREFIX}-league`,
      status: "in_season",
    })
    .returning({ id: seasons.id });

  const seasonId = season.id;

  // Season-long standings: leader has the better record and more points, so
  // it ranks #1 in standings despite its recent cold streak.
  await db.insert(franchiseSeasons).values([
    {
      franchiseId: TEST_DATA.leader.id,
      seasonId,
      rosterId: ROSTER_LEADER_ID,
      userId: `${TEST_PREFIX}-user-leader`,
      ownerDisplayName: "Leader Owner",
      wins: 10,
      losses: 2,
      ties: 0,
      pointsScored: 1500,
      pointsAgainst: 1200,
    },
    {
      franchiseId: TEST_DATA.riser.id,
      seasonId,
      rosterId: ROSTER_RISER_ID,
      userId: `${TEST_PREFIX}-user-riser`,
      ownerDisplayName: "Riser Owner",
      wins: 4,
      losses: 8,
      ties: 0,
      pointsScored: 900,
      pointsAgainst: 1300,
    },
  ]);

  // Last 4 weeks: leader loses every week with low scores; riser wins every
  // week with high scores. Both sides share a matchupId per week.
  const matchupRows = WINDOW_WEEKS.flatMap((week) => [
    {
      seasonId,
      week,
      matchupId: 900 + week,
      franchiseId: TEST_DATA.leader.id,
      rosterId: ROSTER_LEADER_ID,
      points: 70,
      isWinner: false,
      status: "complete",
    },
    {
      seasonId,
      week,
      matchupId: 900 + week,
      franchiseId: TEST_DATA.riser.id,
      rosterId: ROSTER_RISER_ID,
      points: 150,
      isWinner: true,
      status: "complete",
    },
  ]);
  await db.insert(matchups).values(matchupRows);

  // Injuries: leader's starters are banged up (2x "Out"); riser is healthy.
  await db.insert(players).values([
    {
      id: PLAYER_LEADER_OUT_1,
      fullName: "Leader Outguy One",
      searchFullName: "leader outguy one",
      position: "RB",
      injuryStatus: "Out",
    },
    {
      id: PLAYER_LEADER_OUT_2,
      fullName: "Leader Outguy Two",
      searchFullName: "leader outguy two",
      position: "WR",
      injuryStatus: "Out",
    },
  ]);

  await db.insert(rosterPlayers).values([
    {
      seasonId,
      franchiseId: TEST_DATA.leader.id,
      rosterId: ROSTER_LEADER_ID,
      playerId: PLAYER_LEADER_OUT_1,
      slot: "starter",
    },
    {
      seasonId,
      franchiseId: TEST_DATA.leader.id,
      rosterId: ROSTER_LEADER_ID,
      playerId: PLAYER_LEADER_OUT_2,
      slot: "starter",
    },
  ]);

  return seasonId;
}

export async function cleanupPowerRankingsData(seasonId: number): Promise<void> {
  const db = getTestDb();

  await db.delete(rosterPlayers).where(eq(rosterPlayers.seasonId, seasonId)).catch(() => {});
  await db.delete(matchups).where(eq(matchups.seasonId, seasonId)).catch(() => {});
  await db.delete(franchiseSeasons).where(eq(franchiseSeasons.seasonId, seasonId)).catch(() => {});
  await db.delete(seasons).where(eq(seasons.id, seasonId)).catch(() => {});

  for (const id of [PLAYER_LEADER_OUT_1, PLAYER_LEADER_OUT_2]) {
    await db.delete(players).where(eq(players.id, id)).catch(() => {});
  }
  for (const id of [FRANCHISE_LEADER_ID, FRANCHISE_RISER_ID]) {
    await db.delete(franchises).where(eq(franchises.id, id)).catch(() => {});
  }
}
