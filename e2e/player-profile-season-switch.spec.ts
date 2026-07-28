import { test, expect } from "@playwright/test";

/**
 * Season switching on the player profile (issue #142). Both the canonical
 * full page and the intercepted modal now switch seasons IN PLACE (no full
 * document reload), via two different mechanisms, for reasons discovered
 * empirically while building this (see PR discussion):
 *
 * - Full page (`components/player-profile/season-switcher.tsx`,
 *   variant="page"): `history.replaceState` (a shallow URL update, NOT a
 *   Next navigation) followed by `router.refresh()` in a transition.
 *   `router.push`/`replace` was tried first and rejected: a client-side Next
 *   navigation to the canonical page's OWN pathname still triggers the
 *   `@modal` intercepted-route parallel slot and pops the modal open over
 *   the page (interception matches on the navigation target, regardless of
 *   soft-vs-hard origin). A raw history update sidesteps Next's router
 *   entirely (no navigation event, so the interceptor never sees it), and
 *   `router.refresh()` just re-runs the current route's Server Components
 *   against the new request URL — not a navigation either, so it can't be
 *   intercepted.
 *
 *   Two further things had to be worked around, both confirmed empirically
 *   with a scroll/console timeline probe (not asserted individually here,
 *   see the season-switcher.tsx doc comment for the evidence): (1)
 *   `router.refresh()` resets `window.scrollY` to 0 once its re-render
 *   commits, so the component captures scrollY on click and restores it
 *   once the new season prop actually lands; (2) `useTransition`'s
 *   `isPending` resolves as soon as router.refresh() is CALLED, well before
 *   the server round-trip completes, so it can't gate re-clicks — firing a
 *   second router.refresh() before the first lands lets the two responses
 *   race and resolve out of order. Fixed by serializing: a click while one
 *   is already in flight just updates a "queued year" ref instead of firing
 *   a second refresh; when the in-flight one lands, the queued year (if
 *   still different) fires next. Only one request is ever in flight, and
 *   the last click always eventually wins.
 *
 * - Modal (variant="modal"): `router.replace` (a real Next navigation) in a
 *   transition, unchanged from the previous iteration of this fix. A
 *   second, separate Next.js limitation was found and fixed here too: a
 *   parallel/intercepted route segment can serve a cached render instead of
 *   re-fetching on a searchParams-only navigation (a known, still-open bug:
 *   vercel/next.js#62451, #86362). Fixed with the documented workaround,
 *   `export const dynamic = "force-dynamic"` on
 *   app/@modal/(.)players/[id]/page.tsx.
 *
 * Runs against a real dev/build server + real Postgres (no mocks). Uses
 * Patrick Mahomes (4046), a known multi-season rostered veteran with full
 * value history so the season picker always renders.
 */

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };
const PLAYER_ID = "4046";
// Local dev-server round trips (uncompiled routes, cold Postgres pool) can
// take several seconds, especially back-to-back. Generous but bounded.
const SWITCH_TIMEOUT = 15_000;

async function findOwnerSlug(
  page: import("@playwright/test").Page,
  playerId: string
): Promise<string | null> {
  await page.goto(`/players/${playerId}`);
  const ownerLink = page.locator('a[href^="/teams/"]').first();
  await ownerLink.waitFor({ timeout: 10_000 }).catch(() => {});
  if ((await ownerLink.count()) === 0) return null;
  const href = await ownerLink.getAttribute("href");
  const match = href?.match(/^\/teams\/([^/]+)/);
  return match ? match[1] : null;
}

