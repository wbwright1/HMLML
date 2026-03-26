import { test, expect } from "@playwright/test";

test.describe("Story 4.4: Standings Table Color Borders", () => {
  // ---------------------------------------------------------------------------
  // Records Leaderboard: Desktop table rows
  // ---------------------------------------------------------------------------

  test("leaderboard desktop rows have 3px left border", async ({ page }) => {
    await page.goto("/records");

    // Desktop table rows (inside tbody)
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const borderLeftWidth = await row.evaluate(
        (el) => window.getComputedStyle(el).borderLeftWidth
      );
      expect(borderLeftWidth).toBe("3px");
    }
  });

  test("leaderboard desktop rows use inline borderLeft style", async ({
    page,
  }) => {
    await page.goto("/records");

    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const inlineStyle = await row.evaluate((el) => el.style.borderLeft);
      // Inline style should contain "3px solid"
      expect(inlineStyle).toContain("3px solid");
    }
  });

  // ---------------------------------------------------------------------------
  // Records Leaderboard: Mobile cards
  // ---------------------------------------------------------------------------

  test("leaderboard mobile cards have 3px left border", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/records");

    // Mobile card links (inside the md:hidden container)
    const cards = page.locator("div.md\\:hidden a[href^='/teams/']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const borderLeftWidth = await card.evaluate(
        (el) => window.getComputedStyle(el).borderLeftWidth
      );
      expect(borderLeftWidth).toBe("3px");
    }
  });

  test("leaderboard mobile cards use inline borderLeftColor", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/records");

    const cards = page.locator("div.md\\:hidden a[href^='/teams/']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const inlineColor = await card.evaluate(
        (el) => el.style.borderLeftColor
      );
      // Should be set to either a hex color or var(--border)
      expect(inlineColor).toBeTruthy();
    }
  });

  // ---------------------------------------------------------------------------
  // Power Rankings cards
  // ---------------------------------------------------------------------------

  test("power rankings cards have 3px left border", async ({ page }) => {
    await page.goto("/records/power-rankings");

    const cards = page.locator("a[href^='/teams/']");
    const count = await cards.count();

    // Power rankings may be empty if no season data; skip gracefully
    if (count === 0) {
      return;
    }

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const borderLeftWidth = await card.evaluate(
        (el) => window.getComputedStyle(el).borderLeftWidth
      );
      expect(borderLeftWidth).toBe("3px");
    }
  });

  test("power rankings cards use inline borderLeftColor", async ({ page }) => {
    await page.goto("/records/power-rankings");

    const cards = page.locator("a[href^='/teams/']");
    const count = await cards.count();

    if (count === 0) {
      return;
    }

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const inlineColor = await card.evaluate(
        (el) => el.style.borderLeftColor
      );
      expect(inlineColor).toBeTruthy();
    }
  });

  // ---------------------------------------------------------------------------
  // Fallback: borders use var(--border) or a real color
  // ---------------------------------------------------------------------------

  test("all leaderboard borders have either brandingColor or fallback", async ({
    page,
  }) => {
    await page.goto("/records");

    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const inlineStyle = await row.evaluate((el) => el.style.borderLeft);
      // Must contain "3px solid" followed by either a hex value or var(--border)
      expect(inlineStyle).toContain("3px solid");
      const color = inlineStyle.replace("3px solid ", "").trim();
      const isVariable = color === "var(--border)";
      const isColorValue = color.length > 0 && color !== "var(--border)";
      expect(isVariable || isColorValue).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // Decorative only: borders convey no semantic info
  // ---------------------------------------------------------------------------

  test("borders are decorative; franchise name and record are present", async ({
    page,
  }) => {
    await page.goto("/records");

    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const text = await row.innerText();
      // Each row should have text content (rank, name, record numbers)
      expect(text.trim().length).toBeGreaterThan(0);
      // Should contain numeric data (wins, losses, points) proving identity is text-based
      expect(text).toMatch(/\d/);
    }

    // Table headers should label the columns (W, L columns exist)
    const headers = page.locator("table thead th");
    const headerTexts = await headers.allInnerTexts();
    const headerStr = headerTexts.join(" ");
    expect(headerStr).toContain("W");
    expect(headerStr).toContain("L");
  });
});
