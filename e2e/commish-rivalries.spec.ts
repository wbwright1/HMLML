import { test, expect } from "@playwright/test";
import { getSql } from "./helpers/sql";
import { membersTableExists, memberFixtureScope } from "./helpers/seed-members";
import { readRivalry, rivalriesTableExists, cleanupRivalry } from "./helpers/seed-rivalry";

// ============================================================================
// /commish Rivalries: create, reject a duplicate, edit, delete, all through the
// real server-action forms against the real database.
//
// Scope-isolated: the commish, their franchise and the second franchise are
// unique to this file, so seedMatchupData()'s shared e2e-4-1 franchises (which
// other specs delete and recreate in parallel) are never touched.
// ============================================================================

const fx = memberFixtureScope("rivalries");
const NEMESIS = {
  id: "e2e-member-rivalries-archrival",
  slug: "e2e-member-rivalries-archrival-team",
  name: "E2E rivalries Nemesis",
};
const RIVALRY_NAME = "The E2E Console Feud";

test.describe.configure({ mode: "serial" });

let ready = false;

async function removeNemesis() {
  const sql = getSql();
  await sql`DELETE FROM "franchises" WHERE "id" = ${NEMESIS.id}`;
}

test.beforeAll(async () => {
  // Migration 0017 is applied to the live DB, so a missing rivalries table is
  // a broken environment, not a reason to skip: fail loudly (as
  // rivalries-named.spec.ts does) instead of reporting a green run that
  // exercised nothing.
  if (!(await rivalriesTableExists())) {
    throw new Error("rivalries table missing: apply migration 0017 first");
  }
  ready = await membersTableExists();
  if (!ready) return;
  await fx.seed();
  await removeNemesis();
  const sql = getSql();
  await sql`INSERT INTO "franchises" ("id", "slug", "name", "abbreviation")
    VALUES (${NEMESIS.id}, ${NEMESIS.slug}, ${NEMESIS.name}, 'NM')`;
});

test.afterAll(async () => {
  if (!ready) return;
  await cleanupRivalry(fx.franchiseId, NEMESIS.id);
  await removeNemesis();
  await fx.cleanup();
});

test.beforeEach(async () => {
  test.skip(!ready, "members table not present");
});

test("the commish creates, edits and deletes a named rivalry", async ({ page }) => {
  await page.goto("/claim");
  await page.fill("#code", fx.commishClaimCode);
  await page.getByRole("button", { name: /claim my team/i }).click();
  await page.waitForURL("/");
  await page.goto("/commish");

  const createForm = page.getByRole("form", { name: "Name a rivalry" });

  // ---- Create, picking the franchises in NON-canonical order -------------
  // fx.franchiseId ("e2e-member-rivalries-franchise") sorts AFTER
  // NEMESIS.id ("e2e-member-rivalries-archrival"), so choosing the fixture
  // franchise first proves the action canonicalizes before it writes.
  expect(fx.franchiseId > NEMESIS.id).toBe(true);
  await createForm.getByLabel("Franchise").selectOption({ label: fx.franchiseName });
  await createForm.getByLabel("Rival").selectOption({ label: NEMESIS.name });
  await createForm.getByLabel("Name", { exact: true }).fill(RIVALRY_NAME);
  await createForm.getByLabel("Tagline (optional)").fill("First draft of the grudge.");
  await createForm.getByLabel("Origin year (optional)").fill("2021");
  await createForm.getByRole("button", { name: "Save rivalry" }).click();

  await page.waitForURL(/rivalry=created/);
  await expect(page.locator("#rivalries").getByRole("status")).toContainText("Rivalry saved");
  const card = page.locator("[data-rivalry-id]").filter({ hasText: RIVALRY_NAME });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText(fx.franchiseName);
  await expect(card).toContainText(NEMESIS.name);

  const created = await readRivalry(fx.franchiseId, NEMESIS.id);
  expect(created).not.toBeNull();
  expect(created!.franchise_a_id).toBe(NEMESIS.id);
  expect(created!.franchise_b_id).toBe(fx.franchiseId);
  expect(created!.name).toBe(RIVALRY_NAME);
  expect(created!.tagline).toBe("First draft of the grudge.");
  expect(created!.origin).toBeNull();
  expect(created!.origin_year).toBe(2021);

  // ---- A duplicate pair (other order) is refused, not double-written -------
  await createForm.getByLabel("Franchise").selectOption({ label: NEMESIS.name });
  await createForm.getByLabel("Rival").selectOption({ label: fx.franchiseName });
  await createForm.getByLabel("Name", { exact: true }).fill("A Second Name");
  await createForm.getByRole("button", { name: "Save rivalry" }).click();
  await page.waitForURL(/rivalryError=duplicate-pair/);
  await expect(page.locator("#rivalries").getByRole("alert")).toContainText("already have a named rivalry");
  const sql = getSql();
  const count = await sql`SELECT count(*)::int AS c FROM "rivalries"
    WHERE "franchise_a_id" = ${NEMESIS.id} AND "franchise_b_id" = ${fx.franchiseId}`;
  expect(count[0].c).toBe(1);

  // ---- Edit ----------------------------------------------------------------
  await card.getByText(`Edit ${RIVALRY_NAME}`).click();
  const editForm = page.getByRole("form", { name: `Edit ${RIVALRY_NAME}` });
  await editForm.getByLabel("Tagline (optional)").fill("Revised grudge, same energy.");
  await editForm.getByLabel("Origin year (optional)").fill("");
  await editForm.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(/rivalry=updated/);
  await expect(card).toContainText("Revised grudge, same energy.");

  const edited = await readRivalry(fx.franchiseId, NEMESIS.id);
  expect(edited!.id).toBe(created!.id);
  expect(edited!.tagline).toBe("Revised grudge, same energy.");
  expect(edited!.origin_year).toBeNull();

  // ---- Delete --------------------------------------------------------------
  await card.getByRole("button", { name: `Delete ${RIVALRY_NAME}` }).click();
  await page.waitForURL(/rivalry=deleted/);
  await expect(page.locator("#rivalries").getByRole("status")).toContainText("Rivalry deleted");
  await expect(card).toHaveCount(0);
  expect(await readRivalry(fx.franchiseId, NEMESIS.id)).toBeNull();
});

test("a crafted message param renders nothing", async ({ page }) => {
  await page.goto("/claim");
  await page.fill("#code", fx.commishClaimCode);
  await page.getByRole("button", { name: /claim my team/i }).click();
  await page.waitForURL("/");
  await page.goto("/commish?rivalryError=Send%20your%20password%20here#rivalries");
  await expect(page.getByRole("heading", { name: "Rivalries" })).toBeVisible();
  await expect(page.getByText("Send your password here")).toHaveCount(0);
  await expect(page.locator("#rivalries [role=alert]")).toHaveCount(0);
});
