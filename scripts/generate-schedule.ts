/**
 * Season schedule generator (runner).
 *
 * Builds the 14-game regular-season schedule for the 12-team, 3-division
 * league: division rivals twice, everyone else once. Week 1 is a rematch of
 * last year's finals; the three division-rematch weeks are flagged, one as
 * primetime.
 *
 * Everything but the knobs below is pulled from synced data:
 *   - Divisions come live from Sleeper (each roster's settings.division).
 *   - Finalists are derived from the rookie draft (reverse draft order),
 *     cross-checked against the prior season's recorded playoff result.
 *
 * Does NOT write matchups: Sleeper's public API is read-only and the app
 * mirrors it, so the schedule is emitted for manual entry. Prints the slate
 * and writes schedule-<YEAR>.json for the record.
 *
 * Usage (local, TCP driver so it can reach Neon):
 *   POSTGRES_DRIVER=pg npx tsx scripts/generate-schedule.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { writeFileSync } from "node:fs";
import { db } from "@/lib/db";
import { seasons, franchises, franchiseSeasons, draftPicks } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getLeagueRosters, type SleeperResult } from "@/lib/sleeper";
import {
  assembleSchedule,
  validateSchedule,
  DIVISION_COUNT,
  TEAMS_PER_DIVISION,
  type Pair,
  type Week,
} from "@/lib/schedule/build-schedule";

// ===========================================================================
// CONFIG — the only knobs; divisions + finalists auto-populate from Sleeper
// ===========================================================================

const SEASON_YEAR = 2026; // season being scheduled

const DIVISIONAL_WEEKS = [6, 10, 14]; // 3 all-divisional weeks (must exclude wk 1)
const PRIMETIME_WEEK = 14; // which divisional week is the marquee showcase

// Optional friendly names for Sleeper's numbered divisions (1..3); labels only.
const DIVISION_NAMES: Record<number, string> = { 1: "Division 1", 2: "Division 2", 3: "Division 3" };

// Set to [championSlug, runnerUpSlug] to bypass finalist auto-derivation.
const FINALISTS_OVERRIDE: [string, string] | null = null;

// ===========================================================================

function unwrap<T>(result: SleeperResult<T>, what: string): T {
  if ("error" in result) {
    throw new Error(`Sleeper fetch failed (${what}): ${result.error.message}`);
  }
  return result.data;
}

type FranchiseMaps = {
  nameOf: (id: string) => string;
  idBySlug: Map<string, string>;
  nameBySlug: Map<string, string>;
};

async function loadFranchises(): Promise<FranchiseMaps> {
  const rows = await db
    .select({ id: franchises.id, slug: franchises.slug, name: franchises.name })
    .from(franchises);
  const nameById = new Map(rows.map((r) => [r.id, r.name]));
  return {
    nameOf: (id: string) => nameById.get(id) ?? id,
    idBySlug: new Map(rows.map((r) => [r.slug, r.id])),
    nameBySlug: new Map(rows.map((r) => [r.slug, r.name])),
  };
}

async function seasonForYear(year: number): Promise<{ id: number; leagueId: string } | null> {
  const [row] = await db
    .select({ id: seasons.id, leagueId: seasons.leagueId })
    .from(seasons)
    .where(eq(seasons.seasonYear, year));
  return row ?? null;
}

/**
 * Live divisions from Sleeper. Each roster carries settings.division (1..N);
 * we map roster_id -> franchise via franchise_seasons for the given season.
 * Returns divisions ordered by division number, as franchise-id groups.
 */
