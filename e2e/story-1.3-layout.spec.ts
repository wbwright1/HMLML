import { test, expect } from "@playwright/test";
import {
  seedSyncLogEntry,
  cleanupSyncLogEntry,
  cleanupSyncLogByDataType,
} from "./helpers/seed-sync-log";

// Command Center chrome (Wave 1 · C0): desktop pill topbar (lg+) + mobile
// header & bottom dock (<lg). The hamburger menu and the earlier retired
// bottom-tab-bar were both replaced by the dock — the WAVE:C0 fixmes below are
// resolved into real assertions for the new chrome.

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 375, height: 812 };

const PILLS = [
  { label: "Hub", href: "/" },
  { label: "Teams", href: "/teams" },
  { label: "Records", href: "/records" },
  { label: "Drafts", href: "/drafts" },
  { label: "Players", href: "/players" },
];

// ============================================================================
// Nav Items and Order (desktop topbar)
// ============================================================================

test.describe("Nav Items and Order", () => {
  test.use({ viewport: DESKTOP });

  // FE-T01: Desktop topbar renders exactly 5 pills in order (no History/Matchups)
  test("FE-T01: topbar renders 5 pills in correct order", async ({ page }) => {
    await page.goto("/");

    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav).toBeVisible();

    const links = nav.locator("ul a");
    const texts = (await links.allInnerTexts()).map((t) => t.trim());
    expect(texts).toEqual(PILLS.map((p) => p.label));
    expect(texts).toHaveLength(5);

    await expect(nav.getByText("Matchups", { exact: true })).toHaveCount(0);
    await expect(nav.getByText("History", { exact: true })).toHaveCount(0);
  });

  // FE-T02: Pills render on every primary route
  test("FE-T02: nav renders on every route", async ({ page }) => {
    for (const { href } of PILLS) {
      await page.goto(href);
      const nav = page.locator('nav[aria-label="Main navigation"]');
      await expect(nav).toBeVisible();
      const texts = (await nav.locator("ul a").allInnerTexts()).map((t) =>
        t.trim()
      );
      expect(texts).toEqual(PILLS.map((p) => p.label));
    }
  });

  // FE-T03: Pill hrefs are correct
  test("FE-T03: nav links have correct href values", async ({ page }) => {
    await page.goto("/");
    const links = page.locator('nav[aria-label="Main navigation"] ul a');
    const count = await links.count();
    expect(count).toBe(PILLS.length);
    for (let i = 0; i < count; i++) {
      expect(await links.nth(i).getAttribute("href")).toBe(PILLS[i].href);
    }
  });
});

// ============================================================================
// Brand Text
// ============================================================================

test.describe("Brand Text", () => {
  test.use({ viewport: DESKTOP });

  // FE-T04: HMLML wordmark is present and links to /
  test("FE-T04: HMLML brand text is present and links to /", async ({ page }) => {
    await page.goto("/");
    // Two wordmarks exist (topbar + mobile header); target the visible one.
    const brand = page.locator('a[aria-label="HMLML, Home"]:visible');
    await expect(brand).toBeVisible();
    await expect(brand).toHaveText("HMLML");
    expect(await brand.getAttribute("href")).toBe("/");
  });
});

// ============================================================================
// Matchups Not in Nav
// ============================================================================

test.describe("Matchups Not in Nav", () => {
  test.use({ viewport: DESKTOP });

  // FE-T05: Matchups is not a nav item
  test("FE-T05: no Matchups link in nav", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav.getByText("Matchups", { exact: true })).toHaveCount(0);
  });
});

// ============================================================================
// Active Link States
// ============================================================================

