import { test, expect } from "@playwright/test";
import type { Locator } from "@playwright/test";

// ============================================================================
// Story 3.1: Hub Hero (Command Center redesign)
//
// The hub hero is the first <section> inside <main>: an upright serif display
// title (e.g. "Week 10." / "The Offseason.") with no kicker stacked above it
// (UI/UX pass, 2026-11-24: the live pill already names the week/state). Which hub state renders depends on the
// NFL calendar + seeded data; when no season data is present the hub falls back
// to an empty state with no hero section, in which case these tests skip.
// ============================================================================

test.describe("Hub Hero", () => {
  /** The hero is the first section in <main>. Returns null if absent. */
  function hero(page: import("@playwright/test").Page): Locator {
    return page.locator("main section").first();
  }

  // T01: no kicker line is stacked above the hero headline
  test("T01: hero has no kicker above its headline", async ({ page }) => {
    await page.goto("/");
    const h = hero(page);
    if ((await h.count()) === 0) {
      test.skip();
      return;
    }
    await expect(h).toBeVisible();

    await expect(h.locator("h1")).toBeVisible();
    await expect(h.locator(".text-kicker")).toHaveCount(0);
    expect(await h.innerText()).not.toMatch(/Harambe Memorial League ·/i);
  });

  // T02: hero has a display title
  test("T02: hero has a non-empty h1 title", async ({ page }) => {
    await page.goto("/");
    const h = hero(page);
    if ((await h.count()) === 0) {
      test.skip();
      return;
    }
    const h1 = h.locator("h1");
    await expect(h1).toBeVisible();
    const text = await h1.innerText();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  // T05 (replaces old green-tint tint check): the hero title uses the serif
  // display family (Instrument Serif via --font-serif), upright: italic stays
  // only on the HMLML wordmark.
  test("T05: hero title renders in the serif display family, upright", async ({
    page,
  }) => {
    await page.goto("/");
    const h = hero(page);
    if ((await h.count()) === 0) {
      test.skip();
      return;
    }

    const serifVar = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--font-serif")
        .trim()
    );
    expect(serifVar.length).toBeGreaterThan(0);

    const h1 = h.locator("h1");
    const collapse = (s: string) => s.replace(/\s+/g, "");
    const fontFamily = await h1.evaluate(
      (el) => getComputedStyle(el).fontFamily
    );
    expect(collapse(fontFamily)).toBe(collapse(serifVar));

    const fontStyle = await h1.evaluate(
      (el) => getComputedStyle(el).fontStyle
    );
    expect(fontStyle).toBe("normal");
  });

  // T06 (replaces old weight-900 check): the title is large display type.
  test("T06: hero title uses large display sizing", async ({ page }) => {
    await page.goto("/");
    const h = hero(page);
    if ((await h.count()) === 0) {
      test.skip();
      return;
    }
    const h1 = h.locator("h1");
    const fontSize = await h1.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize)
    );
    // .text-display clamps to 40-56px; allow a floor of 32px for narrow viewports.
    expect(fontSize).toBeGreaterThanOrEqual(32);
  });

  // T07: no em-dashes in hero text content
  test("T07: no em-dashes in hero text content", async ({ page }) => {
    await page.goto("/");
    const h = hero(page);
    if ((await h.count()) === 0) {
      test.skip();
      return;
    }
    const textContent = await h.innerText();
    expect(textContent).not.toContain("—");
    expect(textContent).not.toContain("–");
  });

  // T08: hero is visible and fits the viewport at 375px mobile
  test("T08: hero fits within 375px mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const h = hero(page);
    if ((await h.count()) === 0) {
      test.skip();
      return;
    }
    await expect(h).toBeVisible();
    await expect(h.locator("h1")).toBeVisible();

    const box = await h.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(375);
  });

  // T09: hero contains no images (the redesign hero is pure type, no imagery)
  test("T09: hero contains no images", async ({ page }) => {
    await page.goto("/");
    const h = hero(page);
    if ((await h.count()) === 0) {
      test.skip();
      return;
    }
    await expect(h.locator("img")).toHaveCount(0);
  });
});
