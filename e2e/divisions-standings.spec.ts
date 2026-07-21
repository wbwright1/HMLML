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

    // Division header rows carry the aggregate division record. Key off the
    // unique aggregate (only produced by summing this season's grouped rows)
    // and assert the paired division name, rather than off the shared
    // division name (which also appears in the projection rail and could
    // belong to the parallel "latest season" spec). East: A(5-5)+B(4-6)+
    // C(3-7)+D(2-8) = 14-26; West: 9-1+8-2+7-3+7-3 = 31-9; North: 9-1+8-2+
    // 4-6+1-9 = 22-18.
    const eastAgg = page.locator("p").filter({ hasText: "14-26" }).first();
    await expect(eastAgg).toBeVisible();
    await expect(eastAgg).toContainText(DIVISIONS.east.name);

    const westAgg = page.locator("p").filter({ hasText: "31-9" }).first();
    await expect(westAgg).toBeVisible();
    await expect(westAgg).toContainText(DIVISIONS.west.name);

    const northAgg = page.locator("p").filter({ hasText: "22-18" }).first();
    await expect(northAgg).toBeVisible();
    await expect(northAgg).toContainText(DIVISIONS.north.name);

    // Every seeded team name appears somewhere on the page.
    for (const franchise of Object.values(fixture.franchises)) {
      await expect(page.getByText(franchise.name).first()).toBeVisible();
    }

    // Within Division East, Alpha (5-5) must render above Bravo (4-6) above
    // Charlie (3-7) above Delta (2-8) — proves the real per-division record
    // sort ran (RISK-A), not an arbitrary/insertion order.
    const bodyText = await page.locator("body").innerText();
    const alphaIdx = bodyText.indexOf(fixture.franchises.a.name);
    const bravoIdx = bodyText.indexOf(fixture.franchises.b.name);
    const charlieIdx = bodyText.indexOf(fixture.franchises.c.name);
    const deltaIdx = bodyText.indexOf(fixture.franchises.d.name);
    expect(alphaIdx).toBeGreaterThan(-1);
    expect(bravoIdx).toBeGreaterThan(-1);
    expect(charlieIdx).toBeGreaterThan(-1);
    expect(deltaIdx).toBeGreaterThan(-1);
    expect(alphaIdx).toBeLessThan(bravoIdx);
    expect(bravoIdx).toBeLessThan(charlieIdx);
    expect(charlieIdx).toBeLessThan(deltaIdx);
  });
});
