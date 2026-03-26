import { test, expect } from "@playwright/test";

// ============================================================================
// Story 3.4: Standings with Personality
// Tests verify the standings section on the homepage: SuperlativeBadge on the
// leader, bold record for 1st place, franchise-colored left borders, and
// desktop table / mobile card dual layout.
// ============================================================================

test.describe("Standings with Personality", () => {
  // Helper: locate the standings section by finding a heading containing "Standings"
  function getStandingsSection(page: import("@playwright/test").Page) {
    return page
      .locator("section")
      .filter({ has: page.locator("h2:has-text('Standings')") });
  }

  // Helper: determine if standings data is present on the page
  async function hasStandingsData(page: import("@playwright/test").Page) {
    const heading = page.locator("h2").filter({ hasText: "Standings" });
    return (await heading.count()) > 0;
  }

  // T01: Homepage standings section exists when data is present
  test("T01: standings section is present on the homepage", async ({ page }) => {
    await page.goto("/");

    const hasData = await hasStandingsData(page);
    if (!hasData) {
      // No standings data in the DB; the section is conditionally hidden.
      // Verify that the EmptyState fallback or other content renders instead.
      test.skip();
      return;
    }

    const section = getStandingsSection(page);
    await expect(section).toBeVisible();

    // Verify the heading text is exactly "Standings"
    const heading = section.locator("h2").filter({ hasText: "Standings" });
    await expect(heading).toBeVisible();
  });

  // T02: First-place team has a SuperlativeBadge with "1st Place" text
  test("T02: leader has SuperlativeBadge with '1st Place' text", async ({
    page,
  }) => {
    await page.goto("/");

    const hasData = await hasStandingsData(page);
    if (!hasData) {
      test.skip();
      return;
    }

    const section = getStandingsSection(page);

    // Look for the SuperlativeBadge rendered as an uppercase span with "1st Place"
    const badge = section.locator("span").filter({ hasText: "1st Place" });
    await expect(badge.first()).toBeVisible();

    // Verify the badge text content (SuperlativeBadge renders uppercase via CSS)
    const badgeText = await badge.first().textContent();
    expect(badgeText?.trim().toLowerCase()).toBe("1st place");
  });

  // T03: Leader's record is bold (font-weight >= 700)
  test("T03: leader record text has bold font weight", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const hasData = await hasStandingsData(page);
    if (!hasData) {
      test.skip();
      return;
    }

    const section = getStandingsSection(page);

    // Desktop table: first tbody row's record cell has a span with font-bold
    const desktopTable = section.locator("table");
    const firstRow = desktopTable.locator("tbody tr").first();
    const recordCell = firstRow.locator("td").nth(2);
    const recordSpan = recordCell.locator("span").first();

    // Get computed font-weight: "font-bold" maps to 700
    const fontWeight = await recordSpan.evaluate(
      (el) => window.getComputedStyle(el).fontWeight
    );
    // font-weight 700 = bold
    expect(parseInt(fontWeight, 10)).toBeGreaterThanOrEqual(700);
  });

  // T04: Franchise rows have a left border (2-3px)
  test("T04: desktop standings rows have a left border", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const hasData = await hasStandingsData(page);
    if (!hasData) {
      test.skip();
      return;
    }

    const section = getStandingsSection(page);
    const desktopTable = section.locator("table");
    const rows = desktopTable.locator("tbody tr");
    const rowCount = await rows.count();

    expect(rowCount).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const borderLeftWidth = await row.evaluate((el) => {
        const style = window.getComputedStyle(el);
        // Browsers decompose shorthand "borderLeft" into individual properties
        return style.getPropertyValue("border-left-width");
      });
      const width = parseFloat(borderLeftWidth);
      // Should be 2-3px left border
      expect(width).toBeGreaterThanOrEqual(2);
      expect(width).toBeLessThanOrEqual(4);
    }
  });

  // T05: Left borders use inline style with a color value
  test("T05: left borders use inline style with a border color", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const hasData = await hasStandingsData(page);
    if (!hasData) {
      test.skip();
      return;
    }

    const section = getStandingsSection(page);
    const desktopTable = section.locator("table");
    const rows = desktopTable.locator("tbody tr");
    const rowCount = await rows.count();

    expect(rowCount).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const styleAttr = await row.getAttribute("style");

      // Each row should have an inline style attribute containing borderLeft or border-left
      expect(styleAttr).not.toBeNull();
      expect(styleAttr).toBeTruthy();

      // The style should contain "solid" (from "3px solid <color>")
      // or "border-left" related properties
      const hasBorderInfo =
        styleAttr!.includes("solid") ||
        styleAttr!.includes("border-left") ||
        styleAttr!.includes("borderLeft");
      expect(hasBorderInfo).toBe(true);

      // Verify the computed border-left-color is not empty/transparent
      const borderColor = await row.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return style.getPropertyValue("border-left-color");
      });
      // Should be a real color (rgb, rgba, or named), not transparent
      expect(borderColor).toBeTruthy();
      expect(borderColor).not.toBe("transparent");
    }
  });

  // T06: Desktop table view exists at 1280px width
  test("T06: desktop table view is visible at 1280px width", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const hasData = await hasStandingsData(page);
    if (!hasData) {
      test.skip();
      return;
    }

    const section = getStandingsSection(page);

    // Desktop layout: "hidden md:block" table wrapper should be visible
    const desktopTable = section.locator("table");
    await expect(desktopTable).toBeVisible();

    // Verify table has expected columns: #, Team, Record, Points
    const headers = desktopTable.locator("thead th");
    await expect(headers).toHaveCount(4);

    // Verify mobile card view is hidden
    const mobileCards = section.locator(".md\\:hidden");
    // At 1280px, md:hidden elements should not be visible
    if ((await mobileCards.count()) > 0) {
      await expect(mobileCards.first()).not.toBeVisible();
    }
  });

  // T07: Mobile card view exists at 375px width
  test("T07: mobile card view is visible at 375px width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const hasData = await hasStandingsData(page);
    if (!hasData) {
      test.skip();
      return;
    }

    const section = getStandingsSection(page);

    // Mobile layout: "md:hidden" cards should be visible
    const mobileCards = section.locator(".md\\:hidden");
    await expect(mobileCards.first()).toBeVisible();

    // Verify cards are link elements (each card is an <a> tag wrapping content)
    const cardLinks = mobileCards.locator("a");
    const cardCount = await cardLinks.count();
    expect(cardCount).toBeGreaterThanOrEqual(1);

    // Each mobile card should have a 3px left border via inline style
    for (let i = 0; i < cardCount; i++) {
      const card = cardLinks.nth(i);
      const styleAttr = await card.getAttribute("style");
      expect(styleAttr).toBeTruthy();
      // Style should reference border-left-width or borderLeftWidth
      const hasBorderLeft =
        styleAttr!.includes("border-left") || styleAttr!.includes("borderLeft");
      expect(hasBorderLeft).toBe(true);
    }

    // Desktop table should be hidden at mobile width
    const desktopWrapper = section.locator(".hidden.md\\:block");
    if ((await desktopWrapper.count()) > 0) {
      await expect(desktopWrapper.first()).not.toBeVisible();
    }
  });

  // T08: Mobile first card also has SuperlativeBadge "1st Place"
  test("T08: mobile leader card has '1st Place' badge", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const hasData = await hasStandingsData(page);
    if (!hasData) {
      test.skip();
      return;
    }

    const section = getStandingsSection(page);
    const mobileCards = section.locator(".md\\:hidden");
    const firstCard = mobileCards.locator("a").first();

    // First card should contain a "1st Place" badge
    const badge = firstCard.locator("span").filter({ hasText: "1st Place" });
    await expect(badge).toBeVisible();
  });

  // T09: Mobile leader card wins span has bold font weight
  test("T09: mobile leader wins span has bold font weight", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const hasData = await hasStandingsData(page);
    if (!hasData) {
      test.skip();
      return;
    }

    const section = getStandingsSection(page);
    const mobileCards = section.locator(".md\\:hidden");
    const firstCard = mobileCards.locator("a").first();

    // The wins number in the first card should be bold (isLeader ? "font-bold" : "")
    // Find the span with class font-bold inside the first card
    const boldSpan = firstCard.locator("span.font-bold");
    const boldCount = await boldSpan.count();
    expect(boldCount).toBeGreaterThanOrEqual(1);

    // Verify computed font-weight
    const fontWeight = await boldSpan.first().evaluate(
      (el) => window.getComputedStyle(el).fontWeight
    );
    expect(parseInt(fontWeight, 10)).toBeGreaterThanOrEqual(700);
  });

  // T10: Standings section absent when no data; no orphan heading
  test("T10: standings section absent when no standings data", async ({
    page,
  }) => {
    await page.goto("/");

    const hasData = await hasStandingsData(page);
    if (hasData) {
      // Data is present; cannot test the empty state. Skip gracefully.
      test.skip();
      return;
    }

    // The standings section should not be rendered at all
    const section = getStandingsSection(page);
    await expect(section).toHaveCount(0);
  });
});
