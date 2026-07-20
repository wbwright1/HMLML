import { test, expect } from "@playwright/test";

// Mobile chrome (header + bottom dock) renders below lg (<1024px).
test.use({ viewport: { width: 375, height: 812 } });

const TABS = [
  { label: "Hub", href: "/" },
  { label: "Teams", href: "/teams" },
  { label: "Records", href: "/records" },
  { label: "Drafts", href: "/drafts" },
  { label: "Players", href: "/players" },
];

test.describe("Mobile dock", () => {
  test("dock is fixed at the bottom with 5 tabs and a search bar", async ({
    page,
  }) => {
    await page.goto("/");

    const dock = page.locator('nav[aria-label="Mobile navigation"]');
    await expect(dock).toBeVisible();
    await expect(dock.locator("a")).toHaveCount(5);

    // Persistent search bar sits directly above the tab bar.
    const searchBar = page.getByRole("button", {
      name: "Search teams, players, records",
    });
    await expect(searchBar).toBeVisible();
    const searchBox = await searchBar.boundingBox();
    const dockBox = await dock.boundingBox();
    expect(searchBox).not.toBeNull();
    expect(dockBox).not.toBeNull();
    // Search bar is above the tab bar.
    expect(searchBox!.y).toBeLessThan(dockBox!.y);

    // Tab bar sits at the bottom of the viewport (within the dock's own padding).
    expect(dockBox!.y + dockBox!.height).toBeGreaterThan(812 - 40);
  });

  test("no hamburger button anywhere", async ({ page }) => {
    for (const route of ["/", "/teams"]) {
      await page.goto(route);
      await expect(
        page.locator('button[aria-label="Open navigation"]')
      ).toHaveCount(0);
      await expect(
        page.locator('button[aria-label="Close navigation"]')
      ).toHaveCount(0);
      await expect(page.locator("#mobile-nav-menu")).toHaveCount(0);
    }
  });

  test("each tab navigates to its route", async ({ page }) => {
    for (const { label, href } of TABS) {
      await page.goto("/");
      const dock = page.locator('nav[aria-label="Mobile navigation"]');
      await dock.locator("a").filter({ hasText: label }).click();
      await page.waitForURL((url) => url.pathname === href);
      expect(new URL(page.url()).pathname).toBe(href);
    }
  });

  test("active tab carries aria-current=page", async ({ page }) => {
    await page.goto("/records");
    const dock = page.locator('nav[aria-label="Mobile navigation"]');
    const records = dock.locator("a").filter({ hasText: "Records" });
    await expect(records).toHaveAttribute("aria-current", "page");

    const hub = dock.locator("a").filter({ hasText: "Hub" });
    expect(await hub.getAttribute("aria-current")).toBeNull();
  });

  test("content clears the dock — footer is not obscured", async ({ page }) => {
    await page.goto("/");

    // Footer reserves bottom clearance for the dock on mobile.
    const footer = page.locator("footer");
    const paddingBottom = await footer.evaluate((el) =>
      parseFloat(window.getComputedStyle(el).paddingBottom)
    );
    // 148px clearance + env(safe-area-inset-bottom) (0 in headless).
    expect(paddingBottom).toBeGreaterThanOrEqual(140);

    // The footer text sits above the top edge of the dock.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const footerText = footer.locator("text=Harambe Memorial League");
    await expect(footerText).toBeVisible();
    const textBox = await footerText.boundingBox();
    const dockBox = await page
      .locator('nav[aria-label="Mobile navigation"]')
      .boundingBox();
    expect(textBox).not.toBeNull();
    expect(dockBox).not.toBeNull();
    expect(textBox!.y).toBeLessThan(dockBox!.y);
  });

  test("desktop topbar nav is not visible on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.locator('nav[aria-label="Main navigation"]')
    ).toBeHidden();
  });
});
