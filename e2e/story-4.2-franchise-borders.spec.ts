import { test, expect } from "@playwright/test";

test.describe("Story 4.2: Franchise Card Top Borders", () => {
  // -------------------------------------------------------------------------
  // AC-1: Franchise cards exist in a grid layout
  // -------------------------------------------------------------------------

  test("AC-1a: Teams page renders franchise cards in a grid", async ({
    page,
  }) => {
    await page.goto("/teams");

    // The grid container should exist
    const grid = page.locator(
      "div.grid.grid-cols-1.sm\\:grid-cols-2.md\\:grid-cols-3.lg\\:grid-cols-4"
    );
    await expect(grid).toBeVisible();

    // Should have at least one franchise card (Link elements inside the grid)
    const cards = grid.locator("a[href^='/teams/']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // AC-1b/AC-1c/AC-2/AC-2b (Command Center redesign): the per-team brandingColor
  // top border is gone. Franchise identity is now crest-led — a FranchiseLogo
  // (dynasty crest) rendered via FranchiseIdentity — inside a card-surface
  // container, uniformly, regardless of whether the franchise has a
  // brandingColor. No inline border styling of any kind is applied to the
  // card link itself anymore.
  // -------------------------------------------------------------------------

  test("AC-1b: every franchise card renders a dynasty crest image", async ({
    page,
  }) => {
    await page.goto("/teams");

    const cards = page.locator("a[href^='/teams/']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      // FranchiseLogo always renders an <img> (branding image, falling back
      // to an initials monogram behind it on load error).
      const crestImages = card.locator("img");
      expect(await crestImages.count()).toBeGreaterThanOrEqual(1);
    }
  });

  test("AC-1c/AC-2: cards carry no inline borderTop styling, branded or not", async ({
    page,
  }) => {
    await page.goto("/teams");

    const cards = page.locator("a[href^='/teams/']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const inline = await card.evaluate((el) => ({
        width: el.style.borderTopWidth,
        color: el.style.borderTopColor,
      }));
      // Identity no longer leans on a colored top border — branded and
      // unbranded franchises render the same card-surface treatment.
      expect(inline.width).toBe("");
      expect(inline.color).toBe("");
    }
  });

  test("AC-2b: every card uses the uniform card-surface hairline border", async ({
    page,
  }) => {
    await page.goto("/teams");

    const cards = page.locator("a[href^='/teams/']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const borderTopWidth = await card.evaluate(
        (el) => window.getComputedStyle(el).borderTopWidth
      );
      // card-surface's border is a 1px hairline, not the old 3px accent.
      expect(borderTopWidth).toBe("1px");
    }
  });

  // -------------------------------------------------------------------------
  // AC-3: Decorative only; team names are the primary identifiers
  // -------------------------------------------------------------------------

  test("AC-3a: each card displays the franchise name as text", async ({
    page,
  }) => {
    await page.goto("/teams");

    const cards = page.locator("a[href^='/teams/']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const text = await card.innerText();
      // Each card should have non-trivial text content (team name, owner, record)
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  test("AC-3b: each card displays win/loss record as text identifiers", async ({
    page,
  }) => {
    await page.goto("/teams");

    const cards = page.locator("a[href^='/teams/']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const text = await card.innerText();
      // Every card should contain "W" and "L" labels for wins and losses
      expect(text).toContain("W");
      expect(text).toContain("L");
    }
  });

  test("AC-3c: each card displays points scored", async ({ page }) => {
    await page.goto("/teams");

    const cards = page.locator("a[href^='/teams/']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const text = await card.innerText();
      // Every card should contain "pts" label
      expect(text).toContain("pts");
    }
  });

  test("AC-3d: border color is CSS (decorative), not conveyed via ARIA or separate element", async ({
    page,
  }) => {
    await page.goto("/teams");

    const cards = page.locator("a[href^='/teams/']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);

      // The border is applied via CSS on the card element itself (not a separate
      // aria-hidden div). CSS borders are inherently invisible to screen readers.
      // Verify no child element exists solely for the color border.
      const ariaHiddenBorderDivs = card.locator(
        'div[aria-hidden="true"][style*="borderTop"]'
      );
      await expect(ariaHiddenBorderDivs).toHaveCount(0);
    }
  });

  // -------------------------------------------------------------------------
  // Inline style verification: no card carries an inline borderTopWidth
  // -------------------------------------------------------------------------

  test("no card sets an inline borderTopWidth", async ({ page }) => {
    await page.goto("/teams");

    const cards = page.locator("a[href^='/teams/']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const inlineWidth = await card.evaluate(
        (el) => el.style.borderTopWidth
      );
      expect(inlineWidth).toBe("");
    }
  });
});
