import { test, expect } from "@playwright/test";
import {
  seedHeroGradientData,
  cleanupHeroGradientData,
  TEST_DATA,
} from "./helpers/seed-hero-gradient";

test.describe("Story 4.3: Franchise Page Hero Gradient", () => {
  test.describe.configure({ mode: "serial" });

  let seasonId: number;

  test.beforeAll(async () => {
    seasonId = await seedHeroGradientData();
  });

  test.afterAll(async () => {
    await cleanupHeroGradientData(seasonId);
  });

  // ---------------------------------------------------------------------------
  // AC-1: Hero section has linear-gradient background when brandingColor exists
  // ---------------------------------------------------------------------------

  test("AC-1a: hero section has linear-gradient background for branded franchise", async ({
    page,
  }) => {
    await page.goto(`/teams/${TEST_DATA.branded.slug}`);

    const heroSection = page.locator("section").first();
    await expect(heroSection).toBeVisible();

    const inlineBackground = await heroSection.evaluate(
      (el) => el.style.background
    );

    expect(inlineBackground).toContain("linear-gradient");
  });

  // ---------------------------------------------------------------------------
  // AC-1b: Gradient direction is top-to-bottom (default, browser may omit "to bottom")
  // ---------------------------------------------------------------------------

  test("AC-1b: gradient direction is top-to-bottom", async ({ page }) => {
    await page.goto(`/teams/${TEST_DATA.branded.slug}`);

    const heroSection = page.locator("section").first();
    const inlineBackground = await heroSection.evaluate(
      (el) => el.style.background
    );

    // Browser normalizes "to bottom" (default) by omitting it from the serialized value.
    // Verify the gradient does NOT contain a non-default direction keyword.
    expect(inlineBackground).toContain("linear-gradient(");
    expect(inlineBackground).not.toMatch(/to (top|left|right)/);
    expect(inlineBackground).not.toMatch(/\d+deg/);
  });

  // ---------------------------------------------------------------------------
  // AC-1c: Gradient uses low opacity (5-8% range)
  // Browser normalizes hex+alpha to rgba, so check rgba opacity value
  // ---------------------------------------------------------------------------

  test("AC-1c: gradient color uses low opacity (5-8% range)", async ({
    page,
  }) => {
    await page.goto(`/teams/${TEST_DATA.branded.slug}`);

    const heroSection = page.locator("section").first();
    const inlineBackground = await heroSection.evaluate(
      (el) => el.style.background
    );

    // Browser converts #RRGGBBAA to rgba(r, g, b, alpha)
    // Extract the alpha value from the rgba() color stop
    const rgbaMatch = inlineBackground.match(
      /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/
    );
    expect(rgbaMatch).toBeTruthy();

    if (rgbaMatch) {
      const alpha = parseFloat(rgbaMatch[1]);
      // 5% = 0.05, 8% = 0.08; allow small rounding tolerance
      expect(alpha).toBeGreaterThanOrEqual(0.04);
      expect(alpha).toBeLessThanOrEqual(0.09);
    }
  });

  // ---------------------------------------------------------------------------
  // AC-1d: Gradient contains the franchise's brandingColor RGB values
  // ---------------------------------------------------------------------------

  test("AC-1d: gradient uses the franchise brandingColor RGB values", async ({
    page,
  }) => {
    await page.goto(`/teams/${TEST_DATA.branded.slug}`);

    const heroSection = page.locator("section").first();
    const inlineBackground = await heroSection.evaluate(
      (el) => el.style.background
    );

    // Convert brandingColor (#2D5A3D) to expected RGB components
    const hex = TEST_DATA.branded.brandingColor;
    const r = parseInt(hex.slice(1, 3), 16); // 45
    const g = parseInt(hex.slice(3, 5), 16); // 90
    const b = parseInt(hex.slice(5, 7), 16); // 61

    // The rgba string should contain these RGB values
    expect(inlineBackground).toContain(`${r}, ${g}, ${b}`);
  });

  // ---------------------------------------------------------------------------
  // AC-1e: Gradient fades to transparent
  // ---------------------------------------------------------------------------

  test("AC-1e: gradient fades to transparent", async ({ page }) => {
    await page.goto(`/teams/${TEST_DATA.branded.slug}`);

    const heroSection = page.locator("section").first();
    const inlineBackground = await heroSection.evaluate(
      (el) => el.style.background
    );

    expect(inlineBackground).toContain("transparent");
  });

  // ---------------------------------------------------------------------------
  // AC-2: No gradient when brandingColor is absent
  // ---------------------------------------------------------------------------

  test("AC-2: no gradient applied for franchise without brandingColor", async ({
    page,
  }) => {
    await page.goto(`/teams/${TEST_DATA.unbranded.slug}`);

    const heroSection = page.locator("section").first();
    await expect(heroSection).toBeVisible();

    const inlineBackground = await heroSection.evaluate(
      (el) => el.style.background
    );

    // Should have no inline background style (empty string)
    expect(inlineBackground).toBeFalsy();
  });

  // ---------------------------------------------------------------------------
  // AC-3: Text readability - all text in hero is visible over gradient
  // ---------------------------------------------------------------------------

  test("AC-3a: franchise name is visible in hero section over gradient", async ({
    page,
  }) => {
    await page.goto(`/teams/${TEST_DATA.branded.slug}`);

    const heroSection = page.locator("section").first();
    await expect(heroSection).toBeVisible();

    const heroText = await heroSection.innerText();
    expect(heroText).toContain(TEST_DATA.branded.name);
  });

  test("AC-3b: back link is visible in hero over gradient", async ({
    page,
  }) => {
    await page.goto(`/teams/${TEST_DATA.branded.slug}`);

    const heroSection = page.locator("section").first();
    const backLink = heroSection.locator("a[href='/teams']");
    await expect(backLink).toBeVisible();
  });

  test("AC-3c: stat numbers are visible in hero over gradient", async ({
    page,
  }) => {
    await page.goto(`/teams/${TEST_DATA.branded.slug}`);

    const heroSection = page.locator("section").first();
    const heroText = await heroSection.innerText();

    // Should contain win-loss record from seeded data (10-4)
    expect(heroText).toContain("10-4");
    // Should contain points total
    expect(heroText).toContain("1850.5");
  });

  test("AC-3d: owner name is visible in hero over gradient", async ({
    page,
  }) => {
    await page.goto(`/teams/${TEST_DATA.branded.slug}`);

    const heroSection = page.locator("section").first();
    const heroText = await heroSection.innerText();

    expect(heroText).toContain("Gradient Owner");
  });

  // ---------------------------------------------------------------------------
  // AC-4: Decorative only - gradient is CSS background, not semantic
  // ---------------------------------------------------------------------------

  test("AC-4a: gradient is applied via inline style on section, not a separate element", async ({
    page,
  }) => {
    await page.goto(`/teams/${TEST_DATA.branded.slug}`);

    const heroSection = page.locator("section").first();

    // No aria-hidden gradient overlay element
    const overlayDivs = heroSection.locator(
      'div[aria-hidden="true"][style*="gradient"]'
    );
    await expect(overlayDivs).toHaveCount(0);

    // The gradient is on the section element itself (inline style)
    const inlineBackground = await heroSection.evaluate(
      (el) => el.style.background
    );
    expect(inlineBackground).toContain("linear-gradient");
  });

  test("AC-4b: all content remains identifiable without gradient (decorative only)", async ({
    page,
  }) => {
    await page.goto(`/teams/${TEST_DATA.unbranded.slug}`);

    // Unbranded franchise has no gradient but all the same content structure
    const heroSection = page.locator("section").first();
    await expect(heroSection).toBeVisible();

    const heroText = await heroSection.innerText();
    // Team name, owner, and stats are all present without gradient
    expect(heroText).toContain(TEST_DATA.unbranded.name);
    expect(heroText).toContain("Plain Owner");
    expect(heroText).toContain("6-8");
  });
});