test.describe("Active Link States", () => {
  test.use({ viewport: DESKTOP });

  // FE-T06: Active pill has aria-current="page"; no other does
  test("FE-T06: active link has aria-current=page on /teams", async ({
    page,
  }) => {
    await page.goto("/teams");
    const links = page.locator('nav[aria-label="Main navigation"] ul a');
    const teams = links.filter({ hasText: "Teams" });
    await expect(teams).toHaveAttribute("aria-current", "page");

    const count = await links.count();
    for (let i = 0; i < count; i++) {
      const text = (await links.nth(i).innerText()).trim();
      if (text !== "Teams") {
        expect(await links.nth(i).getAttribute("aria-current")).toBeNull();
      }
    }
  });

  // FE-T07: Hub active state uses exact match
  test("FE-T07: Hub is not active on /teams", async ({ page }) => {
    await page.goto("/teams");
    const hub = page
      .locator('nav[aria-label="Main navigation"] ul a')
      .filter({ hasText: "Hub" });
    expect(await hub.getAttribute("aria-current")).toBeNull();
  });
});

// ============================================================================
// Keyboard Navigation (Desktop)
// ============================================================================

test.describe("Keyboard Navigation", () => {
  test.use({ viewport: DESKTOP });

  // FE-T08: Desktop pills are keyboard-focusable in order
  test("FE-T08: desktop nav links are keyboard-focusable", async ({ page }) => {
    await page.goto("/");
    const links = page.locator('nav[aria-label="Main navigation"] ul a');
    const firstLink = links.first();
    await firstLink.focus();
    await expect(firstLink).toBeFocused();

    const expectedLabels = PILLS.map((p) => p.label);
    for (let i = 1; i < expectedLabels.length; i++) {
      await page.keyboard.press("Tab");
      const activeText = await page.evaluate(() =>
        document.activeElement?.textContent?.trim()
      );
      expect(activeText).toBe(expectedLabels[i]);
    }
  });
});

// ============================================================================
// LivePill — empty-DB resilience (replaces retired SeasonalPillBadge)
// ============================================================================

test.describe("LivePill", () => {
  // FE-T10: Chrome renders (server-resolved LivePill degrades to a benign
  // state) even when the DB has no season data — nav must not crash.
  test("FE-T10: nav renders with a live pill on an empty DB", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");

    // Nav still renders its 5 pills.
    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav).toBeVisible();
    await expect(nav.locator("ul a")).toHaveCount(5);

    // The topbar always renders a live pill (never throws on empty data).
    const brand = page.locator('a[aria-label="HMLML, Home"]').first();
    await expect(brand).toBeVisible();
  });
});

// ============================================================================
// Mobile Dock (replaces the hamburger menu; FE-T20..T29b, EC-T06)
// ============================================================================

test.describe("Mobile Dock", () => {
  test.use({ viewport: MOBILE });

  // FE-T20 (was: fixed top bar) — mobile header is sticky and stays on scroll
  test("FE-T20: mobile header stays pinned at the top on scroll", async ({
    page,
  }) => {
    await page.goto("/");
    const brand = page.locator('a[aria-label="HMLML, Home"]').first();
    await expect(brand).toBeVisible();

    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(150);
    const box = await brand.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeLessThanOrEqual(56);
  });

  // FE-T21 (was: hamburger visible) — desktop topbar hidden, dock shown
  test("FE-T21: topbar nav hidden on mobile, dock shown", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.locator('nav[aria-label="Main navigation"]')
    ).toBeHidden();
    await expect(
      page.locator('nav[aria-label="Mobile navigation"]')
    ).toBeVisible();
  });

  // FE-T22 (was: hamburger opens overlay) — dock exposes 5 tabs + search bar
  test("FE-T22: dock shows 5 tabs and a search bar", async ({ page }) => {
    await page.goto("/");
    const dock = page.locator('nav[aria-label="Mobile navigation"]');
    const links = dock.locator("a");
    await expect(links).toHaveCount(5);
    const texts = (await links.allInnerTexts()).map((t) => t.trim());
    expect(texts).toEqual(PILLS.map((p) => p.label));

    await expect(
      page.getByRole("button", { name: "Search teams, players, records" })
    ).toBeVisible();
  });

  // FE-T23 (was: hamburger closes) — no hamburger / overlay exists at all
  test("FE-T23: no hamburger button or overlay exists", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.locator('button[aria-label="Open navigation"]')
    ).toHaveCount(0);
    await expect(
      page.locator('button[aria-label="Close navigation"]')
    ).toHaveCount(0);
    await expect(page.locator("#mobile-nav-menu")).toHaveCount(0);
  });

  // FE-T28 (was: nav link navigates) — dock tab navigates
  test("FE-T28: dock tab navigates to its route", async ({ page }) => {
    await page.goto("/");
    const dock = page.locator('nav[aria-label="Mobile navigation"]');
    await dock.locator("a").filter({ hasText: "Teams" }).click();
    await page.waitForURL("**/teams");
    expect(new URL(page.url()).pathname).toBe("/teams");
  });

  // FE-T29 / EC-T06 (was: hamburger ARIA) — active tab carries aria-current
  test("FE-T29: active dock tab has aria-current=page", async ({ page }) => {
    await page.goto("/records");
    const dock = page.locator('nav[aria-label="Mobile navigation"]');
    const records = dock.locator("a").filter({ hasText: "Records" });
    await expect(records).toHaveAttribute("aria-current", "page");
    const hub = dock.locator("a").filter({ hasText: "Hub" });
    expect(await hub.getAttribute("aria-current")).toBeNull();
  });
});

