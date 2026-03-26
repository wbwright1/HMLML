import { test, expect } from "@playwright/test";
import {
  seedSyncLogEntry,
  cleanupSyncLogEntry,
  cleanupSyncLogByDataType,
} from "./helpers/seed-sync-log";

// ============================================================================
// Nav Items and Order
// ============================================================================

test.describe("Nav Items and Order", () => {
  // FE-T01: Desktop nav renders exactly 6 items in correct order
  test("FE-T01: desktop nav renders 6 items in correct order", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav).toBeVisible();

    const navUl = nav.locator("ul").first();
    const links = navUl.locator("a");

    const texts = await links.allInnerTexts();
    expect(texts).toEqual(["Hub", "Teams", "Records", "History", "Drafts", "Players"]);
    expect(texts).toHaveLength(6);

    // No Matchups link
    const matchupsLink = nav.getByText("Matchups");
    await expect(matchupsLink).toHaveCount(0);
  });

  // FE-T02: Nav items render on every route
  test("FE-T02: nav items render on every route", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    const routes = ["/teams", "/records", "/seasons", "/drafts", "/players"];
    for (const route of routes) {
      await page.goto(route);
      const nav = page.locator('nav[aria-label="Main navigation"]');
      await expect(nav).toBeVisible();

      const navUl = nav.locator("ul").first();
      const links = navUl.locator("a");
      const texts = await links.allInnerTexts();
      expect(texts).toEqual(["Hub", "Teams", "Records", "History", "Drafts", "Players"]);

      const matchupsLink = nav.getByText("Matchups");
      await expect(matchupsLink).toHaveCount(0);
    }
  });

  // FE-T03: Nav links href values are correct
  test("FE-T03: nav links have correct href values", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const nav = page.locator('nav[aria-label="Main navigation"]');
    const navUl = nav.locator("ul").first();
    const links = navUl.locator("a");

    const expectedHrefs = ["/", "/teams", "/records", "/seasons", "/drafts", "/players"];
    const count = await links.count();
    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute("href");
      expect(href).toBe(expectedHrefs[i]);
    }
  });
});

// ============================================================================
// Brand Text
// ============================================================================

test.describe("Brand Text", () => {
  // FE-T04: HMLML brand text is present and links to /
  test("FE-T04: HMLML brand text is present and links to /", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const header = page.locator("header");
    const brandLink = header.locator('a:has-text("HMLML")');
    await expect(brandLink).toBeVisible();
    expect(await brandLink.getAttribute("href")).toBe("/");
  });
});

// ============================================================================
// Matchups Not in Nav
// ============================================================================

test.describe("Matchups Not in Nav", () => {
  // FE-T05: Matchups is not a nav item
  test("FE-T05: no Matchups link in nav", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const nav = page.locator('nav[aria-label="Main navigation"]');
    const matchupsLink = nav.getByText("Matchups", { exact: true });
    await expect(matchupsLink).toHaveCount(0);
  });
});

// ============================================================================
// Active Link States
// ============================================================================

test.describe("Active Link States", () => {
  // FE-T06: Active link has aria-current="page"
  test("FE-T06: active link has aria-current=page on /teams", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/teams");

    const nav = page.locator('nav[aria-label="Main navigation"]');
    const navUl = nav.locator("ul").first();
    const teamsLink = navUl.locator('a:has-text("Teams")');
    await expect(teamsLink).toHaveAttribute("aria-current", "page");

    // No other link has aria-current="page"
    const allLinks = navUl.locator("a");
    const count = await allLinks.count();
    for (let i = 0; i < count; i++) {
      const link = allLinks.nth(i);
      const text = await link.innerText();
      if (text !== "Teams") {
        const ariaCurrent = await link.getAttribute("aria-current");
        expect(ariaCurrent).toBeNull();
      }
    }
  });

  // FE-T07: Hub active state uses exact match
  test("FE-T07: Hub is not active on /teams", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/teams");

    const nav = page.locator('nav[aria-label="Main navigation"]');
    const navUl = nav.locator("ul").first();
    const hubLink = navUl.locator('a:has-text("Hub")');
    const ariaCurrent = await hubLink.getAttribute("aria-current");
    expect(ariaCurrent).toBeNull();
  });
});

