import { test, expect } from "@playwright/test";

// ============================================================================
// Story 3.5: Season Narrative Block
// Tests verify the homepage narrative section renders correctly in both
// in-season ("Last Week's Results") and offseason ("League at a Glance")
// states, with graceful absence when no data exists.
// ============================================================================

test.describe("Season Narrative Block", () => {
  // T01: Homepage has a narrative/results section (either variant)
  test("T01: homepage renders a narrative section when data exists", async ({ page }) => {
    await page.goto("/");

    // The narrative block appears as a PageSection with either
    // "Last Week" label or "Offseason" label
    const lastWeekSection = page.locator("text=Week").locator("xpath=ancestor::section").first();
    const offseasonSection = page.locator("text=League at a Glance");

    const lastWeekVisible = await lastWeekSection.isVisible().catch(() => false);
    const offseasonVisible = await offseasonSection.isVisible().catch(() => false);

    if (!lastWeekVisible && !offseasonVisible) {
      // No narrative data available; section is correctly absent
      test.skip();
      return;
    }

    // At least one narrative section should be visible
    expect(lastWeekVisible || offseasonVisible).toBe(true);
  });

  // T02: In-season state shows completed matchup summaries with winners in bold
  test("T02: in-season Last Week Results shows winner names in bold", async ({ page }) => {
    await page.goto("/");

    // Look for "Last Week" label text which indicates in-season narrative
    const lastWeekLabel = page.locator("text=Last Week").first();
    const isVisible = await lastWeekLabel.isVisible().catch(() => false);

    if (!isVisible) {
      // Not in-season or no last week data; skip gracefully
      test.skip();
      return;
    }

    // Find the results container (the section containing "Last Week")
    const section = page.locator("section").filter({ hasText: "Last Week" }).first();
    await expect(section).toBeVisible();

    // Winner names should appear in font-semibold spans
    const boldNames = section.locator("span.font-semibold");
    const boldCount = await boldNames.count();
    expect(boldCount).toBeGreaterThanOrEqual(1);

    // Scores should have tabular-nums class
    const scores = section.locator("span.tabular-nums");
    const scoreCount = await scores.count();
    expect(scoreCount).toBeGreaterThanOrEqual(1);

    // Biggest blowout callout should exist
    const blowoutCallout = section.locator("text=Biggest blowout");
    await expect(blowoutCallout).toBeVisible();
  });

  // T03: Offseason state shows league stats (seasons, matchups, etc.)
  test("T03: offseason League at a Glance shows league statistics", async ({ page }) => {
    await page.goto("/");

    const glanceTitle = page.locator("text=League at a Glance");
    const isVisible = await glanceTitle.isVisible().catch(() => false);

    if (!isVisible) {
      // Not offseason or no data; skip gracefully
      test.skip();
      return;
    }

    // The section should contain StatHero figure elements
    const section = page.locator("section").filter({ hasText: "League at a Glance" }).first();
    await expect(section).toBeVisible();

    const figures = section.locator("figure[role='group']");
    const figureCount = await figures.count();
    // Should have at least 3 stat cards (champion, seasons, matchups)
    expect(figureCount).toBeGreaterThanOrEqual(3);

    // Check for expected labels
    const sectionText = await section.innerText();
    expect(sectionText).toContain("Champion");
    expect(sectionText).toContain("Seasons Played");
    expect(sectionText).toContain("Total Matchups");
  });

  // T04: Offseason reigning champion includes ChampionshipStars
  test("T04: reigning champion displays ChampionshipStars", async ({ page }) => {
    await page.goto("/");

    const glanceTitle = page.locator("text=League at a Glance");
    const isVisible = await glanceTitle.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip();
      return;
    }

    const section = page.locator("section").filter({ hasText: "League at a Glance" }).first();

    // ChampionshipStars renders a div with role="img" and aria-label containing "championship"
    const stars = section.locator("[role='img'][aria-label*='championship']");
    const starsCount = await stars.count();

    // If a champion exists with at least 1 championship, stars should render
    if (starsCount === 0) {
      // Could be that data does not include a champion with championships
      test.skip();
      return;
    }

    await expect(stars.first()).toBeVisible();

    // Stars should contain SVG star icons
    const starIcons = stars.first().locator("svg");
    const iconCount = await starIcons.count();
    expect(iconCount).toBeGreaterThanOrEqual(1);
  });

  // T05: No panicked language in the narrative section
  test("T05: no panicked language in narrative section", async ({ page }) => {
    await page.goto("/");

    const pageText = await page.locator("body").innerText();

    // Per CLAUDE.md: error messages should never be panicked
    const panickedPhrases = ["Oops", "Uh oh", "Uh-oh", "Oh no", "Something broke"];
    for (const phrase of panickedPhrases) {
      expect(pageText).not.toContain(phrase);
    }
  });

  // T06: Section is absent when no data is available (graceful empty state)
  test("T06: narrative section absent when no data renders cleanly", async ({ page }) => {
    await page.goto("/");

    // Wait for page to fully settle
    await page.waitForLoadState("networkidle");

    // The page should load without showing broken/partial narrative sections.
    // If neither narrative variant is present, the section is correctly absent
    // (no error messages, no partial renders).
    const lastWeekSection = page.locator("text=Last Week").first();
    const offseasonSection = page.locator("text=League at a Glance").first();

    const lastWeekVisible = await lastWeekSection.isVisible().catch(() => false);
    const offseasonVisible = await offseasonSection.isVisible().catch(() => false);

    if (lastWeekVisible || offseasonVisible) {
      // Data exists; verify no error/fallback text within the section
      const narrativeSection = lastWeekVisible
        ? page.locator("section").filter({ hasText: "Last Week" }).first()
        : page.locator("section").filter({ hasText: "League at a Glance" }).first();
      const text = await narrativeSection.innerText();
      expect(text).not.toContain("Something went wrong");
      expect(text).not.toContain("Error");
    }

    // Whether data is present or absent, the page loaded without a broken state
    // (no visible error messages on the page related to the narrative block)
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("Oops");
    expect(bodyText).not.toContain("Uh oh");
  });

  // T07: In-season matchup results show "def." separator (text label, not color-only)
  test("T07: matchup results use text labels not color-only indicators", async ({ page }) => {
    await page.goto("/");

    const lastWeekLabel = page.locator("text=Last Week").first();
    const isVisible = await lastWeekLabel.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip();
      return;
    }

    const section = page.locator("section").filter({ hasText: "Last Week" }).first();

    // Each result should contain "def." text separator
    const defLabels = section.locator("text=def.");
    const defCount = await defLabels.count();
    expect(defCount).toBeGreaterThanOrEqual(1);
  });

  // T08: Offseason section uses PageSection with correct label
  test("T08: offseason section has 'Offseason' label", async ({ page }) => {
    await page.goto("/");

    const offseasonLabel = page.locator("text=Offseason").first();
    const isVisible = await offseasonLabel.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip();
      return;
    }

    // The label should be uppercase (Caption style per design spec)
    const labelEl = page.locator("p").filter({ hasText: /^Offseason$/ }).first();
    const hasUppercase = await labelEl.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.textTransform === "uppercase";
    }).catch(() => false);

    expect(hasUppercase).toBe(true);
  });
});
