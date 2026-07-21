import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import {
  seasons,
  franchises,
  franchiseSeasons,
  matchups,
  players,
  playerWeekPoints,
} from "../../lib/db/schema";
import { eq } from "drizzle-orm";

function getTestDb() {
  const sql = neon(process.env.POSTGRES_URL!);
  return drizzle(sql);
}

// Test-specific IDs to avoid collisions with real data and with other
// helpers' seeded data.
const TEST_PREFIX = "e2e-b1a";
const SEASON_YEAR = 1998; // unlikely to collide with real data or other helpers
const WEEK = 1;
const MATCHUP_ID_WITH_LINEUPS = 701;
const MATCHUP_ID_WITHOUT_LINEUPS = 702;

const FRANCHISE_HOME_ID = `${TEST_PREFIX}-franchise-home`;
const FRANCHISE_AWAY_ID = `${TEST_PREFIX}-franchise-away`;
const FRANCHISE_EMPTY_HOME_ID = `${TEST_PREFIX}-franchise-empty-home`;
const FRANCHISE_EMPTY_AWAY_ID = `${TEST_PREFIX}-franchise-empty-away`;

const ROSTER_HOME_ID = `${TEST_PREFIX}-roster-home`;
const ROSTER_AWAY_ID = `${TEST_PREFIX}-roster-away`;
const ROSTER_EMPTY_HOME_ID = `${TEST_PREFIX}-roster-empty-home`;
const ROSTER_EMPTY_AWAY_ID = `${TEST_PREFIX}-roster-empty-away`;

// Roster positions used to derive starting-slot order (buildSlotPriority in
// lib/queries/player-points.ts). Two BN slots cover the bench rows.
const ROSTER_POSITIONS = ["QB", "RB", "WR", "TE", "FLEX", "DEF", "BN", "BN"];

interface SeedPlayer {
  id: string;
  name: string;
  position: string;
  nflTeam: string;
  injuryStatus: string | null;
  slot: string;
  started: boolean;
  points: number;
  projectedPoints: number | null;
}

// Home roster: winner, all starters have a projection except the FLEX slot
// (exercises the "—" no-projection fallback).
const HOME_PLAYERS: SeedPlayer[] = [
  { id: `${TEST_PREFIX}-p-home-qb`, name: "Aaron Testman", position: "QB", nflTeam: "BUF", injuryStatus: null, slot: "QB", started: true, points: 24.6, projectedPoints: 22.1 },
  { id: `${TEST_PREFIX}-p-home-rb`, name: "Marcus Rushwell", position: "RB", nflTeam: "SF", injuryStatus: null, slot: "RB", started: true, points: 18.2, projectedPoints: 16.0 },
  { id: `${TEST_PREFIX}-p-home-wr`, name: "Derek Catchford", position: "WR", nflTeam: "MIA", injuryStatus: "Questionable", slot: "WR", started: true, points: 12.4, projectedPoints: 14.5 },
  { id: `${TEST_PREFIX}-p-home-te`, name: "Trent Blockman", position: "TE", nflTeam: "KC", injuryStatus: null, slot: "TE", started: true, points: 9.1, projectedPoints: 8.0 },
  { id: `${TEST_PREFIX}-p-home-flex`, name: "Jordan Flexwell", position: "RB", nflTeam: "DAL", injuryStatus: null, slot: "FLEX", started: true, points: 16.9, projectedPoints: null },
  { id: `${TEST_PREFIX}-def-home`, name: "Denver Defense", position: "DEF", nflTeam: "DEN", injuryStatus: null, slot: "DEF", started: true, points: 11, projectedPoints: 9 },
  { id: `${TEST_PREFIX}-p-home-bn1`, name: "Bench Runner Alpha", position: "RB", nflTeam: "LAR", injuryStatus: null, slot: "BN", started: false, points: 4.2, projectedPoints: 5.0 },
  { id: `${TEST_PREFIX}-p-home-bn2`, name: "Bench Wideout Alpha", position: "WR", nflTeam: "SEA", injuryStatus: null, slot: "BN", started: false, points: 3.1, projectedPoints: 4.0 },
];