// ============================================================================
// Keyboard Navigation (Desktop)
// ============================================================================

test.describe("Keyboard Navigation", () => {
  // FE-T08: Desktop nav links are keyboard-focusable in order
  test("FE-T08: desktop nav links are keyboard-focusable", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const nav = page.locator('nav[aria-label="Main navigation"]');
    const navUl = nav.locator("ul").first();
    const firstLink = navUl.locator("a").first();

    // Focus the first link directly
    await firstLink.focus();
    await expect(firstLink).toBeFocused();

    const expectedLabels = ["Hub", "Teams", "Records", "History", "Drafts", "Players"];
    // Tab through all links
    for (let i = 1; i < expectedLabels.length; i++) {
      await page.keyboard.press("Tab");
      const activeText = await page.evaluate(() => document.activeElement?.textContent);
      expect(activeText).toBe(expectedLabels[i]);
    }
  });
});

// ============================================================================
// SeasonalPillBadge
// ============================================================================

test.describe("SeasonalPillBadge", () => {
  // FE-T10: Badge is absent when DB has no NFL state data
  test("FE-T10: badge is absent with empty DB", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const nav = page.locator('nav[aria-label="Main navigation"]');
    // No pill badge text present
    for (const text of ["Preseason", "Week", "Playoffs", "Offseason"]) {
      const badge = nav.getByText(text, { exact: false });
      await expect(badge).toHaveCount(0);
    }
  });
});

// ============================================================================
// Hamburger Menu — Basic
// ============================================================================

test.describe("Hamburger Menu", () => {
  // FE-T20: Mobile top bar is visible and does not scroll away
  test("FE-T20: mobile top bar is fixed and does not scroll away", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const header = page.locator("header");
    await expect(header).toBeVisible();

    // Scroll down
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(200);

    // Header should still be at top of viewport
    const box = await header.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeLessThanOrEqual(2); // at or near top
    expect(box!.height).toBe(56); // h-14 = 56px
  });

  // FE-T21: Desktop nav is hidden on mobile; hamburger is shown
  test("FE-T21: desktop nav hidden, hamburger visible on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    // Desktop nav list should be hidden
    const nav = page.locator('nav[aria-label="Main navigation"]');
    const desktopUl = nav.locator("ul.hidden");
    // The ul has class "hidden md:flex" which means hidden on mobile
    await expect(desktopUl).toBeHidden();

    // Hamburger button should be visible
    const hamburger = page.locator('button[aria-label="Open navigation"]');
    await expect(hamburger).toBeVisible();
  });

  // FE-T22: Hamburger button opens the mobile overlay
  test("FE-T22: hamburger button opens mobile overlay", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    // Overlay should not be visible initially
    const overlay = page.locator("#mobile-nav-menu");
    await expect(overlay).toHaveCount(0);

    // Click hamburger
    const hamburger = page.locator('button[aria-label="Open navigation"]');
    await hamburger.click();

    // Overlay should now be visible
    const openOverlay = page.locator("#mobile-nav-menu");
    await expect(openOverlay).toBeVisible();

    // All 6 links present
    const links = openOverlay.locator("a");
    const texts = await links.allInnerTexts();
    expect(texts).toEqual(["Hub", "Teams", "Records", "History", "Drafts", "Players"]);

    // Hamburger button state
    const closeButton = page.locator('button[aria-label="Close navigation"]');
    await expect(closeButton).toBeVisible();
    await expect(closeButton).toHaveAttribute("aria-expanded", "true");
  });

  // FE-T23: Hamburger button closes the overlay when clicked again
  test("FE-T23: hamburger closes overlay on second click", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const hamburger = page.locator('button[aria-label="Open navigation"]');
    await hamburger.click();

    // Overlay open
    const overlay = page.locator("#mobile-nav-menu");
    await expect(overlay).toBeVisible();

    // Click X button to close
    const closeButton = page.locator('button[aria-label="Close navigation"]');
    await closeButton.click();

    // Overlay gone
    await expect(page.locator("#mobile-nav-menu")).toHaveCount(0);

    // Hamburger state reset
    const openButton = page.locator('button[aria-label="Open navigation"]');
    await expect(openButton).toHaveAttribute("aria-expanded", "false");
  });

  // FE-T24: Clicking outside the overlay closes it
  test("FE-T24: clicking outside closes overlay", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const hamburger = page.locator('button[aria-label="Open navigation"]');
    await hamburger.click();
    await expect(page.locator("#mobile-nav-menu")).toBeVisible();

    // Click on main content area (below the overlay)
    await page.locator("main").click({ force: true });

    // Overlay should close
    await expect(page.locator("#mobile-nav-menu")).toHaveCount(0);
  });
});

