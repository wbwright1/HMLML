import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import {
  seasons,
  franchises,
  franchiseSeasons,
  transactions,
  players,
  playerWeekPoints,
} from "../../lib/db/schema";
import { eq, inArray } from "drizzle-orm";

function getTestDb() {
  const sql = neon(process.env.POSTGRES_URL!);
  return drizzle(sql);
}

// Test-specific IDs to avoid collisions with real data.
const TEST_PREFIX = "e2e-trades";
const SEASON_YEAR = 1996; // unlikely to collide with real data or other seed helpers (which use 1997-1999)
const FRANCHISE_A_ID = `${TEST_PREFIX}-franchise-a`;
const FRANCHISE_B_ID = `${TEST_PREFIX}-franchise-b`;
const PLAYER_1_ID = `${TEST_PREFIX}-player-1`;
const PLAYER_2_ID = `${TEST_PREFIX}-player-2`;
const TRANSACTION_ID = `${TEST_PREFIX}-txn-1`;
const FLIP_TRANSACTION_ID = `${TEST_PREFIX}-txn-2`;
const FRESH_TRANSACTION_ID = `${TEST_PREFIX}-txn-3`;

// Roster IDs are NUMBERS inside the transactions jsonb (Sleeper's format), but
// franchise_seasons.rosterId is TEXT; the query converts with String(n).
const ROSTER_A = 91;
const ROSTER_B = 92;

export const TRADE_TEST_DATA = {
  seasonYear: SEASON_YEAR,
  franchiseA: {
    id: FRANCHISE_A_ID,
    slug: `${TEST_PREFIX}-team-alpha`,
    name: "Trade Team Alpha",
    abbreviation: "TTA",
    brandingColor: "#2D5A3D",
    rosterId: ROSTER_A,
  },
  franchiseB: {
    id: FRANCHISE_B_ID,
    slug: `${TEST_PREFIX}-team-bravo`,
    name: "Trade Team Bravo",
    abbreviation: "TTB",
    brandingColor: "#B8860B",
    rosterId: ROSTER_B,
  },
  // Player 1 is received by franchise A; player 2 is received by franchise B.
  player1: {
    id: PLAYER_1_ID,
    fullName: "Reginald Testquarterback",
    position: "QB",
    nflTeam: "KC",
  },
  player2: {
    id: PLAYER_2_ID,
    fullName: "Maurice Testrunningback",
    position: "RB",
    nflTeam: "SF",
  },
  // Draft pick received by franchise A.
  pick: {
    season: "2000",
    round: 2,
  },
};

/**
 * Seeds two franchises, their per-season roster mapping, two players, and one
 * completed 2-team trade in the transactions table. The trade sends player 2
 * and a 2000 Round 2 pick to franchise A (roster 91), and player 1 to
 * franchise B (roster 92); i.e. adds/picks reference the RECEIVING roster,
 * exactly as Sleeper writes them, so the resolved output is only correct if
 * getTrades() actually runs its resolution logic.
 *
 * A second, later trade FLIPS the same pick from franchise A back to B (for
 * player 1), so the first trade's pick line must carry a "flipped in a later
 * trade" link targeting the second trade's card.
 *
 * Returns the season ID for cleanup.
 */