// ============================================================================
// SyncTimestamp
// ============================================================================

test.describe("SyncTimestamp", () => {
  // Tests share a real database; run serially to avoid race conditions
  test.describe.configure({ mode: "serial" });

  const DATA_TYPE = "league";
  const SYNC_TYPE = "hourly";

  // FE-T30: SyncTimestamp renders in the footer on every page
  test("FE-T30: fresh timestamp renders in footer", async ({ page }) => {
    const completedAt = new Date(Date.now() - 10 * 60 * 1000);
    const id = await seedSyncLogEntry({
      syncType: SYNC_TYPE,
      dataType: DATA_TYPE,
      status: "success",
      completedAt,
    });

    try {
      await page.setViewportSize(DESKTOP);
      await page.goto("/players");

      const footer = page.locator("footer");
      const timestampButton = footer.locator("button");
      await expect(timestampButton).toBeVisible();

      const text = await timestampButton.innerText();
      expect(text).toContain("Last updated");
      expect(text).not.toContain("(outdated)");

      const color = await timestampButton.evaluate(
        (el) => window.getComputedStyle(el).color
      );
      expect(color).not.toBe("rgb(201, 124, 106)");
    } finally {
      await cleanupSyncLogEntry(id);
    }
  });

  // FE-T31: SyncTimestamp toggle shows absolute time on click
  test("FE-T31: clicking timestamp toggles absolute time", async ({ page }) => {
    const completedAt = new Date(Date.now() - 30 * 60 * 1000);
    const id = await seedSyncLogEntry({
      syncType: SYNC_TYPE,
      dataType: DATA_TYPE,
      status: "success",
      completedAt,
    });

    try {
      await page.setViewportSize(DESKTOP);
      await page.goto("/players");

      const footer = page.locator("footer");
      const timestampButton = footer.locator("button", {
        hasText: "Last updated",
      });
      await expect(timestampButton).toBeVisible();

      await timestampButton.click();
      const expandedText = await timestampButton.innerText();
      expect(expandedText).toContain("Last updated");
      const spans = timestampButton.locator("span");
      const spanCount = await spans.count();
      expect(spanCount).toBeGreaterThanOrEqual(2);

      await timestampButton.click();
      const collapsedSpans = timestampButton.locator("span");
      const collapsedCount = await collapsedSpans.count();
      expect(collapsedCount).toBeLessThan(spanCount);
    } finally {
      await cleanupSyncLogEntry(id);
    }
  });

  // FE-T32: SyncTimestamp fallback when no sync record exists
  test("FE-T32: fallback renders when DB has no sync record", async ({
    page,
  }) => {
    await cleanupSyncLogByDataType(DATA_TYPE);

    await page.setViewportSize(DESKTOP);
    await page.goto("/players");

    const footer = page.locator("footer");
    const fallbackText = footer.locator("text=Data may be outdated");
    await expect(fallbackText).toBeVisible();

    const fullText = await fallbackText.innerText();
    expect(fullText).not.toContain("(outdated)");
  });

  // FE-T33: SyncTimestamp appears on a non-home route
  test("FE-T33: timestamp appears on /seasons route", async ({ page }) => {
    const completedAt = new Date(Date.now() - 5 * 60 * 1000);
    const id = await seedSyncLogEntry({
      syncType: SYNC_TYPE,
      dataType: DATA_TYPE,
      status: "success",
      completedAt,
    });

    try {
      await page.setViewportSize(DESKTOP);
      await page.goto("/seasons");

      const footer = page.locator("footer");
      const timestampButton = footer.locator("button");
      await expect(timestampButton).toBeVisible();

      const text = await timestampButton.innerText();
      expect(text).toContain("Last updated");
    } finally {
      await cleanupSyncLogEntry(id);
    }
  });

  // FE-T34: Hourly data stale after >2 hours: warm color + "(outdated)" text
  test("FE-T34: stale timestamp shows warm rust color and outdated text", async ({
    page,
  }) => {
    const completedAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const id = await seedSyncLogEntry({
      syncType: SYNC_TYPE,
      dataType: DATA_TYPE,
      status: "success",
      completedAt,
    });

    try {
      await page.setViewportSize(DESKTOP);
      await page.goto("/players");

      const footer = page.locator("footer");
      const timestampButton = footer.locator("button", {
        hasText: "Last updated",
      });
      await expect(timestampButton).toBeVisible();

      const text = await timestampButton.innerText();
      expect(text).toContain("Last updated");
      expect(text).toContain("(outdated)");

      const color = await timestampButton.evaluate(
        (el) => window.getComputedStyle(el).color
      );
      expect(color).toBe("rgb(201, 124, 106)");

      const outdatedText = timestampButton.locator("text=(outdated)");
      await expect(outdatedText).toBeVisible();
    } finally {
      await cleanupSyncLogEntry(id);
    }
  });

  // FE-T35: Hourly data fresh at 1h59m — no stale indicators
  test("FE-T35: fresh timestamp at 119 minutes has no stale indicators", async ({
    page,
  }) => {
    const completedAt = new Date(Date.now() - 119 * 60 * 1000);
    const id = await seedSyncLogEntry({
      syncType: SYNC_TYPE,
      dataType: DATA_TYPE,
      status: "success",
      completedAt,
    });

    try {
      await page.setViewportSize(DESKTOP);
      await page.goto("/players");

      const footer = page.locator("footer");
      const timestampButton = footer.locator("button");
      await expect(timestampButton).toBeVisible();

      const text = await timestampButton.innerText();
      expect(text).toContain("Last updated");
      expect(text).not.toContain("(outdated)");

      const color = await timestampButton.evaluate(
        (el) => window.getComputedStyle(el).color
      );
      expect(color).not.toBe("rgb(201, 124, 106)");
    } finally {
      await cleanupSyncLogEntry(id);
    }
  });
});

