import { test, expect } from "@playwright/test";

test.describe("Story 4.2: Franchise Card Top Borders", () => {
  // -------------------------------------------------------------------------
  // AC-1: Franchise cards exist in a grid layout
  // -------------------------------------------------------------------------

  test("AC-1a: Teams page renders franchises as rows in one list card", async ({
    page,
  }) => {
    await page.goto("/teams");

    // UI/UX pass 2026-11-24: two-line rows inside a single card-surface list
    // replaced the tall card grid.
    const list = page.getByTestId("franchise-list");
    await expect(list).toBeVisible();
    await expect(list).toHaveClass(/card-surface/);

    // Every row is a whole-row link to its franchise page.
    const rows = list.locator("li > a[href^='/teams/']");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);
    expect(await list.locator("li").count()).toBe(count);
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

  test("AC-2b: every row is a 44px+ tap target with no accent border", async ({
    page,
  }) => {
    await page.goto("/teams");

    const rows = page.getByTestId("franchise-list").locator("a[href^='/teams/']");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const box = await row.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      // No old 3px accent top border on the row.
      const borderTopWidth = await row.evaluate(
        (el) => window.getComputedStyle(el).borderTopWidth
      );
      expect(borderTopWidth).not.toBe("3px");
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

  test("AC-3b: each row displays the all-time record", async ({
    page,
  }) => {
    await page.goto("/teams");

    const cards = page.locator("a[href^='/teams/']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const text = await card.innerText();
      // Every row shows the all-time W-L record as a mono figure pair.
      expect(text).toMatch(/\b\d+-\d+\b/);
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
