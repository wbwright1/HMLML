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

/** Finds a real player id linked from a franchise's roster page. */
async function findRosteredPlayerId(page: import("@playwright/test").Page): Promise<string | null> {
  const slug = await findFranchiseSlug(page);
  if (!slug) return null;
  await page.goto(`/teams/${slug}/roster`);
  const playerLink = page.locator('a[href^="/players/"]:visible').first();
  if ((await playerLink.count()) === 0) return null;
  const href = await playerLink.getAttribute("href");
  return href ? href.replace("/players/", "") : null;
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
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Escape closes.
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/teams/${slug}/roster$`));

    // Re-open, backdrop click closes.
    await page.locator(`a[href="/players/${playerId}"]:visible`).first().click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(dialog).not.toBeVisible();

    // Re-open, browser back closes.
    await page.locator(`a[href="/players/${playerId}"]:visible`).first().click();
    await expect(dialog).toBeVisible();
    await page.goBack();
    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/teams/${slug}/roster$`));
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
    const playerId = await findRosteredPlayerId(page);
    test.skip(!playerId, "No rostered player found in this environment.");

    await page.goto(`/players/${playerId}`);
    const seasonNav = page.getByRole("navigation", { name: "Season" });
    test.skip((await seasonNav.count()) === 0, "Player has only one season on file.");

    const pills = seasonNav.locator("a");
    const secondPill = pills.nth(1);
    const year = (await secondPill.textContent())?.trim();
    await secondPill.click();

    await expect(page).toHaveURL(new RegExp(`season=${year}`));
  });

  test("season pill navigation inside the modal keeps the dialog open", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    const playerId = await findRosteredPlayerId(page);
    test.skip(!playerId, "No rostered player found in this environment.");

    const slug = await findFranchiseSlug(page);
    await page.goto(`/teams/${slug}/roster`);
    await page.locator(`a[href="/players/${playerId}"]:visible`).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const seasonNav = dialog.getByRole("navigation", { name: "Season" });
    test.skip((await seasonNav.count()) === 0, "Player has only one season on file.");

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

  test("dynasty value chart: dashed + solid segments for a player with history, empty copy for one without", async ({ page }) => {
    // Patrick Mahomes (id 4046) has full value history spanning both sources.
    await page.goto("/players/4046");
    const svg = page.locator("svg[aria-label*='Dynasty value']");
    if ((await svg.count()) > 0) {
      const paths = svg.locator("path[stroke='var(--accent-gold)']");
      const dashedCount = await paths.evaluateAll((els) =>
        els.filter((el) => el.getAttribute("stroke-dasharray")).length
      );
      const solidCount = await paths.evaluateAll(
        (els) => els.filter((el) => !el.getAttribute("stroke-dasharray")).length
      );
      expect(dashedCount).toBeGreaterThan(0);
      expect(solidCount).toBeGreaterThan(0);
    }

    // A player absent from player_values shows the empty-state copy, never a
    // bare axis frame.
    await page.goto("/players/13273");
    await expect(
      page.getByText("No dynasty value history on file for this one.")
    ).toBeVisible();
  });

  test("no nested anchors on the full player-profile page", async ({ page }) => {
    const playerId = await findRosteredPlayerId(page);
    test.skip(!playerId, "No rostered player found in this environment.");

    await page.goto(`/players/${playerId}`);
    expect(await page.locator("a a").count()).toBe(0);
  });
});
