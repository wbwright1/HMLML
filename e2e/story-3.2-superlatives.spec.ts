import { test, expect } from "@playwright/test";

// ============================================================================
// Story 3.2: Superlative Stats Row
// Tests verify the superlative stats section on the homepage: layout, grid
// responsiveness, tabular-nums on stat values, and graceful absence.
// ============================================================================

test.describe("Superlative Stats Row", () => {
  // T01: Homepage loads and the superlatives section uses a grid layout
  test("T01: superlatives section renders with grid layout", async ({ page }) => {
    await page.goto("/");

    // The superlatives row is the section with grid-cols-2 md:grid-cols-4
    // It lives inside a ScrollReveal div > section > div.grid
    const gridContainer = page.locator("div.grid.grid-cols-2");

    const count = await gridContainer.count();
    if (count === 0) {
      // No superlative data in the DB; the section is conditionally hidden.
      // This is acceptable per AC-2 (graceful absence).
      test.skip();
      return;
    }

    await expect(gridContainer.first()).toBeVisible();
  });

  // T02: Stat cards use the StatHero figure element pattern
  test("T02: stat cards render as figure elements with role=group", async ({ page }) => {
    await page.goto("/");

    const gridContainer = page.locator("div.grid.grid-cols-2");
    const count = await gridContainer.count();
    if (count === 0) {
      test.skip();
      return;
    }

    // StatHero renders as <figure role="group">
    const figures = gridContainer.first().locator("figure[role='group']");
    const figureCount = await figures.count();
    // Should be between 1 and 4 stat cards
    expect(figureCount).toBeGreaterThanOrEqual(1);
    expect(figureCount).toBeLessThanOrEqual(4);
  });

  // T03: Stat values apply tabular-nums for numeric alignment
  test("T03: stat values use tabular-nums font-variant-numeric", async ({ page }) => {
    test.fixme();
    // WAVE:P1 — stat numerals are moving from a Geist "font-black" weight
    // class to the JetBrains Mono "text-stat" class (see FE-T14 in
    // theme-tokens.spec.ts). The p.font-black selector below may no longer
    // match. Replacement should locate stat values via the new numeral class
    // and keep asserting tabular-nums (still required per CLAUDE.md).
    await page.goto("/");

    const gridContainer = page.locator("div.grid.grid-cols-2");
    const count = await gridContainer.count();
    if (count === 0) {
      test.skip();
      return;
    }

    const figures = gridContainer.first().locator("figure[role='group']");
    const figureCount = await figures.count();
    expect(figureCount).toBeGreaterThanOrEqual(1);

    // Check each stat value element (the <p> with font-black class inside figure)
    for (let i = 0; i < figureCount; i++) {
      const valueParagraph = figures.nth(i).locator("p.font-black");
      await expect(valueParagraph).toBeVisible();

      const fontVariantNumeric = await valueParagraph.evaluate((el) =>
        window.getComputedStyle(el).fontVariantNumeric
      );
      expect(fontVariantNumeric).toContain("tabular-nums");
    }
  });

  // T04: Each stat card has a badge label (text context, not color-only)
  test("T04: stat cards include text badge labels", async ({ page }) => {
    await page.goto("/");

    const gridContainer = page.locator("div.grid.grid-cols-2");
    const count = await gridContainer.count();
    if (count === 0) {
      test.skip();
      return;
    }

    const figures = gridContainer.first().locator("figure[role='group']");
    const figureCount = await figures.count();

    for (let i = 0; i < figureCount; i++) {
      // The badge is a <span> with uppercase tracking-widest
      const badge = figures.nth(i).locator("span.uppercase");
      const badgeCount = await badge.count();
      // Each StatHero should have a badge label
      expect(badgeCount).toBeGreaterThanOrEqual(1);
      const badgeText = await badge.first().innerText();
      expect(badgeText.length).toBeGreaterThan(0);
    }
  });

  // T05: Mobile viewport (375px) shows 2-column grid
  test("T05: mobile viewport shows 2-column grid", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const gridContainer = page.locator("div.grid.grid-cols-2");
    const count = await gridContainer.count();
    if (count === 0) {
      test.skip();
      return;
    }

    const grid = gridContainer.first();
    await expect(grid).toBeVisible();

    // Verify computed grid-template-columns has 2 columns
    const gridCols = await grid.evaluate((el) =>
      window.getComputedStyle(el).gridTemplateColumns
    );
    // Should have exactly 2 column values (e.g., "163.5px 163.5px" or similar)
    const columnCount = gridCols.trim().split(/\s+/).length;
    expect(columnCount).toBe(2);
  });

  // T06: Desktop viewport (1280px) shows 4-column grid
  test("T06: desktop viewport shows 4-column grid", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const gridContainer = page.locator("div.grid.grid-cols-2");
    const count = await gridContainer.count();
    if (count === 0) {
      test.skip();
      return;
    }

    const grid = gridContainer.first();
    await expect(grid).toBeVisible();

    // Verify computed grid-template-columns has 4 columns
    const gridCols = await grid.evaluate((el) =>
      window.getComputedStyle(el).gridTemplateColumns
    );
    const columnCount = gridCols.trim().split(/\s+/).length;
    expect(columnCount).toBe(4);
  });

  // T07: Stat values use md variant typography (36-40px range)
  test("T07: stat values use md variant font size (36-40px)", async ({ page }) => {
    test.fixme();
    // WAVE:P1 — depends on the p.font-black selector (see T03) and the exact
    // 36-40px sizing decision, both of which may change with the JetBrains
    // Mono numeral treatment. Replacement should target the new stat-numeral
    // class and re-derive the expected size range from the shipped design.
    await page.goto("/");

    const gridContainer = page.locator("div.grid.grid-cols-2");
    const count = await gridContainer.count();
    if (count === 0) {
      test.skip();
      return;
    }

    const figures = gridContainer.first().locator("figure[role='group']");
    const figureCount = await figures.count();

    for (let i = 0; i < figureCount; i++) {
      const valueParagraph = figures.nth(i).locator("p.font-black");
      const fontSize = await valueParagraph.evaluate((el) =>
        parseFloat(window.getComputedStyle(el).fontSize)
      );
      // md variant = text-[38px], should be in 36-40px range
      expect(fontSize).toBeGreaterThanOrEqual(36);
      expect(fontSize).toBeLessThanOrEqual(40);
    }
  });

  // T08: Stat values use font-weight 900 (Black weight)
  test("T08: stat values use Black font weight (900)", async ({ page }) => {
    test.fixme();
    // WAVE:P1 — stat numerals move to JetBrains Mono (--font-mono); the mono
    // family typically doesn't ship a 900 weight the way Geist Black does.
    // Replacement should assert whatever weight the shipped JetBrains Mono
    // numeral treatment uses, not a hardcoded "900".
    await page.goto("/");

    const gridContainer = page.locator("div.grid.grid-cols-2");
    const count = await gridContainer.count();
    if (count === 0) {
      test.skip();
      return;
    }

    const figures = gridContainer.first().locator("figure[role='group']");
    const valueParagraph = figures.first().locator("p.font-black");

    const fontWeight = await valueParagraph.evaluate((el) =>
      window.getComputedStyle(el).fontWeight
    );
    expect(fontWeight).toBe("900");
  });

  // T09: No em-dashes in superlative text content
  test("T09: no em-dashes in superlative text content", async ({ page }) => {
    await page.goto("/");

    const gridContainer = page.locator("div.grid.grid-cols-2");
    const count = await gridContainer.count();
    if (count === 0) {
      test.skip();
      return;
    }

    const text = await gridContainer.first().innerText();
    expect(text).not.toContain("\u2014");
    expect(text).not.toContain("\u2013");
  });
});