test.describe("Player profile season switch", () => {
  test("full page: season pill switches in place — URL and table update, no reload, no dialog, scroll preserved", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(`/players/${PLAYER_ID}`);

    const seasonNav = page.getByRole("navigation", { name: "Season" });
    await expect(seasonNav).toBeVisible();

    // Scroll down to the desktop weekly-lines table so there's a real
    // position to preserve.
    await page.locator("table").first().scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(scrollBefore).toBeGreaterThan(0);

    // A marker that only survives if the document is NOT reloaded.
    await page.evaluate(() => {
      (window as unknown as { __marker: string }).__marker = "still-here";
    });

    const tableBefore = await page.locator("table").first().textContent();

    const inactivePill = seasonNav.locator('a:not([aria-current="page"])').first();
    const targetYear = (await inactivePill.textContent())?.trim();
    await inactivePill.click();

    // URL updates in place (retries internally — no fixed sleep needed).
    await expect(page).toHaveURL(new RegExp(`season=${targetYear}`), {
      timeout: SWITCH_TIMEOUT,
    });

    // Active pill and table content both reflect the new season.
    const activePill = seasonNav.locator('a[aria-current="page"]');
    await expect(activePill).toHaveText(targetYear!, { timeout: SWITCH_TIMEOUT });
    await expect
      .poll(() => page.locator("table").first().textContent(), { timeout: SWITCH_TIMEOUT })
      .not.toBe(tableBefore);

    // Never a navigation: no dialog ever appears, and the window marker
    // (which only a hard reload would discard) survives.
    expect(await page.locator('[role="dialog"]').count()).toBe(0);
    const markerAfter = await page.evaluate(
      () => (window as unknown as { __marker?: string }).__marker
    );
    expect(markerAfter).toBe("still-here");

    // Scroll position preserved (small tolerance for the browser's own
    // click-focus scroll-into-view adjustment, which happens before our
    // handler runs and is expected — the point is nothing ADDITIONALLY
    // resets it to 0 once the new content lands).
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(scrollAfter).toBeGreaterThan(0);
    expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(800);
  });

  test("full page: rapid successive season switches settle on the last one clicked", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(`/players/${PLAYER_ID}`);

    const seasonNav = page.getByRole("navigation", { name: "Season" });
    await expect(seasonNav).toBeVisible();

    const pills = seasonNav.locator("a");
    const count = await pills.count();
    test.skip(count < 3, "Need at least 3 seasons to meaningfully test rapid switching.");

    const years: string[] = [];
    for (let i = 0; i < count; i++) {
      years.push((await pills.nth(i).textContent())?.trim() ?? "");
    }

    // Click every pill back to back with no waiting — including whichever
    // is already active (a no-op) — the last DIFFERENT one should win.
    for (let i = 0; i < count; i++) {
      await pills.nth(i).click();
    }

    const lastYear = years[years.length - 1];
    await expect(page).toHaveURL(new RegExp(`season=${lastYear}`), {
      timeout: SWITCH_TIMEOUT,
    });
    const activePill = seasonNav.locator('a[aria-current="page"]');
    await expect(activePill).toHaveText(lastYear, { timeout: SWITCH_TIMEOUT });
  });

  test("modal: season pill soft-navigates in place, URL and table both update, no full reload, no duplicate dialog, no skeleton flash", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    const slug = await findOwnerSlug(page, PLAYER_ID);
    test.skip(!slug, "Known multi-season player is currently unowned.");

    await page.goto(`/teams/${slug}/roster`);
    await page.locator(`a[href="/players/${PLAYER_ID}"]:visible`).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
    await page.waitForTimeout(250);

    // Marker survives only if this stays a client-side transition (no hard
    // reload of the document).
    await page.evaluate(() => {
      (window as unknown as { __marker: string }).__marker = "still-here";
    });

    const seasonNav = dialog.getByRole("navigation", { name: "Season" });
    await expect(seasonNav).toBeVisible();

    const tableBefore = await dialog.locator("table, [role=list]").first().textContent();

    // Pick any pill that ISN'T already active, regardless of season ordering.
    const inactivePill = seasonNav.locator('a:not([aria-current="page"])').first();
    const targetYear = (await inactivePill.textContent())?.trim();
    await inactivePill.click();

    // Poll for a few seconds: at no point should a second dialog exist, and
    // no skeleton/loading fallback should render (its markup uses
    // .animate-pulse). Local Postgres round-trips can take ~1-2s.
    for (let i = 0; i < 20; i++) {
      expect(await page.locator('[role="dialog"]').count()).toBe(1);
      expect(await page.locator('[role="dialog"] .animate-pulse').count()).toBe(0);
      await page.waitForTimeout(150);
    }

    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`season=${targetYear}`), {
      timeout: SWITCH_TIMEOUT,
    });

    const activePill = seasonNav.locator('a[aria-current="page"]');
    await expect(activePill).toHaveText(targetYear!);

    const tableAfter = await dialog.locator("table, [role=list]").first().textContent();
    expect(tableAfter).not.toBe(tableBefore);

    const markerAfter = await page.evaluate(
      () => (window as unknown as { __marker?: string }).__marker
    );
    expect(markerAfter).toBe("still-here");

    // Escape still closes the modal after an in-place season switch.
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });
});
