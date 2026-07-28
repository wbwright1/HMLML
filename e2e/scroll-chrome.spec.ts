import { test, expect } from "@playwright/test";

// Mobile chrome (header + bottom dock) renders below lg (<1024px).
test.use({ viewport: { width: 390, height: 844 } });

const headerWrapper = (page: import("@playwright/test").Page) =>
  page.locator('[data-scroll-chrome].chrome-top');
const dockWrapper = (page: import("@playwright/test").Page) =>
  page.locator('[data-scroll-chrome].chrome-bottom');

test.describe("Mobile nav scroll chrome", () => {
  test("both header and dock start visible (data-hidden=false)", async ({
    page,
  }) => {
    await page.goto("/records");
    await expect(headerWrapper(page)).toHaveAttribute("data-hidden", "false");
    await expect(dockWrapper(page)).toHaveAttribute("data-hidden", "false");
  });

  test("scrolling down past the hide threshold hides both bars", async ({
    page,
  }) => {
    await page.goto("/records");

    // Records page has enough content to scroll on mobile.
    await page.evaluate(() => window.scrollTo(0, 400));
    // Nudge again to register a clear downward delta past hysteresis.
    await page.evaluate(() => window.scrollTo(0, 600));

    await expect(headerWrapper(page)).toHaveAttribute("data-hidden", "true");
    await expect(dockWrapper(page)).toHaveAttribute("data-hidden", "true");
  });

  test("scrolling back up reveals both bars again", async ({ page }) => {
    await page.goto("/records");

    await page.evaluate(() => window.scrollTo(0, 400));
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect(headerWrapper(page)).toHaveAttribute("data-hidden", "true");

    await page.evaluate(() => window.scrollTo(0, 550));
    await page.evaluate(() => window.scrollTo(0, 500));

    await expect(headerWrapper(page)).toHaveAttribute("data-hidden", "false");
    await expect(dockWrapper(page)).toHaveAttribute("data-hidden", "false");
  });

  test("scrolling back to the very top always shows the chrome", async ({
    page,
  }) => {
    await page.goto("/records");

    await page.evaluate(() => window.scrollTo(0, 400));
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect(headerWrapper(page)).toHaveAttribute("data-hidden", "true");

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(headerWrapper(page)).toHaveAttribute("data-hidden", "false");
    await expect(dockWrapper(page)).toHaveAttribute("data-hidden", "false");
  });

  test("header pins to the top and dock pins to the bottom", async ({
    page,
  }) => {
    await page.goto("/records");

    const headerBox = await headerWrapper(page).boundingBox();
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

    // The scroll-chrome wrappers only render mobile bars (they carry lg:hidden);
    // the desktop topbar itself is not wrapped.
    const topbar = page.locator('nav[aria-label="Main navigation"]');
    await expect(topbar).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 600));
    await expect(topbar).toBeVisible();
  });
});
