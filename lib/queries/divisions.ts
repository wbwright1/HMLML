import { db } from "@/lib/db";
import { matchups, seasons } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import {
  DIVISION_COUNT,
  TEAMS_PER_DIVISION,
} from "@/lib/schedule/build-schedule";
import { getSeasonStandings } from "@/lib/queries/seasons";
import {
  resolveOrder,
  type TiebreakContext,
  type TiebreakGame,
} from "@/lib/nfl-tiebreakers";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PLAYOFF_BERTHS = 6;
const WILDCARD_BERTHS = PLAYOFF_BERTHS - DIVISION_COUNT; // 3

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SeededTeam {
  franchiseId: string;
  slug: string;
  name: string;
  abbreviation?: string | null;
  brandingColor?: string | null;
  avatarUrl?: string | null;
  wins: number;
  losses: number;
  ties: number;
  pointsScored: number;
  division: number | null;
  divisionName: string | null;
}

export interface ProjectedTeam extends SeededTeam {
  seed: number | null; // 1..6, or null if not in the projected field
  isDivisionWinner: boolean;
  isWildcard: boolean;
  isIn: boolean;
}

export interface DivisionGroup {
  division: number | null;
  divisionName: string;
  teams: SeededTeam[];
  record?: { wins: number; losses: number; ties: number };
}

export interface PlayoffProjection {
  field: ProjectedTeam[];
  firstOut: ProjectedTeam | null;
  hasDivisions: boolean;
}


/** Everything the NFL tiebreak procedure needs about a season's games. */
export type SeasonLookups = TiebreakContext;

// ---------------------------------------------------------------------------
// Pure helpers (exported, unit-tested)
// ---------------------------------------------------------------------------

/**
 * Sorts teams best-to-worst by the league rule: win% first, then NFL
 * tiebreakers inside each tie (lib/nfl-tiebreakers.ts), with the league's
 * adaptation that a team's conference is its division. Pure and deterministic.
 */
export function seedTeams(teams: SeededTeam[], lookups: SeasonLookups): SeededTeam[] {
  return resolveOrder(teams, lookups).map((o) => o.team);
}

/**
 * Builds the full 6-team playoff field and the bubble team. Pure.
 *
 * - Division winners (best team per division by the NFL division procedure)
 *   auto-qualify and take seeds 1..N, ordered among themselves by the NFL
 *   seeding procedure.
 * - The best WILDCARD_BERTHS non-winners fill the remaining seeds. The NFL
 *   wild-card procedure runs one club at a time, so each pick first reduces a
 *   tie to the best team per division.
 * - firstOut is the best remaining non-qualifier.
 */
export function buildDivisionalField(
  teamsByDivision: Map<number, SeededTeam[]>,
  lookups: SeasonLookups,
): { field: ProjectedTeam[]; firstOut: ProjectedTeam | null } {
  const winners: SeededTeam[] = [];
  const nonWinners: SeededTeam[] = [];

  for (const [, teams] of [...teamsByDivision.entries()].sort((a, b) => a[0] - b[0])) {
    const ranked = seedTeams(teams, lookups);
    if (ranked.length === 0) continue;
    winners.push(ranked[0]);
    nonWinners.push(...ranked.slice(1));
  }

  const rankedWinners = seedTeams(winners, lookups);
  const allNonWinners = seedTeams(nonWinners, lookups);
  const wildcards = allNonWinners.slice(0, WILDCARD_BERTHS);
  const bubble = allNonWinners.slice(WILDCARD_BERTHS);

  const winnerIds = new Set(rankedWinners.map((t) => t.franchiseId));
  const wildcardIds = new Set(wildcards.map((t) => t.franchiseId));

  const seededOrder = [...rankedWinners, ...wildcards];
  const field: ProjectedTeam[] = seededOrder.map((t, i) => ({
    ...t,
    seed: i + 1,
    isDivisionWinner: winnerIds.has(t.franchiseId),
    isWildcard: wildcardIds.has(t.franchiseId),
    isIn: true,
  }));

  const firstOut: ProjectedTeam | null = bubble.length
    ? {
        ...bubble[0],
        seed: null,
        isDivisionWinner: false,
        isWildcard: false,
        isIn: false,
      }
    : null;

  return { field, firstOut };
}

