import { test, expect } from "@playwright/test";

// Desktop chrome (topbar) is visible at lg+ (>=1024px).
const DESKTOP = { width: 1280, height: 800 };

const EXPECTED = [
  { label: "Hub", href: "/" },
  { label: "Teams", href: "/teams" },
  { label: "Records", href: "/records" },
  { label: "Drafts", href: "/drafts" },
  { label: "Players", href: "/players" },
];

test.describe("Site Navigation — desktop topbar", () => {
  test.use({ viewport: DESKTOP });

  test("homepage loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Harambe Memorial League Memorial League/);
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("topbar renders 5 pills in correct order with correct hrefs", async ({
    page,
  }) => {
    await page.goto("/");
    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav).toBeVisible();

    const links = nav.locator("ul a");
    await expect(links).toHaveCount(EXPECTED.length);

    const texts = await links.allInnerTexts();
    expect(texts.map((t) => t.trim())).toEqual(EXPECTED.map((e) => e.label));

    for (let i = 0; i < EXPECTED.length; i++) {
      expect(await links.nth(i).getAttribute("href")).toBe(EXPECTED[i].href);
    }

    // Matchups + History are routes, not nav pills.
    await expect(nav.getByText("Matchups", { exact: true })).toHaveCount(0);
    await expect(nav.getByText("History", { exact: true })).toHaveCount(0);
  });

  test("brand wordmark is present and links to /", async ({ page }) => {
    await page.goto("/");
    const brand = page.locator('a[aria-label="HMLML, Home"]').first();
    await expect(brand).toBeVisible();
    await expect(brand).toHaveText("HMLML");
    expect(await brand.getAttribute("href")).toBe("/");
  });

  test("active pill carries aria-current=page and no other does", async ({
    page,
  }) => {
    await page.goto("/teams");
    const nav = page.locator('nav[aria-label="Main navigation"]');
    const links = nav.locator("ul a");

    const teams = links.filter({ hasText: "Teams" });
    await expect(teams).toHaveAttribute("aria-current", "page");

    const count = await links.count();
    for (let i = 0; i < count; i++) {
      const text = (await links.nth(i).innerText()).trim();
      const current = await links.nth(i).getAttribute("aria-current");
      if (text === "Teams") expect(current).toBe("page");
      else expect(current).toBeNull();
    }
  });

  test("Hub uses exact-match active state (not active on /teams)", async ({
    page,
  }) => {
    await page.goto("/teams");
    const hub = page
      .locator('nav[aria-label="Main navigation"] ul a')
      .filter({ hasText: "Hub" });
    expect(await hub.getAttribute("aria-current")).toBeNull();
  });

  test("nav renders on every primary route", async ({ page }) => {
    for (const { href } of EXPECTED) {
      await page.goto(href);
      const nav = page.locator('nav[aria-label="Main navigation"]');
      await expect(nav).toBeVisible();
      await expect(nav.locator("ul a")).toHaveCount(EXPECTED.length);
    }
  });
});

test.describe("Skip link", () => {
  test("skip-to-content link is the first focusable element", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");

    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeAttached();

    // First Tab from the top of the document lands on the skip link.
    await page.keyboard.press("Tab");
    const focusedHref = await page.evaluate(
      () => (document.activeElement as HTMLAnchorElement)?.getAttribute("href")
    );
    expect(focusedHref).toBe("#main-content");
  });
});
