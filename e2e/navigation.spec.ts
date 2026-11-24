import { test, expect } from "@playwright/test";

// Desktop chrome (topbar) is visible at lg+ (>=1024px).
const DESKTOP = { width: 1280, height: 800 };

const EXPECTED = [
  { label: "Hub", href: "/" },
  { label: "Teams", href: "/teams" },
  { label: "Records", href: "/records" },
  { label: "Drafts", href: "/drafts" },
  { label: "The Book", href: "/book" },
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

test.describe("Site Navigation: narrow desktop (1024-1279px)", () => {
  // Between lg and xl the topbar used to wrap pill and live-pill text. The
  // search collapses to a 36px icon button there and nothing may wrap.
  test.use({ viewport: { width: 1100, height: 800 } });

  test("no topbar pill wraps, and search is an icon button that expands", async ({
    page,
  }) => {
    await page.goto("/");
    const topbar = page.locator('nav[aria-label="Main navigation"]').locator("..");
    await expect(topbar).toBeVisible();

    // Every nav pill renders on a single line: its height stays well under
    // two lines of 14px text.
    const pills = page.locator('nav[aria-label="Main navigation"] ul a');
    const pillCount = await pills.count();
    for (let i = 0; i < pillCount; i++) {
      const box = await pills.nth(i).boundingBox();
      expect(box, "pill should be laid out").not.toBeNull();
      expect(box!.height).toBeLessThan(40);
    }

    // The search field is collapsed to an icon trigger below xl.
    const combobox = page.getByRole("combobox", { name: "Search league" });
    await expect(combobox).toBeHidden();
    const trigger = page.getByRole("button", { name: "Search league, Command K" });
    await expect(trigger).toBeVisible();
    const triggerBox = await trigger.boundingBox();
    expect(Math.round(triggerBox!.width)).toBe(36);

    await trigger.click();
    await expect(combobox).toBeVisible();
    await expect(combobox).toBeFocused();

    // The topbar itself stays a single 64px row.
    const bar = page.locator("div.sticky.hidden.h-16").first();
    const barBox = await bar.boundingBox();
    expect(Math.round(barBox!.height)).toBe(64);
  });

  test("signed-out header CTA is the 36px gold 'Claim your team' button, unwrapped", async ({
    page,
  }) => {
    await page.goto("/");
    // Scope to the topbar row: the hub's smack slot also says "Claim your team."
    const topbar = page.locator('nav[aria-label="Main navigation"]').locator("..");
    const cta = topbar.locator('a[href="/claim"]', { hasText: "Claim your team" });
    await expect(cta).toBeVisible();
    const box = await cta.boundingBox();
    expect(Math.round(box!.height)).toBe(36);
    const whiteSpace = await cta.evaluate((el) => getComputedStyle(el).whiteSpace);
    expect(whiteSpace).toBe("nowrap");
  });
});

test.describe("Site Navigation: mobile header", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("signed out, a compact Claim pill with a 44px hit area links to /claim", async ({
    page,
  }) => {
    await page.goto("/");
    const claim = page
      .locator("header")
      .locator('a[href="/claim"]', { hasText: /^Claim$/ })
      .filter({ visible: true });
    await expect(claim).toBeVisible();
    const box = await claim.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    // It sits in the top header, beside the search trigger.
    expect(box!.y).toBeLessThan(56);
    const search = page.getByRole("button", { name: "Search teams, players, records" });
    const searchBox = await search.boundingBox();
    expect(searchBox!.width).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThan(searchBox!.x);
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
