import { test, expect } from "@playwright/test";

test.describe("Story 4.4: Standings Redesign (Command Center)", () => {
  // ---------------------------------------------------------------------------
  // Records Leaderboard: crest + rank + mono numerals, no 3px border reliance
  // ---------------------------------------------------------------------------

  test("leaderboard desktop rows render crest, rank, and mono tabular numerals", async ({
    page,
  }) => {
    await page.goto("/records");

    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);

      // No 3px left-border color-coding; franchise identity carries no
      // semantic left-border indicator on this row.
      const borderLeftWidth = await row.evaluate(
        (el) => window.getComputedStyle(el).borderLeftWidth
      );
      expect(borderLeftWidth).not.toBe("3px");

      // Franchise crest (FranchiseLogo renders an <img>) present in the row.
      const crest = row.locator("img");
      await expect(crest.first()).toBeAttached();

      // Rank + record numerals render in the monospace stat font.
      const monoCells = row.locator(".font-mono");
      const monoCount = await monoCells.count();
      expect(monoCount).toBeGreaterThanOrEqual(1);
    }
  });

  test("leaderboard mobile cards render crest, rank, and mono numerals with no 3px border", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/records");

    const cards = page.locator("div.md\\:hidden a[href^='/teams/']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);

      const borderLeftWidth = await card.evaluate(
        (el) => window.getComputedStyle(el).borderLeftWidth
      );
      expect(borderLeftWidth).not.toBe("3px");

      const crest = card.locator("img");
      await expect(crest.first()).toBeAttached();

      const monoCells = card.locator(".font-mono");
      expect(await monoCells.count()).toBeGreaterThanOrEqual(1);
    }
  });

  // ---------------------------------------------------------------------------
  // Leader row highlight
  // ---------------------------------------------------------------------------

  test("leader row is visually distinguished from other rows", async ({
    page,
  }) => {
    await page.goto("/records");

    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);

    if (count < 2) return;

    const leaderBg = await rows
      .nth(0)
      .evaluate((el) => window.getComputedStyle(el).backgroundColor);
    const otherBg = await rows
      .nth(count - 1)
      .evaluate((el) => window.getComputedStyle(el).backgroundColor);

    expect(leaderBg).not.toBe(otherBg);
  });

  test("leader row uses the accent-gold-light class token", async ({
    page,
  }) => {
    await page.goto("/records");

    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);

    const leaderClass = await rows.nth(0).getAttribute("class");
    expect(leaderClass).toContain("bg-accent-gold-light");
  });

  // ---------------------------------------------------------------------------
  // Playoff berth legend (text-based, not color-only)
  // ---------------------------------------------------------------------------

  test("playoff berth text legend is present", async ({ page }) => {
    await page.goto("/records");

    const legend = page.getByText(/playoff berth/i);
    await expect(legend.first()).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Power Rankings: crest + rank rows, no 3px border reliance
  // ---------------------------------------------------------------------------

  test("power rankings rows render crest, rank, and mono numerals with no 3px border", async ({
    page,
  }) => {
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
      expect(borderLeftWidth).not.toBe("3px");

      const crest = card.locator("img");
      await expect(crest.first()).toBeAttached();

      const monoCells = card.locator(".font-mono");
      expect(await monoCells.count()).toBeGreaterThanOrEqual(1);
    }
  });

  // ---------------------------------------------------------------------------
  // Decorative only: franchise name and record are text-based, not color-only
  // ---------------------------------------------------------------------------

  test("row identity and record are conveyed via text, not color alone", async ({
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
      // Should contain numeric data (record, points) proving identity is text-based
      expect(text).toMatch(/\d/);
    }

    // Table headers should label the columns
    const headers = page.locator("table thead th");
    const headerTexts = await headers.allInnerTexts();
    const headerStr = headerTexts.join(" ");
    expect(headerStr).toContain("Rec");
    expect(headerStr).toContain("PF");
    expect(headerStr).toContain("PA");
  });
});