// ---------------------------------------------------------------------------
// Data-gathering (async, DB-backed)
// ---------------------------------------------------------------------------

interface PairRow {
  idA: string;
  idB: string;
  aWinner: boolean | null;
  bWinner: boolean | null;
  status: string | null;
  aPoints: number | null;
  bPoints: number | null;
}

/**
 * Every pairwise REGULAR-SEASON matchup row for a season, both directions.
 * Playoff weeks (week >= seasons.playoff_week_start) are excluded: NFL
 * tiebreakers only count regular-season games, and a playoff meeting must
 * never change a seed after the fact.
 */
async function fetchPairRows(seasonId: number): Promise<PairRow[]> {
  const rows = await db
    .select({
      idA: sql<string>`a.franchise_id`,
      idB: sql<string>`b.franchise_id`,
      aWinner: sql<boolean | null>`a.is_winner`,
      bWinner: sql<boolean | null>`b.is_winner`,
      status: sql<string | null>`a.status`,
      aPoints: sql<number | null>`a.points`,
      bPoints: sql<number | null>`b.points`,
    })
    .from(
      sql`${matchups} a INNER JOIN ${matchups} b ON a.season_id = b.season_id AND a.week = b.week AND a.matchup_id = b.matchup_id AND a.franchise_id != b.franchise_id INNER JOIN ${seasons} s ON s.id = a.season_id`,
    )
    .where(
      sql`a.season_id = ${seasonId} AND (s.playoff_week_start IS NULL OR a.week < s.playoff_week_start)`,
    );

  return rows;
}

/** True when a pair of matchup rows represents a genuine, completed tie. */
function isCompletedTie(row: PairRow): boolean {
  return (
    row.status === "complete" &&
    row.aPoints != null &&
    row.bPoints != null &&
    row.aPoints === row.bPoints
  );
}

/**
 * Converts both-direction pair rows into one TiebreakGame per completed game.
 * A row with is_winner null/null is either a genuine tie (completed, equal
 * points) or an unplayed game; only the former counts. Pure, exported for
 * tests.
 */
export function pairRowsToGames(rows: PairRow[]): TiebreakGame[] {
  const games: TiebreakGame[] = [];
  for (const row of rows) {
    if (row.idA >= row.idB) continue; // each game once
    const tied = isCompletedTie(row);
    if (!row.aWinner && !row.bWinner && !tied) continue;
    games.push({
      teamA: row.idA,
      teamB: row.idB,
      pointsA: Number(row.aPoints ?? 0),
      pointsB: Number(row.bPoints ?? 0),
      winner: row.aWinner ? "A" : row.bWinner ? "B" : null,
    });
  }
  return games;
}

/** The season's completed regular-season games, for the NFL tiebreakers. */
export async function buildSeasonLookups(seasonId: number): Promise<SeasonLookups> {
  try {
    return { games: pairRowsToGames(await fetchPairRows(seasonId)) };
  } catch (e) {
    console.error("[divisions] buildSeasonLookups error:", e);
    return { games: [] };
  }
}

function toSeededTeam(s: Awaited<ReturnType<typeof getSeasonStandings>>[number]): SeededTeam {
  return {
    franchiseId: s.franchiseId,
    slug: s.franchiseSlug,
    name: s.franchiseName,
    abbreviation: s.franchiseAbbreviation,
    brandingColor: s.franchiseBrandingColor,
    avatarUrl: s.avatarUrl ?? null,
    wins: s.wins ?? 0,
    losses: s.losses ?? 0,
    ties: s.ties ?? 0,
    pointsScored: Number(s.pointsScored ?? 0),
    division: s.division ?? null,
    divisionName: s.divisionName ?? null,
  };
}

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

