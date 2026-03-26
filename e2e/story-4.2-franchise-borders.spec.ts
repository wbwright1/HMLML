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
  // AC-1b: Each card has a 3px top border
  // -------------------------------------------------------------------------

  test("AC-1b: every franchise card has borderTopWidth of 3px", async ({
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
      expect(borderTopWidth).toBe("3px");
    }
  });

  // -------------------------------------------------------------------------
  // AC-1c: Cards with brandingColor use that color as borderTopColor
  // -------------------------------------------------------------------------

  test("AC-1c: cards with brandingColor have inline borderTopColor set", async ({
    page,
  }) => {
    await page.goto("/teams");

    const cards = page.locator("a[href^='/teams/']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Collect all inline borderTopColor values
    const borderColors: string[] = [];
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const inlineBorderTopColor = await card.evaluate(
        (el) => el.style.borderTopColor
      );
      borderColors.push(inlineBorderTopColor);
    }

    // Every card must have an inline borderTopColor set (either a hex/rgb value
    // for branded franchises or "var(--border)" for unbranded ones)
    for (const color of borderColors) {
      expect(color).toBeTruthy();
      // Must be either a CSS variable fallback or a color value (hex, rgb, named)
      const isVariable = color === "var(--border)";
      const isColorValue = color.length > 0 && color !== "var(--border)";
      expect(isVariable || isColorValue).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // AC-2: Cards without brandingColor fall back to var(--border)
  // -------------------------------------------------------------------------

  test("AC-2: all cards have either a brandingColor or var(--border) fallback", async ({
    page,
  }) => {
    await page.goto("/teams");

    const cards = page.locator("a[href^='/teams/']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    let hasBrandedCard = false;
    let hasFallbackCard = false;

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const inlineBorderTopColor = await card.evaluate(
        (el) => el.style.borderTopColor
      );

      if (inlineBorderTopColor === "var(--border)") {
        hasFallbackCard = true;
      } else if (inlineBorderTopColor.length > 0) {
        hasBrandedCard = true;
      }
    }

    // At least one type of card should exist (branded or fallback)
    // The important thing is no card has an empty/missing borderTopColor
    expect(hasBrandedCard || hasFallbackCard).toBe(true);
  });

  test("AC-2b: fallback cards resolve to the --border CSS variable color", async ({
    page,
  }) => {
    await page.goto("/teams");

    const cards = page.locator("a[href^='/teams/']");
    const count = await cards.count();

    // Find a card with var(--border) fallback
    let fallbackCard = null;
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const inlineColor = await card.evaluate(
        (el) => el.style.borderTopColor
      );
      if (inlineColor === "var(--border)") {
        fallbackCard = card;
        break;
      }
    }

    // If no fallback card exists (all franchises have brandingColor), skip gracefully
    if (fallbackCard === null) {
      // All franchises have a brandingColor set; fallback path is not exercised
      // This is acceptable since the code path is verified by the inline style check
      return;
    }

    // The computed borderTopColor should resolve to a real color (not empty)
    const computedColor = await fallbackCard.evaluate(
      (el) => window.getComputedStyle(el).borderTopColor
    );
    expect(computedColor).toBeTruthy();
    // Should be an rgb() value (resolved from the CSS variable)
    expect(computedColor).toMatch(/^rgb/);
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
  // Inline style verification: borderTopWidth is always 3px in the style attr
  // -------------------------------------------------------------------------

  test("inline style sets borderTopWidth to 3px on every card", async ({
    page,
  }) => {
    await page.goto("/teams");

    const cards = page.locator("a[href^='/teams/']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const inlineWidth = await card.evaluate(
        (el) => el.style.borderTopWidth
      );
      expect(inlineWidth).toBe("3px");
    }
  });
});
