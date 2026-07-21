import { db } from "@/lib/db";
import { matchups } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import {
  DIVISION_COUNT,
  TEAMS_PER_DIVISION,
} from "@/lib/schedule/build-schedule";
import { getSeasonStandings } from "@/lib/queries/seasons";

// Referenced for documentation/traceability of the seeding rules; the actual
// tiebreak math in seedTeams() reads from the lookups built below rather than
// calling this function per-pair (one query covers every pair in a season).
export { getHeadToHead } from "@/lib/queries/records";

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

type H2HKey = string;
export interface H2HRecord {
  wins: number;
  losses: number;
  ties: number;
}
export interface DivisionRecord {
  wins: number;
  losses: number;
  ties: number;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported, unit-tested)
// ---------------------------------------------------------------------------

function winPct(t: { wins: number; losses: number; ties: number }): number {
  const total = t.wins + t.losses + t.ties;
  return total > 0 ? (t.wins + t.ties * 0.5) / total : 0;
}

function h2hKey(a: string, b: string): H2HKey {
  return `${a}|${b}`;
}

/**
 * Compares two teams for seeding purposes using the tiebreaker chain:
 *   1. win% DESC
 *   2. head-to-head between the two teams (only meaningful for a 2-way
 *      comparison; skipped when no games were played between them)
 *   3. division record (win% within the team's own division) DESC
 *   4. points for DESC
 * Returns <0 if a ranks ahead of b, >0 if b ranks ahead of a, 0 if truly tied.
 */
function compareTeams(
  a: SeededTeam,
  b: SeededTeam,
  h2hLookup: Map<H2HKey, H2HRecord>,
  divisionRecord: Map<string, DivisionRecord>,
): number {
  const pctDiff = winPct(b) - winPct(a);
  if (pctDiff !== 0) return pctDiff;

  const h2h = h2hLookup.get(h2hKey(a.franchiseId, b.franchiseId));
  if (h2h && h2h.wins !== h2h.losses) {
    return h2h.losses - h2h.wins; // more h2h wins for `a` -> negative -> a first
  }

  const aDiv = divisionRecord.get(a.franchiseId);
  const bDiv = divisionRecord.get(b.franchiseId);
  if (aDiv && bDiv) {
    const aDivPct = winPct(aDiv);
    const bDivPct = winPct(bDiv);
    if (aDivPct !== bDivPct) return bDivPct - aDivPct;
  }

  if (b.pointsScored !== a.pointsScored) return b.pointsScored - a.pointsScored;

  return 0;
}

/**
 * Sorts teams best-to-worst using the full tiebreaker chain. Pure,
 * synchronous, dependency-free: all lookups are gathered by the caller and
 * passed in.
 */
export function seedTeams(
  teams: SeededTeam[],
  h2hLookup: Map<H2HKey, H2HRecord>,
  divisionRecord: Map<string, DivisionRecord>,
): SeededTeam[] {
  return [...teams].sort((a, b) => compareTeams(a, b, h2hLookup, divisionRecord));
}

/**
 * Builds the full 6-team playoff field and the bubble team from an
 * already-seeded (or unseeded) pool of teams, grouped by division. Pure.
 *
 * - Division winners (best team per division by the tiebreak chain) auto-
 *   qualify and are seeded 1..N ahead of every wildcard, ordered among
 *   themselves by the same tiebreak chain.
 * - The best WILDCARD_BERTHS non-winners (across all divisions) fill the
 *   remaining seeds, in tiebreak order.
 * - firstOut is the best remaining non-qualifier.
 */
export function buildDivisionalField(
  teamsByDivision: Map<number, SeededTeam[]>,
  h2hLookup: Map<H2HKey, H2HRecord>,
  divisionRecord: Map<string, DivisionRecord>,
): { field: ProjectedTeam[]; firstOut: ProjectedTeam | null } {
  const winners: SeededTeam[] = [];
  const nonWinnersByDivision: SeededTeam[][] = [];

  for (const [, teams] of [...teamsByDivision.entries()].sort((a, b) => a[0] - b[0])) {
    const ranked = seedTeams(teams, h2hLookup, divisionRecord);
    if (ranked.length === 0) continue;
    winners.push(ranked[0]);
    nonWinnersByDivision.push(ranked.slice(1));
  }

  const rankedWinners = seedTeams(winners, h2hLookup, divisionRecord);

  const allNonWinners = seedTeams(nonWinnersByDivision.flat(), h2hLookup, divisionRecord);
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
}

/**
 * Single query that returns every pairwise matchup result for a season, both
 * directions (a-vs-b and b-vs-a), so both the head-to-head lookup and the
 * per-division-game aggregation can be built from one pass.
 */