// Away roster: loser, lower total points.
const AWAY_PLAYERS: SeedPlayer[] = [
  { id: `${TEST_PREFIX}-p-away-qb`, name: "Blake Passwell", position: "QB", nflTeam: "NE", injuryStatus: null, slot: "QB", started: true, points: 19.1, projectedPoints: 20.0 },
  { id: `${TEST_PREFIX}-p-away-rb`, name: "Riley Grindstone", position: "RB", nflTeam: "PHI", injuryStatus: null, slot: "RB", started: true, points: 9.7, projectedPoints: 11.0 },
  { id: `${TEST_PREFIX}-p-away-wr`, name: "Cole Streakman", position: "WR", nflTeam: "DAL", injuryStatus: null, slot: "WR", started: true, points: 8.4, projectedPoints: 10.0 },
  { id: `${TEST_PREFIX}-p-away-te`, name: "Sammy Sealoff", position: "TE", nflTeam: "GB", injuryStatus: null, slot: "TE", started: true, points: 6.6, projectedPoints: 7.0 },
  { id: `${TEST_PREFIX}-p-away-flex`, name: "Tyler Sidestep", position: "WR", nflTeam: "NYJ", injuryStatus: "Out", slot: "FLEX", started: true, points: 5.9, projectedPoints: 6.0 },
  { id: `${TEST_PREFIX}-def-away`, name: "Cleveland Defense", position: "DEF", nflTeam: "CLE", injuryStatus: null, slot: "DEF", started: true, points: 4, projectedPoints: 6 },
  { id: `${TEST_PREFIX}-p-away-bn1`, name: "Bench Passer Bravo", position: "QB", nflTeam: "CHI", injuryStatus: null, slot: "BN", started: false, points: 0, projectedPoints: 0 },
  { id: `${TEST_PREFIX}-p-away-bn2`, name: "Bench Blocker Bravo", position: "TE", nflTeam: "ATL", injuryStatus: null, slot: "BN", started: false, points: 2.5, projectedPoints: 3.0 },
];

const ALL_PLAYERS = [...HOME_PLAYERS, ...AWAY_PLAYERS];

export const TEST_DATA = {
  seasonYear: SEASON_YEAR,
  week: WEEK,
  matchupIdWithLineups: MATCHUP_ID_WITH_LINEUPS,
  matchupIdWithoutLineups: MATCHUP_ID_WITHOUT_LINEUPS,
  home: {
    id: FRANCHISE_HOME_ID,
    slug: `${TEST_PREFIX}-team-home`,
    name: "Lineup Home",
    abbreviation: "LHM",
    brandingColor: "#2D5A3D",
    rosterId: ROSTER_HOME_ID,
  },
  away: {
    id: FRANCHISE_AWAY_ID,
    slug: `${TEST_PREFIX}-team-away`,
    name: "Lineup Away",
    abbreviation: "LAW",
    brandingColor: "#B8860B",
    rosterId: ROSTER_AWAY_ID,
  },
  emptyHome: {
    id: FRANCHISE_EMPTY_HOME_ID,
    slug: `${TEST_PREFIX}-team-empty-home`,
    name: "Legacy Home",
    abbreviation: "LGH",
    brandingColor: null,
    rosterId: ROSTER_EMPTY_HOME_ID,
  },
  emptyAway: {
    id: FRANCHISE_EMPTY_AWAY_ID,
    slug: `${TEST_PREFIX}-team-empty-away`,
    name: "Legacy Away",
    abbreviation: "LGA",
    brandingColor: null,
    rosterId: ROSTER_EMPTY_AWAY_ID,
  },
  homeStartersTotal: HOME_PLAYERS.filter((p) => p.started).reduce((s, p) => s + p.points, 0),
  awayStartersTotal: AWAY_PLAYERS.filter((p) => p.started).reduce((s, p) => s + p.points, 0),
};

