import { test, expect } from "@playwright/test";
import {
  seedMatchupData,
  cleanupMatchupData,
  TEST_DATA,
} from "./helpers/seed-matchups";

// ============================================================================
// Issue #19: Franchise Schedule View (/teams/[franchiseSlug]/schedule)
// Verifies a team's per-week schedule: opponent, result badge (W/L) for
// completed weeks, and a Live indicator for in-progress weeks. Team Alpha
// (seed data) has: W week 1 (vs Team Bravo, 120.5-98.3), in-progress week 2
// (vs Team Charlie, 42.1-38.6). It has no fixture on week 3 (Bravo vs Delta).
//
// These tests use HARD assertions, not skip-guards: seedMatchupData() in
// beforeAll guarantees this franchise's schedule exists, so a page that
// renders "No Schedule Available" (feature regressed, e.g. getFranchiseSchedule
// returning an empty array) MUST fail this suite, never skip to green.
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

    // The seeded franchise HAS a schedule, so the empty state must not show.
    await expect(page.getByText("No Schedule Available")).toHaveCount(0);

    // Week 1 opponent is Team Bravo; week 2 opponent is Team Charlie.
    await expect(page.getByText("Team Bravo")).toBeVisible();
    await expect(page.getByText("Team Charlie")).toBeVisible();
  });

  test("a completed week shows a W/L result badge with scores", async ({
    page,
  }) => {
    await page.goto(`/teams/${TEST_DATA.franchiseA.slug}/schedule`);

    await expect(page.getByText("No Schedule Available")).toHaveCount(0);

    // Team Alpha won week 1 (120.5 vs 98.3) — expect a "W" badge and scores.
    await expect(page.getByLabel("Win", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("120.5")).toBeVisible();
  });

  test("an in-progress week shows the Live indicator", async ({ page }) => {
    await page.goto(`/teams/${TEST_DATA.franchiseA.slug}/schedule`);

    await expect(page.getByText("No Schedule Available")).toHaveCount(0);

    await expect(page.getByText("Live", { exact: true }).first()).toBeVisible();
  });

  test("clicking a played matchup row navigates to matchup detail", async ({
    page,
  }) => {
    await page.goto(`/teams/${TEST_DATA.franchiseA.slug}/schedule`);

    await expect(page.getByText("No Schedule Available")).toHaveCount(0);

    const rowLink = page
      .locator("a")
      .filter({ hasText: "Team Bravo" })
      .first();
    await expect(rowLink).toBeVisible();

    const href = await rowLink.getAttribute("href");
    expect(href).toMatch(
      new RegExp(`/matchups/${TEST_DATA.seasonYear}/${TEST_DATA.week}/\\d+`)
    );
  });
});