async function fetchDivisions(
  leagueId: string,
  seasonId: number,
): Promise<{ divisions: string[][]; numbers: number[] }> {
  const rosters = unwrap(await getLeagueRosters(leagueId), "league rosters");

  const fsRows = await db
    .select({ rosterId: franchiseSeasons.rosterId, franchiseId: franchiseSeasons.franchiseId })
    .from(franchiseSeasons)
    .where(eq(franchiseSeasons.seasonId, seasonId));
  const franchiseByRoster = new Map(fsRows.map((r) => [String(r.rosterId), r.franchiseId]));

  const byDivision = new Map<number, string[]>();
  for (const roster of rosters) {
    const division = (roster.settings as Record<string, unknown>).division;
    if (typeof division !== "number") {
      throw new Error(`roster ${roster.roster_id} has no numeric settings.division; are divisions set on Sleeper?`);
    }
    const franchiseId = franchiseByRoster.get(String(roster.roster_id));
    if (!franchiseId) {
      throw new Error(`no franchise mapping for roster ${roster.roster_id} in season ${SEASON_YEAR}`);
    }
    if (!byDivision.has(division)) byDivision.set(division, []);
    byDivision.get(division)!.push(franchiseId);
  }

  const numbers = [...byDivision.keys()].sort((a, b) => a - b);
  if (numbers.length !== DIVISION_COUNT) {
    throw new Error(`expected ${DIVISION_COUNT} divisions on Sleeper, found ${numbers.length}`);
  }
  for (const n of numbers) {
    const size = byDivision.get(n)!.length;
    if (size !== TEAMS_PER_DIVISION) {
      throw new Error(`division ${n} has ${size} teams, expected ${TEAMS_PER_DIVISION}`);
    }
  }
  return { divisions: numbers.map((n) => byDivision.get(n)!), numbers };
}

/**
 * Finalists via reverse draft order: the season's rookie draft round-1 slots
 * 11 (runner-up) and 12 (champion). Uses the ORIGINAL slot owner so traded
 * picks still resolve to the team whose finish set that draft position.
 * Returns franchise ids as [runnerUpId, championId], or null if unavailable.
 */
async function deriveFinalistsFromDraft(seasonId: number): Promise<[string, string] | null> {
  const picks = await db
    .select({
      pickNumber: draftPicks.pickNumber,
      franchiseId: draftPicks.franchiseId,
      originalFranchiseId: draftPicks.originalFranchiseId,
    })
    .from(draftPicks)
    .where(
      and(
        eq(draftPicks.seasonId, seasonId),
        eq(draftPicks.draftType, "rookie"),
        eq(draftPicks.round, 1),
        inArray(draftPicks.pickNumber, [11, 12]),
      ),
    );

  const slotOwner = (pickNumber: number): string | null => {
    const p = picks.find((x) => x.pickNumber === pickNumber);
    if (!p) return null;
    return p.originalFranchiseId ?? p.franchiseId ?? null;
  };

  const runnerUp = slotOwner(11); // slot 11 = runner-up
  const champion = slotOwner(12); // slot 12 = champion
  if (!runnerUp || !champion) return null;
  return [runnerUp, champion];
}

/**
 * Independent cross-check from the prior season's recorded playoff result.
 * Returns [runnerUpId, championId]. Used only to warn on disagreement.
 */
async function finalistsFromPlayoffResult(priorSeasonId: number): Promise<[string | null, string | null]> {
  const rows = await db
    .select({
      franchiseId: franchiseSeasons.franchiseId,
      playoffResult: franchiseSeasons.playoffResult,
    })
    .from(franchiseSeasons)
    .where(eq(franchiseSeasons.seasonId, priorSeasonId));

  const champ = rows.find((r) => r.playoffResult === "champion")?.franchiseId ?? null;
  const runnerUp = rows.find((r) => r.playoffResult === "runner_up")?.franchiseId ?? null;
  return [runnerUp, champ];
}

function printSchedule(weeks: Week[], nameOf: (id: string) => string): void {
  const line = "─".repeat(52);
  console.log(`\n${line}\n  ${SEASON_YEAR} REGULAR SEASON SCHEDULE\n${line}`);
  for (const week of weeks) {
    const tag =
      week.kind === "divisional"
        ? week.label === "Divisional — Primetime"
          ? "  ★ DIVISIONAL — PRIMETIME"
          : "  ★ DIVISIONAL"
        : week.label === "Finals rematch"
          ? "  (Finals rematch)"
          : "";
    console.log(`\nWEEK ${String(week.week).padStart(2)}${tag}`);
    for (const g of week.games) {
      const rivalry = g.sameDivision ? "  ·  division" : "";
      console.log(`   ${nameOf(g.a).padEnd(20)} vs  ${nameOf(g.b).padEnd(20)}${rivalry}`);
    }
  }
  console.log(`\n${line}\n`);
}

