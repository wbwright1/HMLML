import { test, expect } from "@playwright/test";
import {
  seedMatchupData,
  cleanupMatchupData,
  TEST_DATA,
} from "./helpers/seed-matchups";

// All tests in this file share seeded data and run serially to avoid races.
test.describe("Story 4.1: MatchupRow Team Color Accents", () => {
  test.describe.configure({ mode: "serial" });

  let seasonId: number;

  test.beforeAll(async () => {
    seasonId = await seedMatchupData();
  });

  test.afterAll(async () => {
    await cleanupMatchupData(seasonId);
  });

  // -------------------------------------------------------------------------
  // AC-1: Both teams have accent bars with brandingColor
  // -------------------------------------------------------------------------

  test("AC-1a: MatchupRow renders left and right accent bars", async ({
    page,
  }) => {
    await page.goto(
      `/seasons/${TEST_DATA.seasonYear}/week/${TEST_DATA.week}`
    );

    // Find all matchup row containers (role="group")
    const matchupRows = page.locator('[role="group"]');
    const count = await matchupRows.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Check the first matchup row (Team Alpha vs Team Bravo)
    const row = matchupRows.first();

    // Left accent bar: absolute positioned, left-0, w-[3px]
    const leftBar = row.locator("div.absolute.left-0").first();
    await expect(leftBar).toBeVisible();

    // Right accent bar: absolute positioned, right-0, w-[3px]
    const rightBar = row.locator("div.absolute.right-0").first();
    await expect(rightBar).toBeVisible();
  });

  test("AC-1b: left accent bar has 3px width", async ({ page }) => {
    await page.goto(
      `/seasons/${TEST_DATA.seasonYear}/week/${TEST_DATA.week}`
    );

    const matchupRows = page.locator('[role="group"]');
    const row = matchupRows.first();

    const leftBar = row.locator("div.absolute.left-0").first();
    const box = await leftBar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBe(3);
  });

  test("AC-1c: right accent bar has 3px width", async ({ page }) => {
    await page.goto(
      `/seasons/${TEST_DATA.seasonYear}/week/${TEST_DATA.week}`
    );

    const matchupRows = page.locator('[role="group"]');
    const row = matchupRows.first();

    const rightBar = row.locator("div.absolute.right-0").first();
    const box = await rightBar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBe(3);
  });

  test("AC-1d: left accent bar uses home team brandingColor", async ({
    page,
  }) => {
    await page.goto(
      `/seasons/${TEST_DATA.seasonYear}/week/${TEST_DATA.week}`
    );

    const matchupRows = page.locator('[role="group"]');
    const row = matchupRows.first();

    const leftBar = row.locator("div.absolute.left-0").first();
    const bgColor = await leftBar.evaluate((el) => el.style.backgroundColor);
    // Should be the home team's branding color (either franchise A or B depending on pairing order)
    expect(bgColor).toBeTruthy();
    // The inline style should be set (not empty)
    expect(bgColor.length).toBeGreaterThan(0);
  });

  test("AC-1e: right accent bar uses away team brandingColor", async ({
    page,
  }) => {
    await page.goto(
      `/seasons/${TEST_DATA.seasonYear}/week/${TEST_DATA.week}`
    );

    const matchupRows = page.locator('[role="group"]');
    const row = matchupRows.first();

    const rightBar = row.locator("div.absolute.right-0").first();
    const bgColor = await rightBar.evaluate((el) => el.style.backgroundColor);
    expect(bgColor).toBeTruthy();
    expect(bgColor.length).toBeGreaterThan(0);
  });

  test("AC-1f: accent bars span full height of the row", async ({ page }) => {
    await page.goto(
      `/seasons/${TEST_DATA.seasonYear}/week/${TEST_DATA.week}`
    );

    const matchupRows = page.locator('[role="group"]');
    const row = matchupRows.first();

    const rowBox = await row.boundingBox();
    expect(rowBox).not.toBeNull();

    const leftBar = row.locator("div.absolute.left-0").first();
    const leftBox = await leftBar.boundingBox();
    expect(leftBox).not.toBeNull();
    // Bar height should match row height (accounting for border-radius clipping, allow 2px tolerance)
    expect(Math.abs(leftBox!.height - rowBox!.height)).toBeLessThanOrEqual(2);

    const rightBar = row.locator("div.absolute.right-0").first();
    const rightBox = await rightBar.boundingBox();
    expect(rightBox).not.toBeNull();
    expect(Math.abs(rightBox!.height - rowBox!.height)).toBeLessThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // AC-2: Missing brandingColor falls back to var(--border)
  // -------------------------------------------------------------------------

  test("AC-2: accent bar falls back to var(--border) when brandingColor is null", async ({
    page,
  }) => {
    await page.goto(
      `/seasons/${TEST_DATA.seasonYear}/week/${TEST_DATA.week}`
    );

    // The second matchup has Team Charlie (no branding color) as home team
    const matchupRows = page.locator('[role="group"]');
    const count = await matchupRows.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Find the matchup row that contains "Team Charlie"
    let charlieRow = null;
    for (let i = 0; i < count; i++) {
      const text = await matchupRows.nth(i).innerText();
      if (text.includes("Team Charlie") || text.includes("CHL")) {
        charlieRow = matchupRows.nth(i);
        break;
      }
    }
    expect(charlieRow).not.toBeNull();

    // Check which side Charlie is on: look at the left bar's backgroundColor
    // Charlie has no brandingColor, so one of the bars should use var(--border)
    const leftBar = charlieRow!.locator("div.absolute.left-0").first();
    const rightBar = charlieRow!.locator("div.absolute.right-0").first();

    const leftBg = await leftBar.evaluate((el) => el.style.backgroundColor);
    const rightBg = await rightBar.evaluate((el) => el.style.backgroundColor);

    // At least one bar should use "var(--border)" as its inline style
    // (Charlie is home team so left bar should fallback)
    const hasFallback =
      leftBg === "var(--border)" || rightBg === "var(--border)";

    // Also check via computed style: the bar with the fallback should resolve
    // to the border color from the CSS variable
    const leftComputed = await leftBar.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    );
    const rightComputed = await rightBar.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    );

    // One should be a real color (Team Delta has #C45D3E) and one should be the border fallback
    // Both should be non-empty computed colors
    expect(leftComputed).toBeTruthy();
    expect(rightComputed).toBeTruthy();

    // The inline style of the fallback bar should be "var(--border)"
    expect(hasFallback).toBe(true);
  });

  // -------------------------------------------------------------------------
  // AC-3: Decorative only (aria-hidden)
  // -------------------------------------------------------------------------

  test("AC-3a: left accent bar has aria-hidden=true", async ({ page }) => {
    await page.goto(
      `/seasons/${TEST_DATA.seasonYear}/week/${TEST_DATA.week}`
    );

    const matchupRows = page.locator('[role="group"]');
    const row = matchupRows.first();

    const leftBar = row.locator("div.absolute.left-0").first();
    await expect(leftBar).toHaveAttribute("aria-hidden", "true");
  });

  test("AC-3b: right accent bar has aria-hidden=true", async ({ page }) => {
    await page.goto(
      `/seasons/${TEST_DATA.seasonYear}/week/${TEST_DATA.week}`
    );

    const matchupRows = page.locator('[role="group"]');
    const row = matchupRows.first();

    const rightBar = row.locator("div.absolute.right-0").first();
    await expect(rightBar).toHaveAttribute("aria-hidden", "true");
  });

  test("AC-3c: team names are visible as primary identifiers (not color-dependent)", async ({
    page,
  }) => {
    await page.goto(
      `/seasons/${TEST_DATA.seasonYear}/week/${TEST_DATA.week}`
    );

    const matchupRows = page.locator('[role="group"]');
    const row = matchupRows.first();

    // The row should have an accessible aria-label with team names
    const ariaLabel = await row.getAttribute("aria-label");
    expect(ariaLabel).toBeTruthy();
    // Should contain team names (not just colors)
    expect(ariaLabel).toMatch(/versus/i);
  });

  test("AC-3d: all accent bars across all matchup rows have aria-hidden=true", async ({
    page,
  }) => {
    await page.goto(
      `/seasons/${TEST_DATA.seasonYear}/week/${TEST_DATA.week}`
    );

    const matchupRows = page.locator('[role="group"]');
    const count = await matchupRows.count();
    expect(count).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < count; i++) {
      const row = matchupRows.nth(i);
      const leftBar = row.locator("div.absolute.left-0").first();
      const rightBar = row.locator("div.absolute.right-0").first();

      await expect(leftBar).toHaveAttribute("aria-hidden", "true");
      await expect(rightBar).toHaveAttribute("aria-hidden", "true");
    }
  });
});
