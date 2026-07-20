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
  // AC-1 (Command Center redesign): the franchise-wide gradient wash is gone.
  // The hero section renders on the plain dark canvas/surface frame for every
  // franchise, branded or not; brandingColor survives only as a subtle ring
  // around the dynasty crest (FranchiseIdentity's BrandedCrest wrapper,
  // data-branding="true").
  // ---------------------------------------------------------------------------

  test("AC-1a: hero section has no per-team gradient wash, branded or not", async ({
    page,
  }) => {
    await page.goto(`/teams/${TEST_DATA.branded.slug}`);

    const heroSection = page.locator("section").first();
    await expect(heroSection).toBeVisible();

    const inlineBackground = await heroSection.evaluate(
      (el) => el.style.background
    );

    // The hero frame is canvas/surface for every franchise now — no inline
    // background style at all.
    expect(inlineBackground).toBeFalsy();
  });

  test("AC-1b: branded franchise's crest carries a brandingColor ring", async ({
    page,
  }) => {
    await page.goto(`/teams/${TEST_DATA.branded.slug}`);

    const heroSection = page.locator("section").first();
    const ring = heroSection.locator('[data-branding="true"]').first();
    await expect(ring).toHaveCount(1);

    const boxShadow = await ring.evaluate(
      (el) => window.getComputedStyle(el).boxShadow
    );

    // brandingColor is #2D5A3D -> rgb(45, 90, 61)
    const hex = TEST_DATA.branded.brandingColor;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    expect(boxShadow).toContain(`${r}, ${g}, ${b}`);
  });

  test("AC-1c: unbranded franchise's crest carries no ring", async ({
    page,
  }) => {
    await page.goto(`/teams/${TEST_DATA.unbranded.slug}`);

    const heroSection = page.locator("section").first();
    const ring = heroSection.locator('[data-branding="true"]');
    await expect(ring).toHaveCount(0);

    const unbrandedCrestWrapper = heroSection
      .locator('[data-branding="false"]')
      .first();
    await expect(unbrandedCrestWrapper).toHaveCount(1);
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

  test("AC-4a: brandingColor ring is CSS box-shadow on the crest wrapper, not a separate overlay element", async ({
    page,
  }) => {
    await page.goto(`/teams/${TEST_DATA.branded.slug}`);

    const heroSection = page.locator("section").first();

    // No aria-hidden gradient/ring overlay element
    const overlayDivs = heroSection.locator(
      'div[aria-hidden="true"][style*="gradient"]'
    );
    await expect(overlayDivs).toHaveCount(0);

    // The ring is a box-shadow on the crest wrapper itself (inline style),
    // not a page-wide gradient.
    const ring = heroSection.locator('[data-branding="true"]').first();
    const inlineBoxShadow = await ring.evaluate((el) => el.style.boxShadow);
    expect(inlineBoxShadow).toBeTruthy();

    const inlineBackground = await heroSection.evaluate(
      (el) => el.style.background
    );
    expect(inlineBackground).toBeFalsy();
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