// ============================================================================
// Hamburger Menu — Accessibility
// ============================================================================

test.describe("Hamburger Accessibility", () => {
  // FE-T25: Escape key closes overlay and returns focus
  test("FE-T25: Escape closes overlay, focus returns to hamburger", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const hamburger = page.locator('button[aria-label="Open navigation"]');
    await hamburger.click();

    // Verify focus is on first nav link
    const overlay = page.locator("#mobile-nav-menu");
    await expect(overlay).toBeVisible();
    const firstLink = overlay.locator("a").first();
    await expect(firstLink).toBeFocused();

    // Press Escape
    await page.keyboard.press("Escape");

    // Overlay should close
    await expect(page.locator("#mobile-nav-menu")).toHaveCount(0);

    // Focus should return to hamburger button
    const openButton = page.locator('button[aria-label="Open navigation"]');
    await expect(openButton).toBeFocused();
    await expect(openButton).toHaveAttribute("aria-expanded", "false");
  });

  // FE-T26: Focus trap: Tab cycles within open overlay
  test("FE-T26: focus trap cycles forward through overlay links", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const hamburger = page.locator('button[aria-label="Open navigation"]');
    await hamburger.click();

    const overlay = page.locator("#mobile-nav-menu");
    const links = overlay.locator("a");

    // Focus starts on first link (Hub)
    await expect(links.first()).toBeFocused();

    // Tab through 5 more links
    const expectedLabels = ["Teams", "Records", "History", "Drafts", "Players"];
    for (const label of expectedLabels) {
      await page.keyboard.press("Tab");
      const activeText = await page.evaluate(() => document.activeElement?.textContent);
      expect(activeText).toBe(label);
    }

    // Tab one more time from Players should wrap to Hub
    await page.keyboard.press("Tab");
    const wrappedText = await page.evaluate(() => document.activeElement?.textContent);
    expect(wrappedText).toBe("Hub");
  });

  // FE-T27: Focus trap: Shift+Tab wraps backward
  test("FE-T27: Shift+Tab wraps backward from first to last link", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const hamburger = page.locator('button[aria-label="Open navigation"]');
    await hamburger.click();

    const overlay = page.locator("#mobile-nav-menu");
    const firstLink = overlay.locator("a").first();
    await expect(firstLink).toBeFocused();

    // Shift+Tab from first link should wrap to last (Players)
    await page.keyboard.press("Shift+Tab");
    const activeText = await page.evaluate(() => document.activeElement?.textContent);
    expect(activeText).toBe("Players");
  });

  // FE-T28: Clicking a nav link navigates and closes overlay
  test("FE-T28: clicking nav link navigates and closes overlay", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const hamburger = page.locator('button[aria-label="Open navigation"]');
    await hamburger.click();

    const overlay = page.locator("#mobile-nav-menu");
    const teamsLink = overlay.locator('a:has-text("Teams")');
    await teamsLink.click();

    // URL should change
    await page.waitForURL("**/teams");

    // Overlay should be closed
    await expect(page.locator("#mobile-nav-menu")).toHaveCount(0);
  });

  // FE-T29: Hamburger button ARIA attributes in closed state
  test("FE-T29: hamburger ARIA attributes in closed state", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const hamburger = page.locator('button[aria-label="Open navigation"]');
    await expect(hamburger).toHaveAttribute("aria-expanded", "false");
    await expect(hamburger).toHaveAttribute("aria-controls", "mobile-nav-menu");
  });

  // FE-T29b: Hamburger button ARIA attributes in open state
  test("FE-T29b: hamburger ARIA attributes in open state", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const hamburger = page.locator('button[aria-label="Open navigation"]');
    await hamburger.click();

    const closeButton = page.locator('button[aria-label="Close navigation"]');
    await expect(closeButton).toHaveAttribute("aria-expanded", "true");

    const overlay = page.locator("#mobile-nav-menu");
    await expect(overlay).toBeVisible();
  });
});

