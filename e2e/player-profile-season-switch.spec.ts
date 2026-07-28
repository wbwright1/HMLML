import { test, expect } from "@playwright/test";

/**
 * Season switching on the player profile (issue #142).
 *
 * Step 0 of the approved plan called for empirically checking whether a
 * client-side `router.push` to the SAME pathname from the canonical
 * /players/[id] page would trigger Next's `@modal` intercepted-route slot.
 * It does — the intercept fires on the navigation target regardless of
 * whether the page currently rendering that pathname got there via a soft
 * or hard nav. So per the plan's documented fallback: the full-page season
 * pills keep a real hard `<a>` (full document navigation, unchanged), and
 * only the modal variant gets the soft `router.push` + pending-dim
 * treatment (components/player-profile/season-switcher.tsx).
 *
 * A second, deeper finding surfaced while building this: even with that
 * fallback in place, `router.push` for a searchParams-only change to the
 * modal's OWN pathname was silently a no-op — neither the URL nor the
 * rendered content updated. This reproduces a known, still-open Next.js bug
 * (vercel/next.js#62451, #86362): a parallel/intercepted route segment can
 * serve a cached render instead of re-fetching when only searchParams
 * change. The documented workaround is to force the intercepted segment to
 * always render dynamically, which is now applied at
 * app/@modal/(.)players/[id]/page.tsx via `export const dynamic =
 * "force-dynamic"`. With that in place, router.push + useTransition works
 * as designed: URL and content both update in place, no full reload, no
 * duplicate dialog, no loading.tsx skeleton flash.
 *
 * Runs against a real dev/build server + real Postgres (no mocks). Uses
 * Patrick Mahomes (4046), a known multi-season rostered veteran with full
 * value history so the season picker always renders.
 */

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };
const PLAYER_ID = "4046";

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
  test("full page: season pill is a real hard navigation, never pops the modal", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(`/players/${PLAYER_ID}`);

    const seasonNav = page.getByRole("navigation", { name: "Season" });
    await expect(seasonNav).toBeVisible();

    // A marker that only survives if the document is NOT reloaded.
    await page.evaluate(() => {
      (window as unknown as { __marker: string }).__marker = "still-here";
    });

    const inactivePill = seasonNav.locator('a:not([aria-current="page"])').first();
    const targetYear = (await inactivePill.textContent())?.trim();
    await inactivePill.click();

    await expect(page).toHaveURL(new RegExp(`season=${targetYear}`));
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // The hard nav discarded the window global — proves a real document
    // navigation happened, not a client-side transition.
    const markerAfter = await page.evaluate(
      () => (window as unknown as { __marker?: string }).__marker
    );
    expect(markerAfter).toBeUndefined();

    // Active pill reflects the new season.
    const activePill = seasonNav.locator('a[aria-current="page"]');
    await expect(activePill).toHaveText(targetYear!);
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
    await expect(page).toHaveURL(new RegExp(`season=${targetYear}`), { timeout: 10_000 });

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