async function fetchPairRows(seasonId: number): Promise<PairRow[]> {
  const rows = await db
    .select({
      idA: sql<string>`a.franchise_id`,
      idB: sql<string>`b.franchise_id`,
      aWinner: sql<boolean | null>`a.is_winner`,
      bWinner: sql<boolean | null>`b.is_winner`,
    })
    .from(
      sql`${matchups} a INNER JOIN ${matchups} b ON a.season_id = b.season_id AND a.week = b.week AND a.matchup_id = b.matchup_id AND a.franchise_id != b.franchise_id`,
    )
    .where(sql`a.season_id = ${seasonId}`);

  return rows;
}

/**
 * Builds the head-to-head lookup (keyed "idA|idB", from idA's perspective)
 * and the division-record map (each franchise's W/L/T against opponents in
 * its own division) for a season, in one query.
 */
export async function buildSeasonLookups(
  seasonId: number,
  divisionOf: Map<string, number | null>,
): Promise<{
  h2hLookup: Map<H2HKey, H2HRecord>;
  divisionRecord: Map<string, DivisionRecord>;
}> {
  const rows = await fetchPairRows(seasonId);

  const h2hLookup = new Map<H2HKey, H2HRecord>();
  const divisionRecord = new Map<string, DivisionRecord>();

  for (const row of rows) {
    const key = h2hKey(row.idA, row.idB);
    const entry = h2hLookup.get(key) ?? { wins: 0, losses: 0, ties: 0 };
    if (row.aWinner === true) entry.wins++;
    else if (row.bWinner === true) entry.losses++;
    else if (row.aWinner === false && row.bWinner === false) entry.ties++;
    h2hLookup.set(key, entry);

    const divA = divisionOf.get(row.idA);
    const divB = divisionOf.get(row.idB);
    if (divA != null && divA === divB) {
      const dr = divisionRecord.get(row.idA) ?? { wins: 0, losses: 0, ties: 0 };
      if (row.aWinner === true) dr.wins++;
      else if (row.bWinner === true) dr.losses++;
      else if (row.aWinner === false && row.bWinner === false) dr.ties++;
      divisionRecord.set(row.idA, dr);
    }
  }

  return { h2hLookup, divisionRecord };
}

function toSeededTeam(s: Awaited<ReturnType<typeof getSeasonStandings>>[number]): SeededTeam {
  return {
    franchiseId: s.franchiseId,
    slug: s.franchiseSlug,
    name: s.franchiseName,
    abbreviation: s.franchiseAbbreviation,
    brandingColor: s.franchiseBrandingColor,
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
 * Groups a season's standings by division, sorted within each group by
 * record (wins DESC, points DESC — RISK-A: never rely on standingsFinish,
 * which is null in-season). Falls back to a single "League" group when the
 * season predates divisions (RISK-B: every row's division is null).
 */
export async function getDivisionStandings(seasonId: number): Promise<DivisionGroup[]> {
  const standings = await getSeasonStandings(seasonId);
  const teams = standings.map(toSeededTeam);

  const hasDivisions = teams.some((t) => t.division != null);

  if (!hasDivisions) {
    const sorted = [...teams].sort(
      (a, b) => b.wins - a.wins || b.pointsScored - a.pointsScored,
    );
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
      const sorted = [...divTeams].sort(
        (a, b) => b.wins - a.wins || b.pointsScored - a.pointsScored,
      );
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
}

/**
 * Projects the 6-team playoff field for a season: 3 division winners
 * (auto-qualify regardless of overall record) + 3 wildcards (best remaining
 * records across all divisions), full tiebreak chain applied. Falls back to
 * a straight top-6-by-record field when the season has no divisions
 * (RISK-B), with hasDivisions: false so callers can skip the "division
 * winner" framing.
 */
export async function getPlayoffProjection(seasonId: number): Promise<PlayoffProjection> {
  const standings = await getSeasonStandings(seasonId);
  const teams = standings.map(toSeededTeam);

  if (teams.length === 0) {
    return { field: [], firstOut: null, hasDivisions: false };
  }

  const hasDivisions = teams.some((t) => t.division != null);

  const divisionOf = new Map<string, number | null>(
    teams.map((t) => [t.franchiseId, t.division]),
  );
  const { h2hLookup, divisionRecord } = await buildSeasonLookups(seasonId, divisionOf);

  if (!hasDivisions || teams.length < DIVISION_COUNT) {
    const ranked = seedTeams(teams, h2hLookup, divisionRecord);
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

  const { field, firstOut } = buildDivisionalField(teamsByDivision, h2hLookup, divisionRecord);

  return { field, firstOut, hasDivisions: true };
}

export { TEAMS_PER_DIVISION };
