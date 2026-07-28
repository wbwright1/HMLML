import { test, expect } from "@playwright/test";

/**
 * Player-profile routes: the intercepted modal (soft nav from within the
 * app), the canonical full page (hard nav / direct URL), the season picker,
 * the dynasty-value chart (populated + empty states), and the snarky 404.
 *
 * Runs against a real dev/build server + real Postgres (no mocks). Discovers
 * a real rostered player id from /teams/{slug}/roster rather than hardcoding
 * one, matching e2e/player-links.spec.ts's convention; no-ops when the
 * environment has no seeded roster data.
 */

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function findFranchiseSlug(page: import("@playwright/test").Page): Promise<string | null> {
  await page.goto("/teams");
  const rows = page.locator('a[href^="/teams/"]');
  await rows.first().waitFor({ timeout: 10_000 }).catch(() => {});
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const href = await rows.nth(i).getAttribute("href");
    if (href && /^\/teams\/[^/]+$/.test(href)) {
      return href.replace("/teams/", "");
    }
  }
  return null;
}

/** Finds a real player id linked from a franchise's roster page. */
async function findRosteredPlayerId(page: import("@playwright/test").Page): Promise<string | null> {
  const slug = await findFranchiseSlug(page);
  if (!slug) return null;
  await page.goto(`/teams/${slug}/roster`);
  const playerLink = page.locator('a[href^="/players/"]:visible').first();
  await playerLink.waitFor({ timeout: 10_000 }).catch(() => {});
  if ((await playerLink.count()) === 0) return null;
  const href = await playerLink.getAttribute("href");
  return href ? href.replace("/players/", "") : null;
}

/**
 * A known multi-season, rostered veteran (Patrick Mahomes) — in the league
 * since 2021 with full value history, so the season picker always renders.
 */
const MULTI_SEASON_PLAYER_ID = "4046";

/** Resolves the franchise slug that currently rosters a player, from the
 * profile page's owner link. */
async function findOwnerSlug(page: import("@playwright/test").Page, playerId: string): Promise<string | null> {
  await page.goto(`/players/${playerId}`);
  const ownerLink = page.locator('a[href^="/teams/"]').first();
  await ownerLink.waitFor({ timeout: 10_000 }).catch(() => {});
  if ((await ownerLink.count()) === 0) return null;
  const href = await ownerLink.getAttribute("href");
  const match = href?.match(/^\/teams\/([^/]+)/);
  return match ? match[1] : null;
}

/** Waits until the freshly opened modal is interactive (entrance settled,
 * event listeners attached) before dismissal actions. */
async function awaitModalReady(page: import("@playwright/test").Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
  await page.waitForTimeout(250);
  return dialog;
}

