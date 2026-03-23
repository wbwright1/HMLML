import { test, expect } from "@playwright/test";

test.describe("Site Navigation", () => {
  test("homepage loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Harambe Memorial League Memorial League/);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("all navigation routes load without error", async ({ page }) => {
    const routes = ["/matchups", "/teams", "/records", "/drafts", "/seasons", "/players"];
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("h1, h2")).toBeVisible();
    }
  });

  test("skip to content link exists", async ({ page }) => {
    await page.goto("/");
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeAttached();
  });
});
