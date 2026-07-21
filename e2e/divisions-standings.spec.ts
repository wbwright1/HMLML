import { test, expect } from "@playwright/test";
import {
  seedDivisionData,
  cleanupDivisionData,
  buildFixture,
  SEASON_YEAR,
  DIVISIONS,
} from "./helpers/seed-divisions";

// ============================================================================
// Issue #11: Standings by division
//
// Verifies the /records page's leaderboard groups a single season's teams by
// division, with a division header carrying the aggregate division record,
// and teams sorted within each division by record (RISK-A: never
// standingsFinish). These assertions only pass if the real grouped query in
// lib/queries/divisions.ts / lib/queries/records.ts ran — a flat,
// ungrouped table would fail the header-presence checks below.
// ============================================================================

test.describe("Standings by division", () => {
  let seasonId: number;
  const fixture = buildFixture(SEASON_YEAR);

  test.beforeAll(async () => {
    seasonId = await seedDivisionData(SEASON_YEAR);
  });

  test.afterAll(async () => {
    await cleanupDivisionData(seasonId, SEASON_YEAR);
  });

  test("records page shows division headers and per-division records for the seeded season", async ({
    page,
  }) => {
    await page.goto("/records");

    // Select the seeded historical season via the season picker (a role="tab").
    const seasonTab = page.getByRole("tab", { name: String(SEASON_YEAR) });
    await expect(seasonTab).toBeVisible({ timeout: 15000 });
    await seasonTab.click();

    // Division East header shows the aggregate record: A(5-3) + B(4-4) + C(2-6) = 11-13.
    const eastHeader = page.getByText(DIVISIONS.east.name, { exact: true }).first();
    await expect(eastHeader).toBeVisible();
    await expect(eastHeader.locator("xpath=ancestor::p[1]")).toContainText("11-13");

    // Division West header shows the aggregate record: D(7-1) + E(6-2) + F(4-4) = 17-7.
    const westHeader = page.getByText(DIVISIONS.west.name, { exact: true }).first();
    await expect(westHeader).toBeVisible();
    await expect(westHeader.locator("xpath=ancestor::p[1]")).toContainText("17-7");

    // Every seeded team name appears somewhere on the page.
    for (const f of Object.values(fixture.franchises)) {
      await expect(page.getByText(f.name).first()).toBeVisible();
    }

    // Within Division East, Alpha (5-3) must render above Bravo (4-4) above
    // Charlie (2-6) — proves the real per-division record sort ran (RISK-A),
    // not an arbitrary/insertion order.
    const bodyText = await page.locator("body").innerText();
    const alphaIdx = bodyText.indexOf(fixture.franchises.a.name);
    const bravoIdx = bodyText.indexOf(fixture.franchises.b.name);
    const charlieIdx = bodyText.indexOf(fixture.franchises.c.name);
    expect(alphaIdx).toBeGreaterThan(-1);
    expect(bravoIdx).toBeGreaterThan(-1);
    expect(charlieIdx).toBeGreaterThan(-1);
    expect(alphaIdx).toBeLessThan(bravoIdx);
    expect(bravoIdx).toBeLessThan(charlieIdx);
  });
});