async function main() {
  const season = await seasonForYear(SEASON_YEAR);
  if (!season) {
    throw new Error(`no seasons row for ${SEASON_YEAR}; sync the season first`);
  }

  const fr = await loadFranchises();

  // --- Divisions: live from Sleeper ---
  const { divisions, numbers } = await fetchDivisions(season.leagueId, season.id);
  console.log("Divisions (from Sleeper):");
  divisions.forEach((ids, i) => {
    const label = DIVISION_NAMES[numbers[i]] ?? `Division ${numbers[i]}`;
    console.log(`  ${label}: ${ids.map(fr.nameOf).join(", ")}`);
  });

  // --- Finalists: pinned to week 1 ---
  let finalists: Pair;
  if (FINALISTS_OVERRIDE) {
    const [champSlug, runnerSlug] = FINALISTS_OVERRIDE;
    const champId = fr.idBySlug.get(champSlug);
    const runnerId = fr.idBySlug.get(runnerSlug);
    if (!champId || !runnerId) {
      throw new Error("FINALISTS_OVERRIDE slugs are not valid franchise slugs");
    }
    finalists = [runnerId, champId];
    console.log(`Finalists (override): champion ${fr.nameOf(champId)}, runner-up ${fr.nameOf(runnerId)}`);
  } else {
    const derived = await deriveFinalistsFromDraft(season.id);
    if (!derived) {
      throw new Error(
        `could not derive finalists from the ${SEASON_YEAR} rookie draft (round 1, slots 11/12); set FINALISTS_OVERRIDE`,
      );
    }
    finalists = derived;
    console.log(
      `Finalists (reverse draft order): champion ${fr.nameOf(derived[1])}, runner-up ${fr.nameOf(derived[0])}`,
    );

    const prior = await seasonForYear(SEASON_YEAR - 1);
    if (prior) {
      const [pRunner, pChamp] = await finalistsFromPlayoffResult(prior.id);
      if (pChamp && pChamp !== derived[1]) {
        console.warn(
          `⚠  cross-check: draft slot 12 = ${fr.nameOf(derived[1])} but ${SEASON_YEAR - 1} playoffResult champion = ${fr.nameOf(pChamp)}`,
        );
      }
      if (pRunner && pRunner !== derived[0]) {
        console.warn(
          `⚠  cross-check: draft slot 11 = ${fr.nameOf(derived[0])} but ${SEASON_YEAR - 1} playoffResult runner-up = ${fr.nameOf(pRunner)}`,
        );
      }
    }
  }

  const weeks = assembleSchedule({
    divisions,
    finalists,
    divisionalWeeks: DIVISIONAL_WEEKS,
    primetimeWeek: PRIMETIME_WEEK,
  });

  // Prove it: independent re-check of every constraint.
  validateSchedule(weeks, divisions, finalists);

  printSchedule(weeks, fr.nameOf);

  const outPath = `schedule-${SEASON_YEAR}.json`;
  const payload = {
    seasonYear: SEASON_YEAR,
    divisions: divisions.map((ids, i) => ({
      number: numbers[i],
      name: DIVISION_NAMES[numbers[i]] ?? `Division ${numbers[i]}`,
      teams: ids.map((id) => fr.nameOf(id)),
    })),
    weeks: weeks.map((w) => ({
      week: w.week,
      kind: w.kind,
      label: w.label,
      games: w.games.map((g) => ({
        a: fr.nameOf(g.a),
        b: fr.nameOf(g.b),
        sameDivision: g.sameDivision,
      })),
    })),
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
