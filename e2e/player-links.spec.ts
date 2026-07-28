import { test, expect } from "@playwright/test";

/**
 * Sitewide player-link layer: every surface that shows a player name/headshot
 * should link to /players/[id] (the detail route itself is built separately
 * and is NOT asserted here). Also asserts no nested anchors were introduced
 * on the pages this feature touched.
 *
 * Runs against a real dev server + real Postgres (no mocks). Discovers real
 * data (a completed draft year, a franchise roster slug) rather than
 * hardcoding IDs; no-ops when the environment has no seeded data, matching
 * the rest of this suite's convention.
 */

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };

/** Find a completed (non-"Upcoming") draft year link on the /drafts index. */
async function findCompletedDraftHref(page: import("@playwright/test").Page): Promise<string | null> {
  await page.goto("/drafts");

  const rows = page.locator('a[href^="/drafts/"]');
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const text = await row.textContent();
    if (text && !text.includes("Upcoming")) {
      return row.getAttribute("href");
    }
  }
  return null;
}

/** Find a franchise slug via the /teams index. */
async function findFranchiseSlug(page: import("@playwright/test").Page): Promise<string | null> {
  await page.goto("/teams");
  const rows = page.locator('a[href^="/teams/"]');
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const href = await rows.nth(i).getAttribute("href");
    if (href && /^\/teams\/[^/]+$/.test(href)) {
      return href.replace("/teams/", "");
    }
  }
  return null;
}

test.describe("Sitewide player links", () => {
  test("players table rows link to /players/{id}", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/players");

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    if (rowCount === 0) return; // No seeded players in this environment.

    const playerLink = rows.first().locator('a[href^="/players/"]').first();
    await expect(playerLink).toBeVisible();
    const href = await playerLink.getAttribute("href");
    expect(href).toMatch(/^\/players\/[^/]+$/);

    // No nested anchors anywhere on this page.
    expect(await page.locator("a a").count()).toBe(0);
  });

  test("trending rail links to /players/{id} when trending data is present", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/players");

    const rail = page.getByText("Trending", { exact: false }).first();
    if ((await rail.count()) === 0) return; // No trending data synced.

    const trendingLinks = page.locator('a[href^="/players/"]');
    const count = await trendingLinks.count();
    if (count === 0) return;

    // At least one player link exists on the page (covers both the table
    // and the rail); this is a smoke check that the rail's links, if
    // rendered, use the /players/{id} shape rather than the old ?q= form.
    const anyOldStyle = await page.locator('a[href^="/players?q="]').count();
    expect(anyOldStyle).toBe(0);
  });

  test("a draft board's completed picks link while empty slots are not anchors", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    const href = await findCompletedDraftHref(page);
    if (!href) return; // No completed draft seeded in this environment.

    await page.goto(href);
    await expect(page.getByRole("heading", { name: "Draft Board." })).toBeVisible();

    const playerLinks = page.locator('a[href^="/players/"]');
    const linkCount = await playerLinks.count();
    // A completed draft board should have at least one pick with a resolved
    // player, hence at least one player link.
    expect(linkCount).toBeGreaterThan(0);

    // Empty board slots (aria-hidden placeholders) must never be anchors.
    const emptySlotAnchors = page.locator('a[aria-hidden="true"]');
    expect(await emptySlotAnchors.count()).toBe(0);

    // No nested anchors on this page (board cells sit inside no other link).
    expect(await page.locator("a a").count()).toBe(0);
  });

  test("roster page player names link to /players/{id}", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    const slug = await findFranchiseSlug(page);
    if (!slug) return; // No franchises seeded in this environment.

    await page.goto(`/teams/${slug}/roster`);

    const playerLinks = page.locator('a[href^="/players/"]');
    const count = await playerLinks.count();
    if (count === 0) return; // Roster may be all-DEF or empty in a sparse env.

    const href = await playerLinks.first().getAttribute("href");
    expect(href).toMatch(/^\/players\/[^/]+$/);

    expect(await page.locator("a a").count()).toBe(0);
  });

  test("no nested anchors on the League Lore module (records page)", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/records/hall-of-fame");

    const loreGrid = page.getByTestId("player-wing-cards");
    if ((await loreGrid.count()) === 0) return; // No League Lore data synced.

    expect(await page.locator("a a").count()).toBe(0);
  });
});
