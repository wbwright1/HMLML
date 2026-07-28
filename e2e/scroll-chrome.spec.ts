import { test, expect } from "@playwright/test";

// Mobile chrome (header + bottom dock) renders below lg (<1024px).
test.use({ viewport: { width: 390, height: 844 } });

const mobileHeader = (page: import("@playwright/test").Page) =>
  page.locator("header .sticky.top-0.lg\\:hidden").first();
const dockWrapper = (page: import("@playwright/test").Page) =>
  page.locator("[data-scroll-chrome].chrome-bottom");

test.describe("Mobile nav scroll chrome", () => {
  test("dock starts visible; header has no scroll-chrome wrapper", async ({
    page,
  }) => {
    await page.goto("/records");
    await expect(dockWrapper(page)).toHaveAttribute("data-hidden", "false");
    // The header is intentionally NOT scroll-aware (stays pinned).
    await expect(page.locator("[data-scroll-chrome].chrome-top")).toHaveCount(0);
  });

  test("scrolling down past the hide threshold hides the dock but not the header", async ({
    page,
  }) => {
    await page.goto("/records");

    // Records page has enough content to scroll on mobile.
    await page.evaluate(() => window.scrollTo(0, 400));
    // Nudge again to register a clear downward delta past hysteresis.
    await page.evaluate(() => window.scrollTo(0, 600));

    await expect(dockWrapper(page)).toHaveAttribute("data-hidden", "true");
    // Header stays pinned and visible at the top of the viewport.
    const headerBox = await mobileHeader(page).boundingBox();
    expect(headerBox).not.toBeNull();
    expect(headerBox!.y).toBe(0);
  });

  test("scrolling back up reveals the dock again", async ({ page }) => {
    await page.goto("/records");

    await page.evaluate(() => window.scrollTo(0, 400));
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect(dockWrapper(page)).toHaveAttribute("data-hidden", "true");

    await page.evaluate(() => window.scrollTo(0, 550));
    await page.evaluate(() => window.scrollTo(0, 500));

    await expect(dockWrapper(page)).toHaveAttribute("data-hidden", "false");
  });

  test("scrolling back to the very top always shows the dock", async ({
    page,
  }) => {
    await page.goto("/records");

    await page.evaluate(() => window.scrollTo(0, 400));
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect(dockWrapper(page)).toHaveAttribute("data-hidden", "true");

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(dockWrapper(page)).toHaveAttribute("data-hidden", "false");
  });

  test("header pins to the top and dock pins to the bottom", async ({
    page,
  }) => {
    await page.goto("/records");

    const headerBox = await mobileHeader(page).boundingBox();
    const dockBox = await dockWrapper(page).boundingBox();
    expect(headerBox).not.toBeNull();
    expect(dockBox).not.toBeNull();
    expect(headerBox!.y).toBe(0);
    expect(dockBox!.y + dockBox!.height).toBeGreaterThan(844 - 40);
  });
});

test.describe("Desktop chrome is untouched by scroll", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("desktop topbar has no scroll-chrome wrapper and stays visible on scroll", async ({
    page,
  }) => {
    await page.goto("/records");

    // The scroll-chrome wrapper only renders the mobile dock (it carries
    // lg:hidden); the desktop topbar itself is not wrapped.
    const topbar = page.locator('nav[aria-label="Main navigation"]');
    await expect(topbar).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 600));
    await expect(topbar).toBeVisible();
  });
});
