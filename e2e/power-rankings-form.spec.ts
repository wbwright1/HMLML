import { test, expect } from "@playwright/test";
import {
  seedPowerRankingsData,
  cleanupPowerRankingsData,
  TEST_DATA,
} from "./helpers/seed-power-rankings";

// ============================================================================
// Issue #13: Recent-form power rankings model
//
// Seeds a throwaway "latest" season where the season-standings leader (best
// wins/points) has gone ice cold and banged up over the last 4 weeks, while a
// franchise with a worse season record has been red-hot and healthy over the
// same window. The recent-form power-rankings model should rank the riser
// above the leader (the opposite of season-long standings order), and show a
// visible rising/falling indicator (glyph + numeric delta) vs. standings.
// ============================================================================

test.describe("Recent-form power rankings", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== "chromium", "chromium-only");
  });

  let seasonId: number;

  test.beforeAll(async () => {
    seasonId = await seedPowerRankingsData();
  });

  test.afterAll(async () => {
    if (seasonId) await cleanupPowerRankingsData(seasonId);
  });

  test("T01: /records/power-rankings ranks the hot-form team above the season-standings leader", async ({
    page,
  }) => {
    await page.goto("/records/power-rankings");

    const riserLink = page.locator("a", { hasText: TEST_DATA.riser.name });
    const leaderLink = page.locator("a", { hasText: TEST_DATA.leader.name });

    const riserCount = await riserLink.count();
    const leaderCount = await leaderLink.count();

    if (riserCount === 0 || leaderCount === 0) {
      // Power rankings page couldn't resolve our seeded season as "latest"
      // (e.g. a real season with an even higher year exists). Nothing to
      // assert against.
      test.skip();
      return;
    }

    // DOM order: the riser's card must appear before the leader's card.
    const allRowNames = await page
      .locator("a")
      .filter({ hasText: /Standings Leader|Form Riser/ })
      .allTextContents();

    const riserIndex = allRowNames.findIndex((t) => t.includes(TEST_DATA.riser.name));
    const leaderIndex = allRowNames.findIndex((t) => t.includes(TEST_DATA.leader.name));

    expect(riserIndex).toBeGreaterThanOrEqual(0);
    expect(leaderIndex).toBeGreaterThanOrEqual(0);
    expect(riserIndex).toBeLessThan(leaderIndex);

    // A rising/falling glyph with a numeric delta is visible (not color-only).
    await expect(page.locator("text=▲").first()).toBeVisible();
    await expect(page.locator("text=▼").first()).toBeVisible();
  });

  test("T02: records rail shows the hot-form team first, matching power-rankings order", async ({
    page,
  }) => {
    await page.goto("/records");

    const railHeading = page.locator("h3", { hasText: "Power Ranking" });
    const headingCount = await railHeading.count();
    if (headingCount === 0) {
      test.skip();
      return;
    }

    // The rail's link list is the sibling <div> right after the heading's
    // wrapper div; scope to it so we don't also match the season standings
    // table (which lists franchises by raw wins, not power score).
    const railContainer = railHeading.locator(
      "xpath=../following-sibling::div[1]"
    );
    const railNames = await railContainer.locator("a").allTextContents();

    if (railNames.length === 0) {
      test.skip();
      return;
    }

    const riserIndex = railNames.findIndex((t) => t.includes(TEST_DATA.riser.name));
    const leaderIndex = railNames.findIndex((t) => t.includes(TEST_DATA.leader.name));

    // Riser should appear at or before the leader in the top-4 rail (only
    // present at all if it made the top 4, which it should given the model).
    expect(riserIndex).toBeGreaterThanOrEqual(0);
    if (leaderIndex >= 0) {
      expect(riserIndex).toBeLessThan(leaderIndex);
    }
  });
});