// ============================================================================
// SyncTimestamp
// ============================================================================

test.describe("SyncTimestamp", () => {
  // The footer renders <SyncTimestamp /> with default dataType="league".
  // "league" uses the hourly threshold (2 hours = 7,200,000ms).
  const DATA_TYPE = "league";
  const SYNC_TYPE = "hourly";

  // FE-T30: SyncTimestamp renders in the footer on every page
  test("FE-T30: fresh timestamp renders in footer", async ({ page }) => {
    // Seed: successful sync 10 minutes ago
    const completedAt = new Date(Date.now() - 10 * 60 * 1000);
    const id = await seedSyncLogEntry({
      syncType: SYNC_TYPE,
      dataType: DATA_TYPE,
      status: "success",
      completedAt,
    });

    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("/");

      const footer = page.locator("footer");
      const timestampButton = footer.locator("button");
      await expect(timestampButton).toBeVisible();

      // Should show "Last updated" and a relative time
      const text = await timestampButton.innerText();
      expect(text).toContain("Last updated");
      expect(text).not.toContain("(outdated)");

      // Color should be muted, not warm rust
      const color = await timestampButton.evaluate((el) =>
        window.getComputedStyle(el).color
      );
      // Should NOT be the warm rust color rgb(196, 64, 47)
      expect(color).not.toBe("rgb(196, 64, 47)");
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
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("/");

      const footer = page.locator("footer");
      const timestampButton = footer.locator("button");
      await expect(timestampButton).toBeVisible();

      // Click to show absolute time
      await timestampButton.click();
      const expandedText = await timestampButton.innerText();
      // Should contain both relative and absolute time
      expect(expandedText).toContain("Last updated");
      // Absolute time should be visible (contains a formatted date)
      const spans = timestampButton.locator("span");
      const spanCount = await spans.count();
      expect(spanCount).toBeGreaterThanOrEqual(2);

      // Click again to hide absolute time
      await timestampButton.click();
      const collapsedSpans = timestampButton.locator("span");
      const collapsedCount = await collapsedSpans.count();
      expect(collapsedCount).toBeLessThan(spanCount);
    } finally {
      await cleanupSyncLogEntry(id);
    }
  });

  // FE-T32: SyncTimestamp fallback when no sync record exists
  test("FE-T32: fallback renders when DB has no sync record", async ({ page }) => {
    // Clean out any existing sync_log entries for this data type
    await cleanupSyncLogByDataType(DATA_TYPE);

    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("/");

      const footer = page.locator("footer");
      // Fallback is a <span>, not a <button>
      const fallbackText = footer.locator("text=Data may be outdated");
      await expect(fallbackText).toBeVisible();

      // Should NOT contain "(outdated)" suffix (the fallback text is distinct)
      const fullText = await fallbackText.innerText();
      expect(fullText).not.toContain("(outdated)");
    } finally {
      // No cleanup needed; we cleared data
    }
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
      await page.setViewportSize({ width: 1280, height: 800 });
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
  test("FE-T34: stale timestamp shows warm rust color and outdated text", async ({ page }) => {
    // Seed: successful sync 3 hours ago (beyond 2-hour hourly threshold)
    const completedAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const id = await seedSyncLogEntry({
      syncType: SYNC_TYPE,
      dataType: DATA_TYPE,
      status: "success",
      completedAt,
    });

    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("/");

      const footer = page.locator("footer");
      const timestampButton = footer.locator("button");
      await expect(timestampButton).toBeVisible();

      // Must contain "(outdated)" text
      const text = await timestampButton.innerText();
      expect(text).toContain("Last updated");
      expect(text).toContain("(outdated)");

      // Must have warm rust color (approximately rgb(196, 64, 47) = #C4402F)
      const color = await timestampButton.evaluate((el) =>
        window.getComputedStyle(el).color
      );
      expect(color).toBe("rgb(196, 64, 47)");

      // "(outdated)" text must be accessible (not hidden)
      const outdatedText = timestampButton.locator("text=(outdated)");
      await expect(outdatedText).toBeVisible();
    } finally {
      await cleanupSyncLogEntry(id);
    }
  });

  // FE-T35: Hourly data fresh at 1h59m — no stale indicators
  test("FE-T35: fresh timestamp at 119 minutes has no stale indicators", async ({ page }) => {
    // Seed: successful sync 119 minutes ago (just inside 2-hour threshold)
    const completedAt = new Date(Date.now() - 119 * 60 * 1000);
    const id = await seedSyncLogEntry({
      syncType: SYNC_TYPE,
      dataType: DATA_TYPE,
      status: "success",
      completedAt,
    });

    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("/");

      const footer = page.locator("footer");
      const timestampButton = footer.locator("button");
      await expect(timestampButton).toBeVisible();

      const text = await timestampButton.innerText();
      expect(text).toContain("Last updated");
      expect(text).not.toContain("(outdated)");

      // Color should be muted, not warm rust
      const color = await timestampButton.evaluate((el) =>
        window.getComputedStyle(el).color
      );
      expect(color).not.toBe("rgb(196, 64, 47)");
    } finally {
      await cleanupSyncLogEntry(id);
    }
  });

  // FE-T36: Daily data stale after >26 hours
  // Note: The footer uses dataType="league" (hourly threshold). This test
  // verifies the daily threshold behavior by seeding a "daily" data type row.
  // Since the footer does not render a daily SyncTimestamp, this test is
  // documented as a known limitation. The unit tests in sync-timestamp.test.ts
  // cover the daily threshold logic. Including this test for completeness;
  // it seeds a daily row and verifies through a test endpoint if available,
  // or via the unit test coverage.
  // Skipped: the footer only renders dataType="league" (hourly). Daily
  // threshold is verified in unit tests (UT-T01, UT-T03).

  // FE-T37: Daily data fresh at 25 hours — no stale indicators
  // Same limitation as FE-T36. Covered by unit tests.
});

