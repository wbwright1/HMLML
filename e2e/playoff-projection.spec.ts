import { test, expect } from "@playwright/test";
import {
  seedDivisionData,
  cleanupDivisionData,
  buildFixture,
  LATEST_SEASON_YEAR,
} from "./helpers/seed-divisions";

// ============================================================================
// Issue #12: Playoff projection
//
// Seeds the DB's *latest* season (by seasonYear DESC) with the division
// fixture so the records page's "Projected Playoff Field" block — which
// only renders for the current season — picks up the real data. Assertions
// below are only satisfiable by the real seeding/tiebreak rules in
// lib/queries/divisions.ts:
//   - both division winners qualify even though a non-winner elsewhere has a
//     better overall record (division winners always auto-qualify)
//   - seed order reflects the tiebreak chain
//   - the H2H sweep decides the contested wildcard seed
//   - the bubble team is named as "First Out"
// A flat top-6-by-record implementation (i.e. the feature deleted) would
// fail the "division winner over wildcard-caliber team" assertion.
// ============================================================================

test.describe("Playoff projection", () => {
  let seasonId: number;
  const fixture = buildFixture(LATEST_SEASON_YEAR);

  test.beforeAll(async () => {
    seasonId = await seedDivisionData(LATEST_SEASON_YEAR);
  });

  test.afterAll(async () => {
    await cleanupDivisionData(seasonId, LATEST_SEASON_YEAR);
  });

  test("records page projects both division winners in ahead of a better-record non-winner, with H2H deciding the bubble", async ({
    page,
  }) => {
    await page.goto("/records");

    const heading = page.getByText("Projected Playoff Field", { exact: true });
    await expect(heading).toBeVisible({ timeout: 15000 });

    const fieldSection = heading.locator("xpath=following-sibling::div[1]");

    // Alpha (division East winner, 5-3) qualifies even though Echo (division
    // West non-winner, 6-2) has a better overall record — division winners
    // always auto-qualify.
    await expect(fieldSection).toContainText(fixture.franchises.a.name);
    await expect(fieldSection).toContainText(fixture.franchises.e.name);

    // Delta (division West winner, 7-1) also qualifies.
    await expect(fieldSection).toContainText(fixture.franchises.d.name);

    // Seed order: Delta (7-1, div winner) must appear before Alpha (5-3, div
    // winner) — division winners are seeded by the same tiebreak chain among
    // themselves, and Delta's record is better.
    const sectionText = await fieldSection.innerText();
    const deltaIdx = sectionText.indexOf(fixture.franchises.d.name);
    const alphaIdx = sectionText.indexOf(fixture.franchises.a.name);
    expect(deltaIdx).toBeGreaterThan(-1);
    expect(alphaIdx).toBeGreaterThan(-1);
    expect(deltaIdx).toBeLessThan(alphaIdx);

    // Bravo and Foxtrot are tied 4-4 overall; Bravo swept their head-to-head
    // 2-0, so Bravo must out-seed Foxtrot for the contested wildcard slot.
    const bravoIdx = sectionText.indexOf(fixture.franchises.b.name);
    const foxtrotIdx = sectionText.indexOf(fixture.franchises.f.name);
    const bravoQualifies = bravoIdx !== -1;
    const foxtrotQualifies = foxtrotIdx !== -1;

    if (bravoQualifies && foxtrotQualifies) {
      expect(bravoIdx).toBeLessThan(foxtrotIdx);
    } else {
      // Only one of the two tied teams makes the 6-team field (or one is the
      // named bubble team) — Bravo, the H2H winner, must be the one in.
      expect(bravoQualifies).toBe(true);
      // Foxtrot, the H2H loser, should be named as the bubble ("First Out").
      await expect(page.getByText("First Out")).toBeVisible();
      const bubbleRow = page.getByText("First Out").locator("xpath=ancestor::div[1]");
      await expect(bubbleRow).toContainText(fixture.franchises.f.name);
    }
  });
});