const ALL_FRANCHISE_IDS = [
  FRANCHISE_HOME_ID,
  FRANCHISE_AWAY_ID,
  FRANCHISE_EMPTY_HOME_ID,
  FRANCHISE_EMPTY_AWAY_ID,
];

/**
 * Seeds a season with two matchups in the same week: one (matchupIdWithLineups)
 * with full player_week_points rows for both rosters (starters ordered by
 * ROSTER_POSITIONS, plus bench), and one (matchupIdWithoutLineups) with only
 * matchup/franchise rows and no player_week_points rows, exercising the
 * "lineups aren't available" empty state on a matchup that otherwise resolves.
 *
 * Returns the season ID for cleanup.
 */
export async function seedPlayerWeekPoints(): Promise<number> {
  const db = getTestDb();

  // Clean up any leftovers from a previous failed run.
  await cleanupByPrefix(db);

  await db.insert(franchises).values(
    [
      { id: TEST_DATA.home.id, slug: TEST_DATA.home.slug, name: TEST_DATA.home.name, abbreviation: TEST_DATA.home.abbreviation, brandingColor: TEST_DATA.home.brandingColor },
      { id: TEST_DATA.away.id, slug: TEST_DATA.away.slug, name: TEST_DATA.away.name, abbreviation: TEST_DATA.away.abbreviation, brandingColor: TEST_DATA.away.brandingColor },
      { id: TEST_DATA.emptyHome.id, slug: TEST_DATA.emptyHome.slug, name: TEST_DATA.emptyHome.name, abbreviation: TEST_DATA.emptyHome.abbreviation, brandingColor: TEST_DATA.emptyHome.brandingColor },
      { id: TEST_DATA.emptyAway.id, slug: TEST_DATA.emptyAway.slug, name: TEST_DATA.emptyAway.name, abbreviation: TEST_DATA.emptyAway.abbreviation, brandingColor: TEST_DATA.emptyAway.brandingColor },
    ]
  );

  const [season] = await db
    .insert(seasons)
    .values({
      seasonYear: SEASON_YEAR,
      leagueId: `${TEST_PREFIX}-league`,
      status: "complete",
      settingsJson: { roster_positions: ROSTER_POSITIONS },
    })
    .returning({ id: seasons.id });

  const seasonId = season.id;

  await db.insert(franchiseSeasons).values([
    { franchiseId: TEST_DATA.home.id, seasonId, rosterId: ROSTER_HOME_ID, userId: `${TEST_PREFIX}-user-home`, ownerDisplayName: "Home Owner" },
    { franchiseId: TEST_DATA.away.id, seasonId, rosterId: ROSTER_AWAY_ID, userId: `${TEST_PREFIX}-user-away`, ownerDisplayName: "Away Owner" },
    { franchiseId: TEST_DATA.emptyHome.id, seasonId, rosterId: ROSTER_EMPTY_HOME_ID, userId: `${TEST_PREFIX}-user-empty-home`, ownerDisplayName: "Legacy Home Owner" },
    { franchiseId: TEST_DATA.emptyAway.id, seasonId, rosterId: ROSTER_EMPTY_AWAY_ID, userId: `${TEST_PREFIX}-user-empty-away`, ownerDisplayName: "Legacy Away Owner" },
  ]);

  await db.insert(matchups).values([
    {
      seasonId,
      week: WEEK,
      matchupId: MATCHUP_ID_WITH_LINEUPS,
      franchiseId: TEST_DATA.home.id,
      rosterId: ROSTER_HOME_ID,
      points: TEST_DATA.homeStartersTotal,
      isWinner: true,
      status: "complete",
    },
    {
      seasonId,
      week: WEEK,
      matchupId: MATCHUP_ID_WITH_LINEUPS,
      franchiseId: TEST_DATA.away.id,
      rosterId: ROSTER_AWAY_ID,
      points: TEST_DATA.awayStartersTotal,
      isWinner: false,
      status: "complete",
    },
    // Matchup without any player_week_points rows: exercises the empty state.
    {
      seasonId,
      week: WEEK,
      matchupId: MATCHUP_ID_WITHOUT_LINEUPS,
      franchiseId: TEST_DATA.emptyHome.id,
      rosterId: ROSTER_EMPTY_HOME_ID,
      points: 88.0,
      isWinner: false,
      status: "complete",
    },
    {
      seasonId,
      week: WEEK,
      matchupId: MATCHUP_ID_WITHOUT_LINEUPS,
      franchiseId: TEST_DATA.emptyAway.id,
      rosterId: ROSTER_EMPTY_AWAY_ID,
      points: 91.5,
      isWinner: true,
      status: "complete",
    },
  ]);

  await db.insert(players).values(
    ALL_PLAYERS.map((p) => ({
      id: p.id,
      fullName: p.name,
      firstName: p.name.split(" ")[0],
      lastName: p.name.split(" ").slice(1).join(" "),
      position: p.position,
      nflTeam: p.nflTeam,
      status: "Active",
      injuryStatus: p.injuryStatus,
    }))
  );

  await db.insert(playerWeekPoints).values([
    ...HOME_PLAYERS.map((p) => ({
      seasonId,
      week: WEEK,
      rosterId: ROSTER_HOME_ID,
      franchiseId: TEST_DATA.home.id,
      matchupId: MATCHUP_ID_WITH_LINEUPS,
      playerId: p.id,
      points: p.points,
      projectedPoints: p.projectedPoints,
      slot: p.slot,
      started: p.started,
    })),
    ...AWAY_PLAYERS.map((p) => ({
      seasonId,
      week: WEEK,
      rosterId: ROSTER_AWAY_ID,
      franchiseId: TEST_DATA.away.id,
      matchupId: MATCHUP_ID_WITH_LINEUPS,
      playerId: p.id,
      points: p.points,
      projectedPoints: p.projectedPoints,
      slot: p.slot,
      started: p.started,
    })),
  ]);

  return seasonId;
}