// ============================================================================
// SectionHeader
// ============================================================================

test.describe("SectionHeader", () => {
  // FE-T40: Title only renders correctly
  test("FE-T40: section header with title only", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/test/section-header");

    const section = page.locator('[data-testid="title-only"]');
    const h3 = section.locator("h3");
    await expect(h3).toHaveText("Recent Transactions");
    await expect(h3).toBeVisible();

    // No "View All" link
    const link = section.locator("a");
    await expect(link).toHaveCount(0);

    // h3 should be bold (font-weight 700)
    const fontWeight = await h3.evaluate((el) =>
      window.getComputedStyle(el).fontWeight
    );
    expect(fontWeight).toBe("700");
  });

  // FE-T41: With viewAllHref renders link with default label
  test("FE-T41: section header with default View All link", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/test/section-header");

    const section = page.locator('[data-testid="with-default-link"]');
    const h3 = section.locator("h3");
    await expect(h3).toHaveText("Last Season's Best");

    const link = section.locator("a");
    await expect(link).toBeVisible();
    // The link text should contain "View All" and the arrow
    const linkText = await link.innerText();
    expect(linkText).toContain("View All");
    expect(await link.getAttribute("href")).toBe("/records");
  });

  // FE-T42: With custom viewAllLabel renders that label
  test("FE-T42: section header with custom link label", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/test/section-header");

    const section = page.locator('[data-testid="with-custom-link"]');
    const link = section.locator("a");
    const linkText = await link.innerText();
    expect(linkText).toContain("Full Draft");
    expect(await link.getAttribute("href")).toBe("/drafts/2024");
  });

  // FE-T43: "View All" link is keyboard focusable with visible ring
  test("FE-T43: View All link is keyboard focusable", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/test/section-header");

    const section = page.locator('[data-testid="with-default-link"]');
    const link = section.locator("a");
    await link.focus();
    await expect(link).toBeFocused();
  });

  // EC-T04: Title-only does not render empty link element
  test("EC-T04: title-only does not render empty link", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/test/section-header");

    const section = page.locator('[data-testid="standings-title-only"]');
    const links = section.locator("a");
    await expect(links).toHaveCount(0);
  });

  // EC-T05: Long title does not break layout on mobile
  test("EC-T05: long title does not overflow on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/test/section-header");

    const section = page.locator('[data-testid="long-title"]');
    const container = section.locator("div").first();
    const box = await container.boundingBox();
    expect(box).not.toBeNull();
    // Container should not exceed viewport width
    expect(box!.width).toBeLessThanOrEqual(375);
  });
});