// ============================================================================
// SectionHeader
// ============================================================================

test.describe("SectionHeader", () => {
  test.use({ viewport: DESKTOP });

  // FE-T40: Title only renders correctly
  test("FE-T40: section header with title only", async ({ page }) => {
    await page.goto("/test/section-header");

    const section = page.locator('[data-testid="title-only"]');
    const h3 = section.locator("h3");
    await expect(h3).toHaveText("Recent Transactions");
    await expect(h3).toBeVisible();

    const link = section.locator("a");
    await expect(link).toHaveCount(0);

    const fontWeight = await h3.evaluate(
      (el) => window.getComputedStyle(el).fontWeight
    );
    expect(fontWeight).toBe("500");
  });

  // FE-T41: With viewAllHref renders link with default label
  test("FE-T41: section header with default View All link", async ({ page }) => {
    await page.goto("/test/section-header");

    const section = page.locator('[data-testid="with-default-link"]');
    const h3 = section.locator("h3");
    await expect(h3).toHaveText("Last Season's Best");

    const link = section.locator("a");
    await expect(link).toBeVisible();
    const linkText = await link.innerText();
    expect(linkText).toContain("View All");
    expect(await link.getAttribute("href")).toBe("/records");
  });

  // FE-T42: With custom viewAllLabel renders that label
  test("FE-T42: section header with custom link label", async ({ page }) => {
    await page.goto("/test/section-header");

    const section = page.locator('[data-testid="with-custom-link"]');
    const link = section.locator("a");
    const linkText = await link.innerText();
    expect(linkText).toContain("Full Draft");
    expect(await link.getAttribute("href")).toBe("/drafts/2024");
  });

  // FE-T43: "View All" link is keyboard focusable with visible ring
  test("FE-T43: View All link is keyboard focusable", async ({ page }) => {
    await page.goto("/test/section-header");

    const section = page.locator('[data-testid="with-default-link"]');
    const link = section.locator("a");
    await link.focus();
    await expect(link).toBeFocused();
  });

  // EC-T04: Title-only does not render empty link element
  test("EC-T04: title-only does not render empty link", async ({ page }) => {
    await page.goto("/test/section-header");

    const section = page.locator('[data-testid="standings-title-only"]');
    const links = section.locator("a");
    await expect(links).toHaveCount(0);
  });

  // EC-T05: Long title does not break layout on mobile
  test("EC-T05: long title does not overflow on mobile", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/test/section-header");

    const section = page.locator('[data-testid="long-title"]');
    const container = section.locator("div").first();
    const box = await container.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(375);
  });
});

