import { test, expect } from "@playwright/test";
import type { Page, Locator } from "@playwright/test";

// ============================================================================
// Between-Weeks Hub (state 1d)
//
// The Tue/Wed lull: regular season, no live game, the slate set but not yet
// kicked off. The hub only renders this layout when the NFL calendar + synced
// data put it in the between-weeks sub-state, so every test here is guarded by
// a runtime check: if the between-weeks hero isn't present (any other calendar
// state, or no seeded data), the test skips rather than failing. This is a
// runtime-conditional skip, never a blanket test.skip().
//
// KNOWN LIMITATION: these tests only exercise real assertions when the live NFL
// calendar is actually in a regular-season lull. There is no seam to stub the
// NFL-state source (getNflState reads Sleeper directly), so out of that window
// every test runtime-skips. The future fix is a stubbable NFL-state source
// (dependency-injected or env-overridable) so the between-weeks layout can be
// forced in CI; until then this spec cannot run green on demand.
//
// The distinctive marker is the hero kicker "... THE SLATE IS SET".
// ============================================================================

const SLATE_MARKER = /THE SLATE IS SET/i;

async function isBetweenWeeks(page: Page): Promise<boolean> {
  const main = page.locator("main");
  const text = await main.innerText().catch(() => "");
  return SLATE_MARKER.test(text);
}

/** The between-weeks hero is the first section in <main>. */
function hero(page: Page): Locator {
  return page.locator("main section").first();
}

test.describe("Between-Weeks Hub (1d)", () => {
  test("T01: hero renders the slate kicker and a serif headline", async ({
    page,
  }) => {
    await page.goto("/");
    if (!(await isBetweenWeeks(page))) {
      test.skip();
      return;
    }

    const h = hero(page);
    await expect(h.locator("p.text-kicker").first()).toContainText(
      /Harambe Memorial League/i
    );
    const h1 = h.locator("h1");
    await expect(h1).toBeVisible();
    expect((await h1.innerText()).trim().length).toBeGreaterThan(0);
    // Serif italic display family.
    const fontStyle = await h1.evaluate((el) => getComputedStyle(el).fontStyle);
    expect(fontStyle).toBe("italic");
  });

  test("T02: Game of the Week feature card is present with both teams", async ({
    page,
  }) => {
    await page.goto("/");
    if (!(await isBetweenWeeks(page))) {
      test.skip();
      return;
    }

    const gotwLabel = page.getByText("Game of the Week", { exact: true });
    await expect(gotwLabel).toBeVisible();
    // The card carries a serif "vs" between the two teams.
    await expect(page.getByText("vs", { exact: true }).first()).toBeVisible();
  });

  test("T03: the rest of the slate section renders preview cards", async ({
    page,
  }) => {
    await page.goto("/");
    if (!(await isBetweenWeeks(page))) {
      test.skip();
      return;
    }
    await expect(
      page.getByText("The Rest of the Slate", { exact: true })
    ).toBeVisible();
  });

  test("T04: no em-dashes anywhere in the hub copy", async ({ page }) => {
    await page.goto("/");
    if (!(await isBetweenWeeks(page))) {
      test.skip();
      return;
    }
    const text = await page.locator("main").innerText();
    expect(text).not.toContain("—"); // em dash
    expect(text).not.toContain("–"); // en dash
  });

  test("T05: mobile keeps the top of the funnel and hides the rail", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    if (!(await isBetweenWeeks(page))) {
      test.skip();
      return;
    }

    // Hero + Game of the Week visible on mobile.
    await expect(hero(page).locator("h1")).toBeVisible();
    await expect(page.getByText("Game of the Week", { exact: true })).toBeVisible();

    // Right-rail modules (Trending, Left On The Bench) are desktop-only.
    await expect(page.getByText("Left On The Bench", { exact: true })).toBeHidden();
    await expect(page.getByText("Trending", { exact: true })).toBeHidden();

    // Page does not scroll horizontally.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(overflow).toBe(true);
  });
});
