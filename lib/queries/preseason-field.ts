import { getDivisionStandings } from "@/lib/queries/divisions";
import { getSeasonStandings } from "@/lib/queries/seasons";
import { formatRecord } from "@/lib/format-record";

// Re-exported so existing consumers/tests that import formatRecord from this
// module keep working; the implementation now lives in lib/format-record.ts.
export { formatRecord };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FieldTag = "CHAMP" | "R-UP" | "DOORMAT";

export interface FieldTeamEntry {
  franchiseId: string;
  slug: string;
  name: string;
  abbreviation: string | null;
  brandingColor: string | null;
  /** Last-season W-L(-T), shown when the team carries no tag. Null = no history. */
  recordLabel: string | null;
  /** CHAMP / R-UP / DOORMAT takes the slot instead of the record. */
  tag: FieldTag | null;
}

export interface FieldDivision {
  division: number | null;
  divisionName: string;
  teams: FieldTeamEntry[];
}

export interface PreseasonField {
  divisions: FieldDivision[];
  /** True when teams are grouped into real divisions (not the single fallback). */
  hasDivisions: boolean;
}

// Minimal shape of a last-completed-season standings row that the pure helpers
// below read from. Mirrors the columns getSeasonStandings selects.
interface LastSeasonRow {
  franchiseId: string;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  standingsFinish: number | null;
  playoffResult: string | null;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in preseason-field.test.ts)
// ---------------------------------------------------------------------------

/**
 * The single worst finisher of a completed season, tagged DOORMAT. Prefers the
 * largest standings_finish (last place); falls back to the lowest win% when the
 * finish is unrecorded. Returns null for an empty season.
 */
export function pickDoormatId(rows: LastSeasonRow[]): string | null {
  if (rows.length === 0) return null;

  const withFinish = rows.filter((r) => r.standingsFinish != null);
  if (withFinish.length > 0) {
    return withFinish.reduce((worst, r) =>
      (r.standingsFinish ?? 0) > (worst.standingsFinish ?? 0) ? r : worst,
    ).franchiseId;
  }

  const winPct = (r: LastSeasonRow) => {
    const w = r.wins ?? 0;
    const l = r.losses ?? 0;
    const t = r.ties ?? 0;
    const total = w + l + t;
    return total > 0 ? (w + t * 0.5) / total : 0;
  };
  return rows.reduce((worst, r) => (winPct(r) < winPct(worst) ? r : worst)).franchiseId;
}

/**
 * Resolves the tag for one franchise from its last-completed season: champion
 * and runner-up come from playoff_result; the precomputed doormat id supplies
 * DOORMAT. A tag always wins the display slot over the raw record.
 */
export function fieldTagFor(
  row: LastSeasonRow | undefined,
  doormatId: string | null,
): FieldTag | null {
  if (!row) return null;
  if (row.playoffResult === "champion") return "CHAMP";
  if (row.playoffResult === "runner_up") return "R-UP";
  if (doormatId && row.franchiseId === doormatId) return "DOORMAT";
  return null;
}

/**
 * Builds a display entry for a franchise in the field: tag if it earned one
 * last season, otherwise its last-season record (null when the franchise has
 * no prior season).
 */
export function buildFieldEntry(
  team: {
    franchiseId: string;
    slug: string;
    name: string;
    abbreviation?: string | null;
    brandingColor?: string | null;
  },
  lastRow: LastSeasonRow | undefined,
  doormatId: string | null,
): FieldTeamEntry {
  const tag = fieldTagFor(lastRow, doormatId);
  return {
    franchiseId: team.franchiseId,
    slug: team.slug,
    name: team.name,
    abbreviation: team.abbreviation ?? null,
    brandingColor: team.brandingColor ?? null,
    recordLabel:
      tag || !lastRow ? null : formatRecord(lastRow.wins, lastRow.losses, lastRow.ties),
    tag,
  };
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Assembles "The Field" for the preseason hub: the current season's franchises
 * grouped by division, each annotated with last season's record or a
 * CHAMP / R-UP / DOORMAT tag. Grouping comes from the current season when its
 * franchise_seasons exist, else from the last completed season. Records/tags
 * always come from the last completed season.
 */
export async function getPreseasonField(
  currentSeasonId: number | null | undefined,
  lastSeasonId: number | null | undefined,
): Promise<PreseasonField> {
  const [currentGroups, lastStandings] = await Promise.all([
    currentSeasonId ? getDivisionStandings(currentSeasonId) : Promise.resolve([]),
    lastSeasonId ? getSeasonStandings(lastSeasonId) : Promise.resolve([]),
  ]);

  // Prefer the current season's roster for grouping; fall back to last season
  // when the new league year has no franchise_seasons yet.
  let groups = currentGroups;
  const currentHasTeams = currentGroups.some((g) => g.teams.length > 0);
  if (!currentHasTeams && lastSeasonId) {
    groups = await getDivisionStandings(lastSeasonId);
  }

  const lastByFranchise = new Map<string, LastSeasonRow>(
    lastStandings.map((r) => [r.franchiseId, r]),
  );
  const doormatId = pickDoormatId(lastStandings);

  const divisions: FieldDivision[] = groups
    .filter((g) => g.teams.length > 0)
    .map((g) => ({
      division: g.division,
      divisionName: g.divisionName,
      teams: g.teams.map((t) =>
        buildFieldEntry(
          {
            franchiseId: t.franchiseId,
            slug: t.slug,
            name: t.name,
            abbreviation: t.abbreviation,
            brandingColor: t.brandingColor,
          },
          lastByFranchise.get(t.franchiseId),
          doormatId,
        ),
      ),
    }));

  const hasDivisions = divisions.length > 1 || divisions.some((d) => d.division != null);

  return { divisions, hasDivisions };
}