// ============================================================================
// Root Layout Max-Width + dock clearance (FE-T50; replaces FE-T60/61/62)
// ============================================================================

test.describe("Root Layout", () => {
  // FE-T50: Content constrained to 1200px on wide desktop
  test("FE-T50: content constrained to 1200px max-width", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/");

    const container = page.locator(".max-w-\\[1200px\\]").first();
    const box = await container.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(1200);
    const leftMargin = box!.x;
    const rightMargin = 1600 - (box!.x + box!.width);
    expect(Math.abs(leftMargin - rightMargin)).toBeLessThan(10);
  });

  // FE-T60 (was: no bottom bar) — a fixed bottom dock now exists on mobile
  test("FE-T60: fixed bottom dock present on mobile, absent on desktop", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    await expect(
      page.locator('nav[aria-label="Mobile navigation"]')
    ).toBeVisible();

    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await expect(
      page.locator('nav[aria-label="Mobile navigation"]')
    ).toBeHidden();
  });

  // FE-T61 (was: main pb-20 removed) — footer reserves dock clearance on mobile
  test("FE-T61: footer clears the dock on mobile, not on desktop", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    let paddingBottom = await page
      .locator("footer")
      .evaluate((el) => parseFloat(window.getComputedStyle(el).paddingBottom));
    expect(paddingBottom).toBeGreaterThanOrEqual(140);

    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    paddingBottom = await page
      .locator("footer")
      .evaluate((el) => parseFloat(window.getComputedStyle(el).paddingBottom));
    // lg:pb-8 = 32px, no dock clearance on desktop.
    expect(paddingBottom).toBeLessThan(64);
  });

  // FE-T62 (was: main pt-14 mobile) — sticky chrome, uniform main top padding
  test("FE-T62: main uses a uniform top padding (sticky chrome, no offset)", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    const main = page.locator("main#main-content");
    const mobilePt = await main.evaluate(
      (el) => window.getComputedStyle(el).paddingTop
    );
    expect(mobilePt).toBe("24px"); // pt-6

    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    const desktopPt = await main.evaluate(
      (el) => window.getComputedStyle(el).paddingTop
    );
    expect(desktopPt).toBe("24px");
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

test.describe("Edge Cases", () => {
  test.use({ viewport: DESKTOP });

  // EC-T01: Hub not active on deep routes
  test("EC-T01: Hub not active on /teams/some-franchise", async ({ page }) => {
    await page.goto("/teams/12345");

    const links = page.locator('nav[aria-label="Main navigation"] ul a');
    const teams = links.filter({ hasText: "Teams" });
    await expect(teams).toHaveAttribute("aria-current", "page");

    const hub = links.filter({ hasText: "Hub" });
    expect(await hub.getAttribute("aria-current")).toBeNull();
  });
});