/**
 * Groups a season's standings by division, sorted within each group by the
 * same NFL procedure that seeds the playoffs, so a division table never
 * disagrees with the projected field. Falls back to a single "League" group
 * when the season predates divisions (RISK-B: every row's division is null).
 */
export async function getDivisionStandings(seasonId: number): Promise<DivisionGroup[]> {
  try {
    const [standings, lookups] = await Promise.all([
      getSeasonStandings(seasonId),
      buildSeasonLookups(seasonId),
    ]);
    const teams = standings.map(toSeededTeam);

    const hasDivisions = teams.some((t) => t.division != null);

    if (!hasDivisions) {
      const sorted = seedTeams(teams, lookups);
      return [{ division: null, divisionName: "League", teams: sorted }];
    }

    const byDivision = new Map<number, SeededTeam[]>();
    for (const t of teams) {
      if (t.division == null) continue;
      if (!byDivision.has(t.division)) byDivision.set(t.division, []);
      byDivision.get(t.division)!.push(t);
    }

    return [...byDivision.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([division, divTeams]) => {
        const sorted = seedTeams(divTeams, lookups);
        const record = sorted.reduce(
          (acc, t) => ({
            wins: acc.wins + t.wins,
            losses: acc.losses + t.losses,
            ties: acc.ties + t.ties,
          }),
          { wins: 0, losses: 0, ties: 0 },
        );
        return {
          division,
          divisionName: sorted[0]?.divisionName ?? `Division ${division}`,
          teams: sorted,
          record,
        };
      });
  } catch (e) {
    console.error("[divisions] getDivisionStandings error:", e);
    return [];
  }
}

/**
 * Projects the 6-team playoff field for a season: 3 division winners
 * (auto-qualify regardless of overall record) + 3 wildcards (best remaining
 * records across all divisions), NFL tiebreakers applied. Falls back to
 * a straight top-6-by-record field when the season has no divisions
 * (RISK-B), with hasDivisions: false so callers can skip the "division
 * winner" framing.
 */
export async function getPlayoffProjection(seasonId: number): Promise<PlayoffProjection> {
  try {
    const standings = await getSeasonStandings(seasonId);
    const teams = standings.map(toSeededTeam);

    if (teams.length === 0) {
      return { field: [], firstOut: null, hasDivisions: false };
    }

    const hasDivisions = teams.some((t) => t.division != null);

    const lookups = await buildSeasonLookups(seasonId);

    if (!hasDivisions || teams.length < DIVISION_COUNT) {
      const ranked = seedTeams(teams, lookups);
      const field: ProjectedTeam[] = ranked.slice(0, PLAYOFF_BERTHS).map((t, i) => ({
        ...t,
        seed: i + 1,
        isDivisionWinner: false,
        isWildcard: false,
        isIn: true,
      }));
      const bubble = ranked[PLAYOFF_BERTHS];
      const firstOut: ProjectedTeam | null = bubble
        ? { ...bubble, seed: null, isDivisionWinner: false, isWildcard: false, isIn: false }
        : null;
      return { field, firstOut, hasDivisions: false };
    }

    const teamsByDivision = new Map<number, SeededTeam[]>();
    for (const t of teams) {
      if (t.division == null) continue;
      if (!teamsByDivision.has(t.division)) teamsByDivision.set(t.division, []);
      teamsByDivision.get(t.division)!.push(t);
    }

    const { field, firstOut } = buildDivisionalField(teamsByDivision, lookups);

    return { field, firstOut, hasDivisions: true };
  } catch (e) {
    console.error("[divisions] getPlayoffProjection error:", e);
    return { field: [], firstOut: null, hasDivisions: false };
  }
}

export { TEAMS_PER_DIVISION };
