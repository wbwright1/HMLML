import { test, expect } from "@playwright/test";

test.describe("Story 5.1: ChampionshipStars SVG Upgrade", () => {
  test("trophies page renders championship stars as SVG elements", async ({
    page,
  }) => {
    await page.goto("/records/trophies");
    await expect(page.locator("h1, h2").first()).toBeVisible();

    // Find all championship star containers
    const starContainers = page.locator('[role="img"][aria-label*="championship"]');
    const containerCount = await starContainers.count();

    if (containerCount === 0) {
      // No championship data in DB; verify no empty containers leaked
      const emptyStar = page.locator(".championship-stars-empty");
      await expect(emptyStar).toHaveCount(0);
      return;
    }

    // Verify stars are rendered as SVG elements (not text characters)
    const firstContainer = starContainers.first();
    const svgs = firstContainer.locator("svg");
    const svgCount = await svgs.count();
    expect(svgCount).toBeGreaterThan(0);

    // Verify each SVG is a real Lucide Star (has a path child, not text content)
    const firstSvg = svgs.first();
    await expect(firstSvg).toBeVisible();
    const pathCount = await firstSvg.locator("path").count();
    expect(pathCount).toBeGreaterThan(0);
  });

  test("star containers have correct aria-label with proper pluralization", async ({
    page,
  }) => {
    await page.goto("/records/trophies");
    await expect(page.locator("h1, h2").first()).toBeVisible();

    // Check containers with exactly 1 championship use singular
    const singularContainers = page.locator(
      '[role="img"][aria-label="1 championship"]'
    );
    const singularCount = await singularContainers.count();

    if (singularCount > 0) {
      const container = singularContainers.first();
      const svgCount = await container.locator("svg").count();
      expect(svgCount).toBe(1);
    }

    // Check containers with plural championships
    const allContainers = page.locator(
      '[role="img"][aria-label*="championships"]'
    );
    const pluralCount = await allContainers.count();

    if (pluralCount > 0) {
      const container = allContainers.first();
      const ariaLabel = await container.getAttribute("aria-label");
      const expectedCount = parseInt(ariaLabel!.split(" ")[0], 10);
      expect(expectedCount).toBeGreaterThan(1);
      const svgCount = await container.locator("svg").count();
      expect(svgCount).toBe(expectedCount);
    }
  });

  test("individual star SVGs have aria-hidden for accessibility", async ({
    page,
  }) => {
    await page.goto("/records/trophies");
    await expect(page.locator("h1, h2").first()).toBeVisible();

    const starContainers = page.locator('[role="img"][aria-label*="championship"]');
    const containerCount = await starContainers.count();

    if (containerCount === 0) return;

    // Each individual SVG star should have aria-hidden="true"
    const firstContainer = starContainers.first();
    const svgs = firstContainer.locator("svg");
    const svgCount = await svgs.count();

    for (let i = 0; i < svgCount; i++) {
      const ariaHidden = await svgs.nth(i).getAttribute("aria-hidden");
      expect(ariaHidden).toBe("true");
    }
  });

  test("stars use gold color from design tokens", async ({ page }) => {
    await page.goto("/records/trophies");
    await expect(page.locator("h1, h2").first()).toBeVisible();

    const starContainers = page.locator('[role="img"][aria-label*="championship"]');
    const containerCount = await starContainers.count();

    if (containerCount === 0) return;

    // Get computed color of a star SVG
    const firstSvg = starContainers.first().locator("svg").first();
    await expect(firstSvg).toBeVisible();

    const color = await firstSvg.evaluate((el) => {
      return window.getComputedStyle(el).color;
    });

    // The gold color #B8860B in RGB is rgb(184, 134, 11)
    // Allow for slight variations from CSS variable resolution
    expect(color).toMatch(/rgb\(184,\s*134,\s*11\)/);
  });

  test("zero championships renders no container", async ({ page }) => {
    await page.goto("/records/trophies");
    await expect(page.locator("h1, h2").first()).toBeVisible();

    // The ChampionshipStars component with count=0 should return null.
    // We verify this by checking that every star container present has at least 1 SVG.
    // There should be no empty star containers in the DOM.
    const starContainers = page.locator('[role="img"][aria-label*="championship"]');
    const count = await starContainers.count();

    for (let i = 0; i < count; i++) {
      const svgCount = await starContainers.nth(i).locator("svg").count();
      expect(svgCount).toBeGreaterThan(0);
    }
  });

  test("star count matches championship count in container aria-label", async ({
    page,
  }) => {
    await page.goto("/records/trophies");
    await expect(page.locator("h1, h2").first()).toBeVisible();

    const starContainers = page.locator('[role="img"][aria-label*="championship"]');
    const count = await starContainers.count();

    for (let i = 0; i < count; i++) {
      const container = starContainers.nth(i);
      const ariaLabel = await container.getAttribute("aria-label");
      const expectedStars = parseInt(ariaLabel!.split(" ")[0], 10);
      const actualSvgs = await container.locator("svg").count();
      expect(actualSvgs).toBe(expectedStars);
    }
  });

  test("star containers have role=img for screen readers", async ({
    page,
  }) => {
    await page.goto("/records/trophies");
    await expect(page.locator("h1, h2").first()).toBeVisible();

    const starContainers = page.locator('[aria-label*="championship"]');
    const count = await starContainers.count();

    for (let i = 0; i < count; i++) {
      const role = await starContainers.nth(i).getAttribute("role");
      expect(role).toBe("img");
    }
  });

  test("stars render with fill for solid appearance", async ({ page }) => {
    await page.goto("/records/trophies");
    await expect(page.locator("h1, h2").first()).toBeVisible();

    const starContainers = page.locator('[role="img"][aria-label*="championship"]');
    const containerCount = await starContainers.count();

    if (containerCount === 0) return;

    // Check that SVG has fill="currentColor" attribute for solid rendering
    const firstSvg = starContainers.first().locator("svg").first();
    await expect(firstSvg).toBeVisible();

    // Lucide renders fill as an attribute; verify the star is filled
    const fill = await firstSvg.evaluate((el) => {
      return window.getComputedStyle(el).fill;
    });

    // The fill should resolve to a color (not "none" which would be outline-only)
    expect(fill).not.toBe("none");
  });
});