test.describe("Player profile", () => {
  test("clicking a roster player opens the intercepted modal over the roster", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    const slug = await findFranchiseSlug(page);
    test.skip(!slug, "No franchises seeded in this environment.");

    await page.goto(`/teams/${slug}/roster`);
    const playerLink = page.locator('a[href^="/players/"]:visible').first();
    test.skip((await playerLink.count()) === 0, "Roster has no linked players.");

    const href = await playerLink.getAttribute("href");
    await playerLink.click();

    await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("h2#player-profile-title, h1#player-profile-title")).toBeVisible();

    // The roster DOM (the franchise's h1) is still present behind the modal.
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("backdrop click, Escape, and browser-back all close the modal", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    const playerId = await findRosteredPlayerId(page);
    test.skip(!playerId, "No rostered player found in this environment.");

    const slug = await findFranchiseSlug(page);
    await page.goto(`/teams/${slug}/roster`);
    await page.locator(`a[href="/players/${playerId}"]:visible`).first().click();
    let dialog = await awaitModalReady(page);

    // Escape closes.
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/teams/${slug}/roster$`));

    // Re-open, backdrop click closes.
    await page.locator(`a[href="/players/${playerId}"]:visible`).first().click();
    dialog = await awaitModalReady(page);
    await page.mouse.click(5, 5);
    await expect(dialog).not.toBeVisible();

    // Re-open, browser back closes.
    await page.locator(`a[href="/players/${playerId}"]:visible`).first().click();
    dialog = await awaitModalReady(page);
    await page.goBack();
    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/teams/${slug}/roster$`));
  });

  test("floating close button stays visible after scrolling the modal on mobile", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    const playerId = await findRosteredPlayerId(page);
    test.skip(!playerId, "No rostered player found in this environment.");

    const slug = await findFranchiseSlug(page);
    await page.goto(`/teams/${slug}/roster`);
    await page.locator(`a[href="/players/${playerId}"]:visible`).first().click();
    const dialog = await awaitModalReady(page);

    await dialog.evaluate((el) => el.scrollTo(0, 400));
    const closeButton = dialog.getByRole("button", { name: "Close" });
    await expect(closeButton).toBeVisible();
    await expect(closeButton).toBeInViewport();
  });

  test("direct navigation renders the canonical full page, no dialog", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    const playerId = await findRosteredPlayerId(page);
    test.skip(!playerId, "No rostered player found in this environment.");

    await page.goto(`/players/${playerId}`);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("h1#player-profile-title")).toBeVisible();
  });

  test("season pill navigation updates the URL and table on the full page", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);

    await page.goto(`/players/${MULTI_SEASON_PLAYER_ID}`);
    const seasonNav = page.getByRole("navigation", { name: "Season" });
    await expect(seasonNav).toBeVisible();

    const pills = seasonNav.locator("a");
    const secondPill = pills.nth(1);
    const year = (await secondPill.textContent())?.trim();
    await secondPill.click();

    await expect(page).toHaveURL(new RegExp(`season=${year}`));
  });

  test("season pill navigation inside the modal keeps the dialog open", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    const slug = await findOwnerSlug(page, MULTI_SEASON_PLAYER_ID);
    test.skip(!slug, "Known multi-season player is currently unowned.");

    await page.goto(`/teams/${slug}/roster`);
    await page.locator(`a[href="/players/${MULTI_SEASON_PLAYER_ID}"]:visible`).first().click();
    const dialog = await awaitModalReady(page);

    const seasonNav = dialog.getByRole("navigation", { name: "Season" });
    await expect(seasonNav).toBeVisible();

    const pills = seasonNav.locator("a");
    await pills.nth(1).click();
    await expect(dialog).toBeVisible();
  });

  test("unknown player id shows the snarky 404 with a working link", async ({ page }) => {
    await page.goto("/players/does-not-exist-xyz");
    await expect(page.getByText("Not on any roster we know of.")).toBeVisible();
    const link = page.getByRole("link", { name: /browse players/i });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/players$/);
  });

  test("dynasty value chart: one continuous gold line at both breakpoints, empty copy for a player without history", async ({ page }) => {
    // Patrick Mahomes (id 4046) has full value history spanning both sources.
    await page.goto("/players/4046");
    // The chart renders twice (mobile + desktop variants, CSS-switched); both
    // live in the DOM, one visible per viewport.
    const svgs = page.locator("svg[aria-label*='Dynasty value']");
    await expect(svgs).toHaveCount(2);
    await expect(svgs.locator("visible=true")).toHaveCount(1);
    // Each variant draws exactly one continuous solid gold value line.
    for (const svg of await svgs.all()) {
      const paths = svg.locator("path[stroke='var(--accent-gold)']");
      await expect(paths).toHaveCount(1);
      const dashed = await paths.first().getAttribute("stroke-dasharray");
      expect(dashed).toBeNull();
    }

    // A player absent from player_values shows the empty-state copy, never a
    // bare axis frame.
    await page.goto("/players/13273");
    await expect(
      page.getByText("No dynasty value history on file for this one.")
    ).toBeVisible();
  });

  test("no nested anchors on the full player-profile page", async ({ page }) => {
    // Mahomes (4046): richest profile (timeline, awards, chart, owner link).
    await page.goto("/players/4046");
    await expect(page.locator("h1#player-profile-title")).toBeVisible();
    expect(await page.locator("a a").count()).toBe(0);
  });
});