async function cleanupByPrefix(db: ReturnType<typeof getTestDb>): Promise<void> {
  for (const p of ALL_PLAYERS) {
    await db.delete(playerWeekPoints).where(eq(playerWeekPoints.playerId, p.id)).catch(() => {});
    await db.delete(players).where(eq(players.id, p.id)).catch(() => {});
  }
  await db.delete(matchups).where(eq(matchups.rosterId, ROSTER_HOME_ID)).catch(() => {});
  await db.delete(matchups).where(eq(matchups.rosterId, ROSTER_AWAY_ID)).catch(() => {});
  await db.delete(matchups).where(eq(matchups.rosterId, ROSTER_EMPTY_HOME_ID)).catch(() => {});
  await db.delete(matchups).where(eq(matchups.rosterId, ROSTER_EMPTY_AWAY_ID)).catch(() => {});
  for (const fId of ALL_FRANCHISE_IDS) {
    await db.delete(franchiseSeasons).where(eq(franchiseSeasons.franchiseId, fId)).catch(() => {});
    await db.delete(franchises).where(eq(franchises.id, fId)).catch(() => {});
  }
  await db.delete(seasons).where(eq(seasons.seasonYear, SEASON_YEAR)).catch(() => {});
}

/**
 * Cleans up all test data seeded by seedPlayerWeekPoints.
 */
export async function cleanupPlayerWeekPoints(seasonId: number): Promise<void> {
  const db = getTestDb();

  for (const p of ALL_PLAYERS) {
    await db.delete(playerWeekPoints).where(eq(playerWeekPoints.playerId, p.id)).catch(() => {});
  }
  await db.delete(matchups).where(eq(matchups.seasonId, seasonId)).catch(() => {});
  await db.delete(franchiseSeasons).where(eq(franchiseSeasons.seasonId, seasonId)).catch(() => {});
  await db.delete(seasons).where(eq(seasons.id, seasonId)).catch(() => {});

  for (const fId of ALL_FRANCHISE_IDS) {
    await db.delete(franchises).where(eq(franchises.id, fId)).catch(() => {});
  }
  for (const p of ALL_PLAYERS) {
    await db.delete(players).where(eq(players.id, p.id)).catch(() => {});
  }
}
