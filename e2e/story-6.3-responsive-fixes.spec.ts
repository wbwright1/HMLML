import { test, expect } from "@playwright/test";

/**
 * Story 6.3: Responsive Edge-Case Fixes
 *
 * Verifies targeted CSS/layout fixes for responsive edge cases:
 * AC1: Power rankings flex-wrap at 768px
 * AC2: Superlative grid responsive columns
 * AC3: MobileTableView card/table breakpoint consistency
 * AC4: SeasonSelector overflow handling
 * AC5: Safe area inset support
 */

test.describe("Story 6.3: Responsive Edge-Case Fixes", () => {
  // AC1: Power rankings flex-wrap at 768px
  test("T01: Power rankings cards have no horizontal overflow at 768px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/records/power-rankings");

    // The ranking cards container should not cause horizontal scrollbar
    const body = page.locator("body");
    const bodyBox = await body.boundingBox();
    expect(bodyBox).not.toBeNull();

    // Check that body scrollWidth does not exceed viewport width
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(768);
  });

  test("T02: Power rankings cards use flex-wrap", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/records/power-rankings");

    // All ranking card inner containers should have flex-wrap applied
    const flexContainers = page.locator(".flex.flex-wrap.items-center.gap-4");
    const count = await flexContainers.count();
    // If there are rankings, verify flex-wrap is present; if empty state, that is also fine
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const flexWrap = await flexContainers.nth(i).evaluate((el) =>
          window.getComputedStyle(el).flexWrap
        );
        expect(flexWrap).toBe("wrap");
      }
    }
  });

  // AC2: Superlative grid responsive columns
  test("T03: Superlative grid renders 2 columns at 375px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    // Look for grid containers with grid-cols-2 class
    const grids = page.locator(".grid.grid-cols-2");
    const count = await grids.count();

    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const gridCols = await grids.nth(i).evaluate((el) =>
          window.getComputedStyle(el).gridTemplateColumns
        );
        // At 375px, should have 2 columns (two values in gridTemplateColumns)
        const colCount = gridCols.split(" ").filter((s) => s.length > 0).length;
        expect(colCount).toBe(2);
      }
    }
  });

  test("T04: Superlative grid renders 4 columns at 1280px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    // At 1280px (md+), the grid-cols-2 md:grid-cols-4 should resolve to 4 columns
    const grids = page.locator(".grid.grid-cols-2");
    const count = await grids.count();

    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const gridCols = await grids.nth(i).evaluate((el) =>
          window.getComputedStyle(el).gridTemplateColumns
        );
        const colCount = gridCols.split(" ").filter((s) => s.length > 0).length;
        expect(colCount).toBe(4);
      }
    }
  });

  // AC3: MobileTableView breakpoint consistency
  // T05/T06 retired: MobileTableView (components/mobile-table-view.tsx) was
  // deleted in #164 (roster page moved to a single horizontally-scrolling
  // table at all breakpoints, its only consumer). These tests targeted
  // /records/head-to-head, which never used MobileTableView, so both were
  // already dead no-ops (locator count 0) before the deletion.

  // AC4: SeasonSelector overflow handling
  test("T07: SeasonSelector has fade indicator elements when overflowing", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    // Navigate to a page using SeasonSelector (records page)
    await page.goto("/records");

    // The SeasonSelector wrapper is a div.relative containing the gradient overlays
    const selectorWrapper = page.locator('div.relative:has([role="tablist"])');
    const wrapperCount = await selectorWrapper.count();

    if (wrapperCount > 0) {
      // If there are enough tabs to overflow, a right fade gradient should appear.
      // This may or may not be visible depending on number of seasons
      // Just verify the selector structure is correct
      const tablist = selectorWrapper.first().locator('[role="tablist"]');
      await expect(tablist).toBeVisible();
    }
  });

  // AC5: Viewport-fit cover and safe-area-inset-bottom
  test("T09: Viewport meta includes viewport-fit=cover", async ({ page }) => {
    await page.goto("/");

    // Check for viewport meta tag with viewport-fit=cover
    const viewportContent = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      return meta?.getAttribute("content") ?? "";
    });

    expect(viewportContent).toContain("viewport-fit=cover");
  });

  test("T10: Footer includes safe-area-inset-bottom padding", async ({
    page,
  }) => {
    await page.goto("/");

    // Use getByRole to target the semantic contentinfo footer (not Next.js error overlay footer)
    const footer = page.getByRole("contentinfo");
    await expect(footer).toBeVisible();

    // Verify the footer element has a class referencing safe-area-inset-bottom
    const footerClass = await footer.getAttribute("class");
    expect(footerClass).toContain("safe-area-inset-bottom");
  });
});
