import { test, expect } from "@playwright/test";

/**
 * Regression test for #149: the intercepted player-profile modal's shell
 * (components/player-profile/profile-modal-shell.tsx, role="dialog") must
 * mount exactly once per open. The bug was a second Suspense fallback shell
 * (app/@modal/(.)players/[id]/loading.tsx) rendering its own copy of the
 * shell, so the shell mounted, unmounted, then remounted once the RSC
 * resolved -- visibly sliding up twice on mobile's full-height sheet.
 *
 * Verified without touching product source: a MutationObserver injected
 * from the test side (before navigation) counts how many times a
 * [role="dialog"] node is *added* to the document while the modal opens.
 * A remounted shell tears down the old dialog node and inserts a fresh one,
 * so "added" fires twice for the bug; a stable shell with only its inner
 * content swapping (skeleton -> resolved profile) fires it once.
 */

async function findRosteredPlayerHref(page: import("@playwright/test").Page): Promise<string | null> {
  await page.goto("/teams");
  const rows = page.locator('a[href^="/teams/"]');
  await rows.first().waitFor({ timeout: 10_000 }).catch(() => {});
  const count = await rows.count();
  let slug: string | null = null;
  for (let i = 0; i < count; i++) {
    const href = await rows.nth(i).getAttribute("href");
    if (href && /^\/teams\/[^/]+$/.test(href)) {
      slug = href.replace("/teams/", "");
      break;
    }
  }
  if (!slug) return null;

  await page.goto(`/teams/${slug}/roster`);
  const playerLink = page.locator('a[href^="/players/"]:visible').first();
  await playerLink.waitFor({ timeout: 10_000 }).catch(() => {});
  if ((await playerLink.count()) === 0) return null;
  return `/teams/${slug}/roster`;
}

test.describe("Player profile modal: single mount", () => {
  test("mobile: the dialog shell node is only added to the DOM once per open", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const rosterUrl = await findRosteredPlayerHref(page);
    test.skip(!rosterUrl, "No rostered player found in this environment.");

    await page.goto(rosterUrl!);

    // Install the observer before the click that triggers the intercepted
    // navigation, so it sees every dialog node added from a cold start.
    await page.evaluate(() => {
      (window as unknown as { __dialogAddCount: number }).__dialogAddCount = 0;
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of Array.from(mutation.addedNodes)) {
            if (!(node instanceof HTMLElement)) continue;
            const dialogs = [
              ...(node.matches("[role='dialog']") ? [node] : []),
              ...Array.from(node.querySelectorAll("[role='dialog']")),
            ];
            (window as unknown as { __dialogAddCount: number }).__dialogAddCount +=
              dialogs.length;
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      (window as unknown as { __dialogObserver: MutationObserver }).__dialogObserver =
        observer;
    });

    const playerLink = page.locator('a[href^="/players/"]:visible').first();
    await playerLink.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Wait for the resolved profile content (the identity heading), proving
    // the Suspense fallback has swapped to real data.
    await expect(dialog.locator("h1#player-profile-title, h2#player-profile-title")).toBeVisible();
    // Settle any trailing mutations.
    await page.waitForTimeout(300);

    const dialogAddCount = await page.evaluate(
      () => (window as unknown as { __dialogAddCount: number }).__dialogAddCount
    );
    expect(dialogAddCount).toBe(1);
  });
});