// ============================================================================
// Root Layout Max-Width
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
    // Centered (equal margins)
    const leftMargin = box!.x;
    const rightMargin = 1600 - (box!.x + box!.width);
    expect(Math.abs(leftMargin - rightMargin)).toBeLessThan(10);
  });
});

// ============================================================================
// BottomTabBar Retired
// ============================================================================

test.describe("BottomTabBar Retired", () => {
  // FE-T60: BottomTabBar is not rendered
  test("FE-T60: no bottom tab bar on any route", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    for (const route of ["/", "/teams"]) {
      await page.goto(route);
      // No fixed bottom nav bar
      const fixedBottom = page.locator('nav[aria-label="Mobile navigation"]');
      await expect(fixedBottom).toHaveCount(0);

      // No element with fixed bottom-0 containing nav links
      const bottomNav = page.locator(".fixed.bottom-0");
      await expect(bottomNav).toHaveCount(0);
    }
  });

  // FE-T61: main element does not have pb-20
  test("FE-T61: main does not have pb-20 padding", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const main = page.locator("main#main-content");
    const paddingBottom = await main.evaluate((el) =>
      window.getComputedStyle(el).paddingBottom
    );
    expect(paddingBottom).toBe("0px");
  });
});

// ============================================================================
// Mobile Content Offset
// ============================================================================

test.describe("Mobile Content Offset", () => {
  // FE-T62: main has pt-14 on mobile
  test("FE-T62: main has pt-14 on mobile, pt-0 on desktop", async ({ page }) => {
    // Mobile
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const main = page.locator("main#main-content");
    let paddingTop = await main.evaluate((el) =>
      window.getComputedStyle(el).paddingTop
    );
    expect(paddingTop).toBe("56px"); // 14 * 4 = 56px

    // Desktop
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    paddingTop = await main.evaluate((el) =>
      window.getComputedStyle(el).paddingTop
    );
    expect(paddingTop).toBe("0px");
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

test.describe("Edge Cases", () => {
  // EC-T01: Hub not active on deep routes
  test("EC-T01: Hub not active on /teams/some-franchise", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // Navigate to a deep teams route (may 404 but nav still renders)
    await page.goto("/teams/12345");

    const nav = page.locator('nav[aria-label="Main navigation"]');
    const navUl = nav.locator("ul").first();

    // Teams should be active
    const teamsLink = navUl.locator('a:has-text("Teams")');
    await expect(teamsLink).toHaveAttribute("aria-current", "page");

    // Hub should NOT be active
    const hubLink = navUl.locator('a:has-text("Hub")');
    const ariaCurrent = await hubLink.getAttribute("aria-current");
    expect(ariaCurrent).toBeNull();
  });

  // EC-T06: Hamburger button has accessible name
  test("EC-T06: hamburger button has accessible aria-label", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const hamburger = page.locator('button[aria-controls="mobile-nav-menu"]');
    const label = await hamburger.getAttribute("aria-label");
    expect(label).toBeTruthy();
    expect(["Open navigation", "Close navigation"]).toContain(label);
  });
});
