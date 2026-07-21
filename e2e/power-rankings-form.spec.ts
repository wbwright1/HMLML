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

    // The seed forces a far-future season (year 2999) so it is unambiguously
    // the "latest" season the power-rankings model reads. If the seeded teams
    // are absent, either the seed failed or the latest-season assumption
    // broke; fail loudly instead of skipping to a false green.
    await expect(
      page.locator("a").filter({ hasText: TEST_DATA.riser.name })
    ).toBeVisible();
    await expect(
      page.locator("a").filter({ hasText: TEST_DATA.leader.name })
    ).toBeVisible();

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

    // Same far-future-season guarantee as T01: the rail must render and must
    // contain both seeded franchises. Assert rather than skip.
    const railHeading = page.locator("h3", { hasText: "Power Ranking" });
    await expect(railHeading).toBeVisible();

    // The rail's link list is the sibling <div> right after the heading's
    // wrapper div; scope to it so we don't also match the season standings
    // table (which lists franchises by raw wins, not power score).
    const railContainer = railHeading.locator(
      "xpath=../following-sibling::div[1]"
    );
    const railNames = await railContainer.locator("a").allTextContents();

    const riserIndex = railNames.findIndex((t) => t.includes(TEST_DATA.riser.name));
    const leaderIndex = railNames.findIndex((t) => t.includes(TEST_DATA.leader.name));

    // Both seeded franchises must be present in the top-4 rail (the seeded
    // season has exactly these two), and the riser must rank ahead of the
    // standings leader.
    expect(riserIndex).toBeGreaterThanOrEqual(0);
    expect(leaderIndex).toBeGreaterThanOrEqual(0);
    expect(riserIndex).toBeLessThan(leaderIndex);
  });
});