export async function seedTradeData(): Promise<number> {
  const db = getTestDb();

  const t = TRADE_TEST_DATA;

  // Franchises (delete-then-insert to avoid unique collisions on reruns).
  for (const fId of [FRANCHISE_A_ID, FRANCHISE_B_ID]) {
    await db.delete(franchises).where(eq(franchises.id, fId)).catch(() => {});
  }
  await db.insert(franchises).values([
    {
      id: t.franchiseA.id,
      slug: t.franchiseA.slug,
      name: t.franchiseA.name,
      abbreviation: t.franchiseA.abbreviation,
      brandingColor: t.franchiseA.brandingColor,
    },
    {
      id: t.franchiseB.id,
      slug: t.franchiseB.slug,
      name: t.franchiseB.name,
      abbreviation: t.franchiseB.abbreviation,
      brandingColor: t.franchiseB.brandingColor,
    },
  ]);

  // Players.
  for (const pId of [PLAYER_1_ID, PLAYER_2_ID]) {
    await db.delete(players).where(eq(players.id, pId)).catch(() => {});
  }
  await db.insert(players).values([
    {
      id: t.player1.id,
      fullName: t.player1.fullName,
      position: t.player1.position,
      nflTeam: t.player1.nflTeam,
    },
    {
      id: t.player2.id,
      fullName: t.player2.fullName,
      position: t.player2.position,
      nflTeam: t.player2.nflTeam,
    },
  ]);

  // Season (delete any orphan from a failed prior run first: season_year is
  // unique, so a leftover row would otherwise block the insert). Clear child
  // rows first to satisfy foreign keys.
  const orphans = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.seasonYear, SEASON_YEAR))
    .catch(() => [] as { id: number }[]);
  for (const o of orphans) {
    await db.delete(playerWeekPoints).where(eq(playerWeekPoints.seasonId, o.id)).catch(() => {});
    await db.delete(transactions).where(eq(transactions.seasonId, o.id)).catch(() => {});
    await db.delete(franchiseSeasons).where(eq(franchiseSeasons.seasonId, o.id)).catch(() => {});
    await db.delete(seasons).where(eq(seasons.id, o.id)).catch(() => {});
  }
  const [season] = await db
    .insert(seasons)
    .values({
      seasonYear: SEASON_YEAR,
      leagueId: `${TEST_PREFIX}-league`,
      status: "complete",
    })
    .returning({ id: seasons.id });

  const seasonId = season.id;

  // Per-season roster -> franchise mapping (rosterId is TEXT).
  await db.insert(franchiseSeasons).values([
    {
      franchiseId: t.franchiseA.id,
      seasonId,
      rosterId: String(t.franchiseA.rosterId),
      userId: `${TEST_PREFIX}-user-a`,
      ownerDisplayName: "Owner A",
    },
    {
      franchiseId: t.franchiseB.id,
      seasonId,
      rosterId: String(t.franchiseB.rosterId),
      userId: `${TEST_PREFIX}-user-b`,
      ownerDisplayName: "Owner B",
    },
  ]);

  // The completed trade. adds/drops values are the RECEIVING / GIVING roster
  // (numbers). draftPicksInvolved.owner_id is the new owner.
  await db.insert(transactions).values({
    seasonId,
    transactionId: TRANSACTION_ID,
    type: "trade",
    status: "complete",
    week: 5,
    rosterIds: [ROSTER_A, ROSTER_B],
    adds: {
      [t.player2.id]: ROSTER_A, // franchise A receives player 2
      [t.player1.id]: ROSTER_B, // franchise B receives player 1
    },
    drops: {
      [t.player2.id]: ROSTER_B, // franchise B gave up player 2
      [t.player1.id]: ROSTER_A, // franchise A gave up player 1
    },
    draftPicksInvolved: [
      {
        season: t.pick.season,
        round: t.pick.round,
        roster_id: ROSTER_A,
        previous_owner_id: ROSTER_B,
        owner_id: ROSTER_A, // franchise A receives the pick
      },
    ],
    createdAtSleeper: Date.UTC(SEASON_YEAR, 9, 15),
  });

  // The flip: one week later, franchise A trades the same pick onward to B
  // in exchange for player 1. Same (season, round, roster_id) identity, so
  // getTrades() must flag the FIRST trade's pick as flipped into this one.
  await db.insert(transactions).values({
    seasonId,
    transactionId: FLIP_TRANSACTION_ID,
    type: "trade",
    status: "complete",
    week: 6,
    rosterIds: [ROSTER_A, ROSTER_B],
    adds: {
      [t.player1.id]: ROSTER_A, // franchise A gets player 1 for the pick
    },
    drops: {
      [t.player1.id]: ROSTER_B,
    },
    draftPicksInvolved: [
      {
        season: t.pick.season,
        round: t.pick.round,
        roster_id: ROSTER_A,
        previous_owner_id: ROSTER_A,
        owner_id: ROSTER_B, // franchise B receives the pick
      },
    ],
    createdAtSleeper: Date.UTC(SEASON_YEAR, 9, 22),
  });

  // A FRESH pick-only trade (30 days old) that must render "Hindsight
  // Pending" instead of a grade regardless of when the suite runs.
  await db.insert(transactions).values({
    seasonId,
    transactionId: FRESH_TRANSACTION_ID,
    type: "trade",
    status: "complete",
    week: 10,
    rosterIds: [ROSTER_A, ROSTER_B],
    adds: {},
    drops: {},
    draftPicksInvolved: [
      {
        season: "2001",
        round: 3,
        roster_id: ROSTER_A,
        previous_owner_id: ROSTER_A,
        owner_id: ROSTER_B,
      },
    ],
    createdAtSleeper: Date.now() - 30 * 24 * 60 * 60 * 1000,
  });

  // Realized points for hindsight grading of the ORIGINAL trade (>1 year old):
  // player 2 produced 150 for franchise A from the trade week on, player 1
  // managed 40 for franchise B before being flipped back; 150/190 = 79% of
  // the combined haul, which must grade as Highway Robbery, A+ vs F.
  await db.insert(playerWeekPoints).values([
    ...[5, 6, 7, 8, 9].map((week) => ({
      seasonId,
      week,
      rosterId: String(ROSTER_A),
      franchiseId: FRANCHISE_A_ID,
      playerId: PLAYER_2_ID,
      points: 30,
      started: true,
      slot: "RB",
    })),
    {
      seasonId,
      week: 5,
      rosterId: String(ROSTER_B),
      franchiseId: FRANCHISE_B_ID,
      playerId: PLAYER_1_ID,
      points: 40,
      started: true,
      slot: "QB",
    },
  ]);

  return seasonId;
}

/** Cleans up all test data seeded by seedTradeData. */
export async function cleanupTradeData(seasonId: number): Promise<void> {
  const db = getTestDb();

  await db
    .delete(playerWeekPoints)
    .where(eq(playerWeekPoints.seasonId, seasonId))
    .catch(() => {});
  await db
    .delete(transactions)
    .where(eq(transactions.seasonId, seasonId))
    .catch(() => {});
  await db
    .delete(franchiseSeasons)
    .where(eq(franchiseSeasons.seasonId, seasonId))
    .catch(() => {});
  await db.delete(seasons).where(eq(seasons.id, seasonId)).catch(() => {});
  await db
    .delete(players)
    .where(inArray(players.id, [PLAYER_1_ID, PLAYER_2_ID]))
    .catch(() => {});
  for (const fId of [FRANCHISE_A_ID, FRANCHISE_B_ID]) {
    await db.delete(franchises).where(eq(franchises.id, fId)).catch(() => {});
  }
}
