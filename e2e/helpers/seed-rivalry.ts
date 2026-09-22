import { getSql } from "./sql";
import { TEST_DATA } from "./seed-matchups";

/**
 * Seeds / removes one named rivalry row for e2e specs.
 *
 * Defaults to the e2e-4-1 franchises A and B from seed-matchups.ts, so a spec
 * calls seedMatchupData() first (the FKs need those franchise rows), then
 * seedRivalry(), then POSTs /api/revalidate so ISR-cached pages pick it up.
 * The rivalries FKs cascade, so cleanupMatchupData() deleting the franchises
 * also removes the row; cleanupRivalry() is still the explicit teardown.
 *
 * The pair is stored in canonical byte order (the table's CHECK), whatever
 * order the ids are passed in.
 */

export const E2E_RIVALRY = {
  franchiseOneId: TEST_DATA.franchiseA.id,
  franchiseTwoId: TEST_DATA.franchiseB.id,
  name: "The E2E Grudge Match",
  tagline: "Alpha and Bravo have never once agreed on a trade.",
  origin: "Seeded by the e2e suite. Any resemblance to real grudges is intended.",
  originYear: null as number | null,
  trophyName: null as string | null,
};

export type RivalrySeedInput = typeof E2E_RIVALRY;

function canonical(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** True once migration 0017 (the rivalries table) is applied. */
export async function rivalriesTableExists(): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`SELECT to_regclass('public.rivalries') AS t`;
  return rows[0]?.t != null;
}

/** Upserts the rivalry on its pair and returns the row id. */
export async function seedRivalry(
  overrides: Partial<RivalrySeedInput> = {},
): Promise<number> {
  const r = { ...E2E_RIVALRY, ...overrides };
  const [a, b] = canonical(r.franchiseOneId, r.franchiseTwoId);
  const sql = getSql();
  const rows = await sql`
    INSERT INTO "rivalries"
      ("franchise_a_id", "franchise_b_id", "name", "tagline", "origin", "origin_year", "trophy_name")
    VALUES (${a}, ${b}, ${r.name}, ${r.tagline}, ${r.origin}, ${r.originYear}, ${r.trophyName})
    ON CONFLICT ("franchise_a_id", "franchise_b_id") DO UPDATE SET
      "name" = EXCLUDED."name",
      "tagline" = EXCLUDED."tagline",
      "origin" = EXCLUDED."origin",
      "origin_year" = EXCLUDED."origin_year",
      "trophy_name" = EXCLUDED."trophy_name",
      "updated_at" = now()
    RETURNING "id"`;
  return Number(rows[0].id);
}

/** Deletes the rivalry for a pair (either order). Defaults to the E2E pair. */
export async function cleanupRivalry(
  franchiseOneId: string = E2E_RIVALRY.franchiseOneId,
  franchiseTwoId: string = E2E_RIVALRY.franchiseTwoId,
): Promise<void> {
  const [a, b] = canonical(franchiseOneId, franchiseTwoId);
  const sql = getSql();
  await sql`DELETE FROM "rivalries" WHERE "franchise_a_id" = ${a} AND "franchise_b_id" = ${b}`;
}

/** Reads the stored row for a pair (either order), or null. */
export async function readRivalry(
  franchiseOneId: string,
  franchiseTwoId: string,
): Promise<Record<string, unknown> | null> {
  const [a, b] = canonical(franchiseOneId, franchiseTwoId);
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM "rivalries" WHERE "franchise_a_id" = ${a} AND "franchise_b_id" = ${b}`;
  return rows[0] ?? null;
}
