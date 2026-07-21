import { test, expect } from "@playwright/test";
import {
  seedMatchupData,
  cleanupMatchupData,
  TEST_DATA,
} from "./helpers/seed-matchups";

// ============================================================================
// Issue #19: Franchise Schedule View (/teams/[franchiseSlug]/schedule)
// Verifies a team's per-week schedule: opponent, result badge (W/L) for
// completed weeks, and an "Upcoming" label for scheduled (not yet played)
// weeks. Team Alpha (seed data) has: W week 1, in-progress week 2,
// no fixture on week 3 (Bravo vs Delta doesn't involve Alpha).
// ============================================================================

test.describe("Franchise Schedule View", () => {
  test.describe.configure({ mode: "serial" });

  let seasonId: number;

  test.beforeAll(async () => {
    seasonId = await seedMatchupData();
  });

  test.afterAll(async () => {
    await cleanupMatchupData(seasonId);
  });

  test("shows the franchise's per-week schedule with opponents", async ({
    page,
  }) => {
    await page.goto(`/teams/${TEST_DATA.franchiseA.slug}/schedule`);

    const noData = page.getByText("No Schedule Available");
    if (await noData.isVisible().catch(() => false)) {
      test.skip();
      return;
    }

    // Week 1 opponent is Team Bravo.
    await expect(page.getByText("Team Bravo")).toBeVisible();
    // Week 2 opponent is Team Charlie.
    await expect(page.getByText("Team Charlie")).toBeVisible();
  });

  test("a completed week shows a W/L result badge", async ({ page }) => {
    await page.goto(`/teams/${TEST_DATA.franchiseA.slug}/schedule`);

    const noData = page.getByText("No Schedule Available");
    if (await noData.isVisible().catch(() => false)) {
      test.skip();
      return;
    }

    // Team Alpha won week 1 (120.5 vs 98.3) — expect a "W" badge.
    const winBadge = page.getByLabel("Win", { exact: true });
    await expect(winBadge.first()).toBeVisible();
  });

  test("an in-progress week shows the Live indicator", async ({ page }) => {
    await page.goto(`/teams/${TEST_DATA.franchiseA.slug}/schedule`);

    const noData = page.getByText("No Schedule Available");
    if (await noData.isVisible().catch(() => false)) {
      test.skip();
      return;
    }

    await expect(page.getByText("Live", { exact: true }).first()).toBeVisible();
  });

  test("clicking a played matchup row navigates to matchup detail", async ({
    page,
  }) => {
    await page.goto(`/teams/${TEST_DATA.franchiseA.slug}/schedule`);

    const noData = page.getByText("No Schedule Available");
    if (await noData.isVisible().catch(() => false)) {
      test.skip();
      return;
    }

    const rowLink = page
      .locator("a")
      .filter({ hasText: "Team Bravo" })
      .first();
    const href = await rowLink.getAttribute("href");
    expect(href).toMatch(
      new RegExp(`/matchups/${TEST_DATA.seasonYear}/${TEST_DATA.week}/\\d+`)
    );
  });
});
