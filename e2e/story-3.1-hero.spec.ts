import { test, expect } from "@playwright/test";

// ============================================================================
// Story 3.1: League Identity Hero
// ============================================================================

test.describe("League Identity Hero", () => {
  // T01: Hero section exists with the league name
  test("T01: hero section exists with league name", async ({ page }) => {
    await page.goto("/");

    // The hero is the first <section> on the page, containing the league name
    const hero = page.locator("section").first();
    await expect(hero).toBeVisible();

    const h1 = hero.locator("h1");
    await expect(h1).toHaveText("Harambe Memorial League Memorial League");
  });

  // T02: "Est. 2017" badge is visible
  test("T02: Est. 2017 badge is visible", async ({ page }) => {
    await page.goto("/");

    const hero = page.locator("section").first();
    const badge = hero.getByText("Est. 2017");
    await expect(badge).toBeVisible();
  });

  // T03: A tagline is displayed
  test("T03: tagline is displayed below league name", async ({ page }) => {
    await page.goto("/");

    const hero = page.locator("section").first();
    // The tagline is a body-lg paragraph; it should be non-empty text
    const tagline = hero.locator("p.text-body-lg");
    await expect(tagline).toBeVisible();
    const text = await tagline.innerText();
    expect(text.length).toBeGreaterThan(0);
  });

  // T04: Season/week context is shown (conditional on DB data)
  test("T04: season context is shown or gracefully absent", async ({ page }) => {
    await page.goto("/");

    const hero = page.locator("section").first();
    // The season context uses text-body-sm class
    const seasonLines = hero.locator("p.text-body-sm");
    const count = await seasonLines.count();

    if (count > 0) {
      // If present, it should contain "Season"
      const text = await seasonLines.first().innerText();
      expect(text).toContain("Season");
    }
    // If count is 0, that is acceptable (no season data in DB)
  });

  // T05: Hero has a green-tinted background
  test("T05: hero has green-tinted background", async ({ page }) => {
    await page.goto("/");

    const hero = page.locator("section").first();
    // The hero section uses bg-primary/[0.04] which applies a green tint
    // Check that the background-color is not fully transparent or pure white
    const bgColor = await hero.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    // bg-primary/[0.04] with --primary (#2D5A3D) at 4% opacity
    // Modern browsers may use oklab, rgba, or other color spaces
    // Verify it has a non-zero alpha (0.04) and is not plain white or transparent
    expect(bgColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(bgColor).not.toBe("rgb(255, 255, 255)");
    expect(bgColor).not.toBe("transparent");
    // Should contain an alpha/opacity component (0.04)
    expect(bgColor).toContain("0.04");
  });

  // T06: Display weight typography (font-weight 900, font-size >= 48px)
  test("T06: h1 uses display weight typography", async ({ page }) => {
    await page.goto("/");

    const hero = page.locator("section").first();
    const h1 = hero.locator("h1");

    const fontWeight = await h1.evaluate((el) =>
      window.getComputedStyle(el).fontWeight
    );
    expect(fontWeight).toBe("900");

    const fontSize = await h1.evaluate((el) =>
      parseFloat(window.getComputedStyle(el).fontSize)
    );
    expect(fontSize).toBeGreaterThanOrEqual(48);
  });

  // T07: No em-dashes exist in hero text content
  test("T07: no em-dashes in hero text content", async ({ page }) => {
    await page.goto("/");

    const hero = page.locator("section").first();
    const textContent = await hero.innerText();
    // Check for em-dash character (U+2014)
    expect(textContent).not.toContain("\u2014");
    // Also check for en-dash (U+2013) for safety
    expect(textContent).not.toContain("\u2013");
  });

  // T08: Hero is responsive at mobile viewport (375px)
  test("T08: hero content visible and centered at 375px mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const hero = page.locator("section").first();
    await expect(hero).toBeVisible();

    const h1 = hero.locator("h1");
    await expect(h1).toBeVisible();

    // Verify text is centered
    const textAlign = await hero.evaluate((el) =>
      window.getComputedStyle(el).textAlign
    );
    expect(textAlign).toBe("center");

    // Verify the hero fits within the viewport width
    const heroBox = await hero.boundingBox();
    expect(heroBox).not.toBeNull();
    expect(heroBox!.width).toBeLessThanOrEqual(375);

    // The Est. 2017 badge should still be visible
    const badge = hero.getByText("Est. 2017");
    await expect(badge).toBeVisible();

    // The tagline should still be visible
    const tagline = hero.locator("p.text-body-lg");
    await expect(tagline).toBeVisible();
  });

  // T09: No images or SVGs in hero section
  test("T09: hero contains no images or SVGs", async ({ page }) => {
    await page.goto("/");

    const hero = page.locator("section").first();
    const images = hero.locator("img");
    await expect(images).toHaveCount(0);

    const svgs = hero.locator("svg");
    await expect(svgs).toHaveCount(0);
  });
});
