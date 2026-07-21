import { test, expect } from "@playwright/test";
import {
  seedMatchupData,
  cleanupMatchupData,
  TEST_DATA,
} from "./helpers/seed-matchups";

// ============================================================================
// Issue #19: League Schedule View (/schedule)
// Verifies the full-season schedule page groups matchups by week heading,
// links each row to matchup detail, and distinguishes completed weeks
// (score + Final) from in-progress (Live) and upcoming (vs, no score) weeks.
//
// These tests use HARD assertions, not skip-guards: seedMatchupData() in
// beforeAll guarantees the schedule content exists, so a page that renders
// empty (feature regressed, e.g. getSeasonSchedule returning an empty Map)
// MUST fail this suite, never skip to green.
// ============================================================================

test.describe("League Schedule View", () => {
  test.describe.configure({ mode: "serial" });

  let seasonId: number;

  test.beforeAll(async () => {
    seasonId = await seedMatchupData();
  });

  test.afterAll(async () => {
    await cleanupMatchupData(seasonId);
  });

  test("shows a week heading for each seeded week (1, 2, 3)", async ({
    page,
  }) => {
    await page.goto(`/schedule?season=${TEST_DATA.seasonYear}`);

    // Seed data spans weeks 1, 2, and 3 — all three headings must render.
    const weekHeadings = page.locator("h3").filter({ hasText: /^Week/ });
    await expect(weekHeadings).toHaveCount(3);
    await expect(
      page.locator("h3").filter({ hasText: `${TEST_DATA.week}` })
    ).toBeVisible();
    await expect(
      page.locator("h3").filter({ hasText: `${TEST_DATA.weekInProgress}` })
    ).toBeVisible();
    await expect(
      page.locator("h3").filter({ hasText: `${TEST_DATA.weekScheduled}` })
    ).toBeVisible();
  });

  test("a completed week (week 1) shows a Final result with scores", async ({
    page,
  }) => {
    await page.goto(`/schedule?season=${TEST_DATA.seasonYear}`);

    // Team Alpha's completed week-1 matchup shows its final score and the
    // "Final" label (matches components/matchup-row.tsx's final variant).
    const alphaRow = page
      .locator('[role="group"]')
      .filter({ hasText: "Team Alpha" })
      .first();
    await expect(alphaRow).toBeVisible();
    await expect(alphaRow.getByText("Final", { exact: false })).toBeVisible();
    await expect(alphaRow.getByText("120.5")).toBeVisible();
  });

  test("an in-progress week (week 2) shows the Live indicator with scores", async ({
    page,
  }) => {
    await page.goto(`/schedule?season=${TEST_DATA.seasonYear}`);

    // Week 2 pairs Team Alpha (42.1) vs Team Charlie (38.6), in progress.
    const liveRow = page
      .locator('[role="group"]')
      .filter({ hasText: "Team Charlie" })
      .filter({ hasText: "Team Alpha" })
      .first();
    await expect(liveRow).toBeVisible();
    await expect(liveRow.getByText("Live", { exact: true })).toBeVisible();
    await expect(liveRow.getByText("42.1")).toBeVisible();
  });

  test("an upcoming week (week 3) shows 'vs' with no score", async ({
    page,
  }) => {
    await page.goto(`/schedule?season=${TEST_DATA.seasonYear}`);

    // Week 3 pairs Team Bravo vs Team Delta, scheduled (points 0, not played).
    const upcomingRow = page
      .locator('[role="group"]')
      .filter({ hasText: "Team Bravo" })
      .filter({ hasText: "Team Delta" })
      .first();
    await expect(upcomingRow).toBeVisible();
    // Preview variant renders "vs" instead of scores.
    await expect(upcomingRow.getByText("vs", { exact: true })).toBeVisible();
    // No score text should appear for this scheduled matchup.
    await expect(upcomingRow.getByText("0.0")).toHaveCount(0);
  });

  test("clicking a matchup row navigates to matchup detail", async ({
    page,
  }) => {
    await page.goto(`/schedule?season=${TEST_DATA.seasonYear}`);

    const alphaLink = page
      .locator("a")
      .filter({ hasText: "Team Alpha" })
      .first();
    await expect(alphaLink).toBeVisible();

    const href = await alphaLink.getAttribute("href");
    expect(href).toMatch(
      new RegExp(`/matchups/${TEST_DATA.seasonYear}/${TEST_DATA.week}/\\d+`)
    );
  });

  test("empty state renders for a data-less season", async ({ page }) => {
    // A season year that has no seeded matchups. The page must render the
    // "No Schedule Available" empty state and NO week headings — not crash,
    // not 404.
    await page.goto("/schedule?season=1900");

    await expect(
      page.getByText("No Schedule Available").first()
    ).toBeVisible();
    await expect(
      page.locator("h3").filter({ hasText: /^Week/ })
    ).toHaveCount(0);
  });
});
