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
 * Aggregate head-to-head differential (wins minus losses) for one team
 * counting ONLY games played against other members of `groupIds`. Computed
 * once per team relative to a fixed tie group, so it is a scalar the sort can
 * order transitively (unlike a pairwise A-beat-B comparison inside sort,
 * which can form a non-transitive A>B>C>A cycle).
 */
function intraGroupH2HDiff(
  teamId: string,
  groupIds: Set<string>,
  h2hLookup: Map<H2HKey, H2HRecord>,
): number {
  let diff = 0;
  for (const otherId of groupIds) {
    if (otherId === teamId) continue;
    const rec = h2hLookup.get(h2hKey(teamId, otherId));
    if (rec) diff += rec.wins - rec.losses;
  }
  return diff;
}

/**
 * Resolves the order of a set of teams already tied on win%, using the
 * remaining tiebreak chain as a TOTAL order (every step is a scalar compared
 * with a deterministic final fallback, so equal inputs always sort the same):
 *   1. aggregate intra-group head-to-head differential DESC
 *   2. division record (win% within the team's own division) DESC
 *   3. points for DESC
 *   4. franchise id ASC (stable, guarantees determinism)
 */
function orderTieGroup(
  group: SeededTeam[],
  h2hLookup: Map<H2HKey, H2HRecord>,
  divisionRecord: Map<string, DivisionRecord>,
): SeededTeam[] {
  if (group.length <= 1) return group;
  const groupIds = new Set(group.map((t) => t.franchiseId));
  const h2hDiff = new Map(
    group.map((t) => [t.franchiseId, intraGroupH2HDiff(t.franchiseId, groupIds, h2hLookup)]),
  );

  return [...group].sort((a, b) => {
    const diffA = h2hDiff.get(a.franchiseId) ?? 0;
    const diffB = h2hDiff.get(b.franchiseId) ?? 0;
    if (diffA !== diffB) return diffB - diffA;

    const aDiv = divisionRecord.get(a.franchiseId);
    const bDiv = divisionRecord.get(b.franchiseId);
    const aDivPct = aDiv ? winPct(aDiv) : -1;
    const bDivPct = bDiv ? winPct(bDiv) : -1;
    if (aDivPct !== bDivPct) return bDivPct - aDivPct;

    if (b.pointsScored !== a.pointsScored) return b.pointsScored - a.pointsScored;

    // Deterministic final fallback so truly-equal teams sort identically
    // regardless of the arbitrary base order handed to us.
    return a.franchiseId < b.franchiseId ? -1 : a.franchiseId > b.franchiseId ? 1 : 0;
  });
}

/**
 * Sorts teams best-to-worst using the full tiebreaker chain. Pure,
 * synchronous, dependency-free, and a TOTAL order: teams are first bucketed
 * by win% (primary), then each bucket is resolved by orderTieGroup, so the
 * head-to-head step operates on a fixed tie set (transitive) rather than
 * pairwise inside the sort. All lookups are gathered by the caller.
 */
export function seedTeams(
  teams: SeededTeam[],
  h2hLookup: Map<H2HKey, H2HRecord>,
  divisionRecord: Map<string, DivisionRecord>,
): SeededTeam[] {
  const byPct = new Map<number, SeededTeam[]>();
  for (const t of teams) {
    const pct = winPct(t);
    if (!byPct.has(pct)) byPct.set(pct, []);
    byPct.get(pct)!.push(t);
  }

  const pcts = [...byPct.keys()].sort((a, b) => b - a); // win% DESC
  const result: SeededTeam[] = [];
  for (const pct of pcts) {
    result.push(...orderTieGroup(byPct.get(pct)!, h2hLookup, divisionRecord));
  }
  return result;
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
  status: string | null;
  aPoints: number | null;
  bPoints: number | null;
}

/**
 * Single query that returns every pairwise matchup result for a season, both
 * directions (a-vs-b and b-vs-a), so both the head-to-head lookup and the
 * per-division-game aggregation can be built from one pass.
 *
 * Includes status/points so a genuine tie (equal, non-null points on a
 * completed matchup, written as is_winner null/null by both the sync layer
 * and legacy import) can be told apart from an incomplete matchup (also
 * null/null, but never "complete").
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
      sql`${matchups} a INNER JOIN ${matchups} b ON a.season_id = b.season_id AND a.week = b.week AND a.matchup_id = b.matchup_id AND a.franchise_id != b.franchise_id`,
    )
    .where(sql`a.season_id = ${seasonId}`);

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
  try {
    const rows = await fetchPairRows(seasonId);

    const h2hLookup = new Map<H2HKey, H2HRecord>();
    const divisionRecord = new Map<string, DivisionRecord>();

    for (const row of rows) {
      // A row with is_winner null/null is either a genuine tie (both the
      // sync layer and legacy import write null/null for a completed tie)
      // or an incomplete matchup (also null/null while a game is scheduled
      // or in progress). Only count it when it's a completed, equal-points
      // tie; otherwise skip it entirely, same as any other incomplete
      // matchup.
      const tied = isCompletedTie(row);
      if (!row.aWinner && !row.bWinner && !tied) continue;

      const key = h2hKey(row.idA, row.idB);
      const entry = h2hLookup.get(key) ?? { wins: 0, losses: 0, ties: 0 };
      if (row.aWinner === true) entry.wins++;
      else if (row.bWinner === true) entry.losses++;
      else if (tied) entry.ties++;
      h2hLookup.set(key, entry);

      const divA = divisionOf.get(row.idA);
      const divB = divisionOf.get(row.idB);
      if (divA != null && divA === divB) {
        const dr = divisionRecord.get(row.idA) ?? { wins: 0, losses: 0, ties: 0 };
        if (row.aWinner === true) dr.wins++;
        else if (row.bWinner === true) dr.losses++;
        else if (tied) dr.ties++;
        divisionRecord.set(row.idA, dr);
      }
    }

    return { h2hLookup, divisionRecord };
  } catch (e) {
    console.error("[divisions] buildSeasonLookups error:", e);
    return { h2hLookup: new Map(), divisionRecord: new Map() };
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
 * Compares two teams by standings order for display: win% DESC (so teams that
 * have played unequal numbers of games mid-season are ranked fairly, matching
 * seedTeams' primary key), then points for DESC. RISK-A: never relies on
 * standingsFinish, which is null in-season.
 */
function byRecordDesc(a: SeededTeam, b: SeededTeam): number {
  const pctDiff = winPct(b) - winPct(a);
  if (pctDiff !== 0) return pctDiff;
  return b.pointsScored - a.pointsScored;
}

/**
 * Groups a season's standings by division, sorted within each group by
 * record (win% DESC, points DESC). Falls back to a single "League" group when
 * the season predates divisions (RISK-B: every row's division is null).
 */
export async function getDivisionStandings(seasonId: number): Promise<DivisionGroup[]> {
  try {
    const standings = await getSeasonStandings(seasonId);
    const teams = standings.map(toSeededTeam);

    const hasDivisions = teams.some((t) => t.division != null);

    if (!hasDivisions) {
      const sorted = [...teams].sort(byRecordDesc);
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
        const sorted = [...divTeams].sort(byRecordDesc);
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
 * records across all divisions), full tiebreak chain applied. Falls back to
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
  } catch (e) {
    console.error("[divisions] getPlayoffProjection error:", e);
    return { field: [], firstOut: null, hasDivisions: false };
  }
}

export { TEAMS_PER_DIVISION };
