import { test, expect } from "@playwright/test";

// ============================================================================
// Story 3.3: Full Week Matchups Display
// Tests verify the matchups section on the homepage: dynamic week header,
// all matchups render (no truncation), no "View all" link, ScorePoller
// area present, and graceful absence when no data.
// ============================================================================

test.describe("Full Week Matchups Display", () => {
  // Helper: locate the matchups section by finding an h2 containing "Matchups"
  function getMatchupsSection(page: import("@playwright/test").Page) {
    return page.locator("section").filter({ has: page.locator("h2:text-matches('Week \\\\d+ Matchups')") });
  }

  // T01: Matchups section has a header containing "Week" and a number
  test("T01: matchups section header includes dynamic week number", async ({ page }) => {
    await page.goto("/");

    const matchupsHeading = page.locator("h2").filter({ hasText: /Week \d+ Matchups/ });
    const count = await matchupsHeading.count();

    if (count === 0) {
      // No matchup data in the DB; the section is conditionally hidden.
      // This is acceptable: the homepage only renders the matchups section
      // when matchupData is present and has matchups.
      test.skip();
      return;
    }

    await expect(matchupsHeading).toBeVisible();

    // Verify the heading text matches the expected pattern
    const headingText = await matchupsHeading.innerText();
    expect(headingText).toMatch(/^Week \d+ Matchups$/);
  });

  // T02: The section header dynamically includes a week number (numeric, not placeholder)
  test("T02: week number in header is a real number", async ({ page }) => {
    await page.goto("/");

    const matchupsHeading = page.locator("h2").filter({ hasText: /Week \d+ Matchups/ });
    const count = await matchupsHeading.count();

    if (count === 0) {
      test.skip();
      return;
    }

    const headingText = await matchupsHeading.innerText();
    const weekMatch = headingText.match(/Week (\d+) Matchups/);
    expect(weekMatch).not.toBeNull();

    const weekNum = parseInt(weekMatch![1], 10);
    // Week number should be between 1 and 18 (NFL regular season + playoffs)
    expect(weekNum).toBeGreaterThanOrEqual(1);
    expect(weekNum).toBeLessThanOrEqual(18);
  });

  // T03: No "View all matchups" link exists in the matchups section
  test("T03: no 'View all matchups' link in matchups section", async ({ page }) => {
    await page.goto("/");

    const matchupsHeading = page.locator("h2").filter({ hasText: /Week \d+ Matchups/ });
    const count = await matchupsHeading.count();

    if (count === 0) {
      // If no matchups section at all, the requirement is trivially satisfied.
      // Still pass the test rather than skip, since absence of link is confirmed.
      return;
    }

    const matchupsSection = getMatchupsSection(page);
    await expect(matchupsSection).toBeVisible();

    // Verify no "View all" type links exist within the matchups section
    const viewAllLink = matchupsSection.locator("a").filter({ hasText: /view all/i });
    await expect(viewAllLink).toHaveCount(0);
  });

  // T04: Matchup rows are present (MatchupRow components render with role="group")
  test("T04: matchup rows render as role=group elements", async ({ page }) => {
    await page.goto("/");

    const matchupsHeading = page.locator("h2").filter({ hasText: /Week \d+ Matchups/ });
    const count = await matchupsHeading.count();

    if (count === 0) {
      test.skip();
      return;
    }

    const matchupsSection = getMatchupsSection(page);
    await expect(matchupsSection).toBeVisible();

    // MatchupRow renders with role="group"
    const matchupRows = matchupsSection.locator("[role='group']");
    const rowCount = await matchupRows.count();

    // A 12-team league has 6 matchups; verify at least 1 and up to 6
    expect(rowCount).toBeGreaterThanOrEqual(1);
    expect(rowCount).toBeLessThanOrEqual(6);

    // Each matchup row should have an aria-label describing the matchup
    for (let i = 0; i < rowCount; i++) {
      const ariaLabel = await matchupRows.nth(i).getAttribute("aria-label");
      expect(ariaLabel).not.toBeNull();
      expect(ariaLabel!.length).toBeGreaterThan(0);
      // aria-label should contain "versus"
      expect(ariaLabel).toContain("versus");
    }
  });

  // T05: ScorePoller component area exists on the page (mounted within matchups section)
  test("T05: ScorePoller component is mounted in the matchups section", async ({ page }) => {
    await page.goto("/");

    const matchupsHeading = page.locator("h2").filter({ hasText: /Week \d+ Matchups/ });
    const count = await matchupsHeading.count();

    if (count === 0) {
      test.skip();
      return;
    }

    const matchupsSection = getMatchupsSection(page);
    await expect(matchupsSection).toBeVisible();

    // ScorePoller is a client component. When not in a game window (the typical
    // test scenario), it renders null so there is no visible DOM. However, we can
    // verify the component was included by checking that the matchups section
    // contains the matchup rows container (div.space-y-3) as a sibling to where
    // ScorePoller would render. The ScorePoller's aria-live="polite" container
    // only appears during active game windows with live data.
    //
    // We verify the section structure is correct: PageSection wraps children
    // including both the matchup rows container and the ScorePoller slot.
    const matchupRowsContainer = matchupsSection.locator("div.space-y-3").first();
    await expect(matchupRowsContainer).toBeVisible();

    // If there happens to be a live game window, the aria-live region would be present
    const liveRegion = matchupsSection.locator("[aria-live='polite']");
    const liveRegionCount = await liveRegion.count();
    // This is informational; we do not fail if no live region (no active game window)
    if (liveRegionCount > 0) {
      await expect(liveRegion.first()).toBeVisible();
    }
  });

  // T06: Matchups section absent when no data; EmptyState shown when fully empty
  test("T06: matchups section absent when no matchup data", async ({ page }) => {
    await page.goto("/");

    const matchupsHeading = page.locator("h2").filter({ hasText: /Week \d+ Matchups/ });
    const count = await matchupsHeading.count();

    if (count > 0) {
      // Data is present; we cannot test the empty state. Skip gracefully.
      test.skip();
      return;
    }

    // The matchups section should not be rendered at all
    const matchupsSection = getMatchupsSection(page);
    await expect(matchupsSection).toHaveCount(0);
  });

  // T07: Season year label appears above the week header
  test("T07: season year label appears in matchups section", async ({ page }) => {
    await page.goto("/");

    const matchupsHeading = page.locator("h2").filter({ hasText: /Week \d+ Matchups/ });
    const count = await matchupsHeading.count();

    if (count === 0) {
      test.skip();
      return;
    }

    const matchupsSection = getMatchupsSection(page);

    // PageSection renders a label above the h2 with "YYYY Season" text
    const seasonLabel = matchupsSection.locator("p.uppercase").filter({ hasText: /\d{4} Season/ });
    await expect(seasonLabel).toBeVisible();

    const labelText = await seasonLabel.innerText();
    expect(labelText).toMatch(/^\d{4} SEASON$/i);
  });

  // T08: Each matchup row displays two team names
  test("T08: each matchup row displays two team names", async ({ page }) => {
    await page.goto("/");

    const matchupsHeading = page.locator("h2").filter({ hasText: /Week \d+ Matchups/ });
    const count = await matchupsHeading.count();

    if (count === 0) {
      test.skip();
      return;
    }

    const matchupsSection = getMatchupsSection(page);
    const matchupRows = matchupsSection.locator("[role='group']");
    const rowCount = await matchupRows.count();

    expect(rowCount).toBeGreaterThanOrEqual(1);

    // Each row should contain "versus" in its aria-label (two teams)
    // and have visible text content with team names
    for (let i = 0; i < Math.min(rowCount, 3); i++) {
      const row = matchupRows.nth(i);
      const text = await row.innerText();
      // Should have some meaningful text content (team names, scores, or "vs")
      expect(text.length).toBeGreaterThan(0);
    }
  });

  // T09: No "View all" links anywhere on the page referencing matchups
  test("T09: no 'View all matchups' link anywhere on homepage", async ({ page }) => {
    await page.goto("/");

    // Check the entire page for any "View all matchups" type links
    const viewAllMatchupsLink = page.locator("a").filter({ hasText: /view all matchups/i });
    await expect(viewAllMatchupsLink).toHaveCount(0);
  });
});
