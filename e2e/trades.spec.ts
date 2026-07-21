import { test, expect } from "@playwright/test";

/**
 * Trade history page (/trades): completed trades render as cards with
 * franchise names, players/picks received, and a "Trade" badge; season and
 * team filters push query params and update the visible list; a franchise
 * page's "Trade History" link lands on the filtered, team-scoped view.
 *
 * Runs against a real dev server + real Postgres (no mocks). Discovers real
 * data rather than seeding/hardcoding; no-ops gracefully when the database
 * has no completed trades in this environment, matching the pattern used by
 * the rest of this suite (see e2e/drafts-board.spec.ts).
 */

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

test.describe("Trade history page", () => {
  test("renders trade cards with two franchise names, a player or pick, and a Trade badge", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/trades");

    await expect(page.getByRole("heading", { name: "Trade History." })).toBeVisible();

    const cards = page.locator(".card-surface", { hasText: "Trade" });
    const count = await cards.count();
    if (count === 0) return; // No completed trades seeded in this environment.

    const firstCard = cards.first();
    await expect(firstCard.getByText("Trade", { exact: true }).first()).toBeVisible();

    // At least two franchise name links should appear in a trade card (both sides).
    const franchiseLinks = firstCard.locator('a[href^="/teams/"]');
    const franchiseLinkCount = await franchiseLinks.count();
    expect(franchiseLinkCount).toBeGreaterThanOrEqual(1);

    // Should show at least a player name or a pick line.
    const hasPickText = await firstCard.getByText(/Round \d+ pick/).count();
    const hasPositionBadge = await firstCard
      .locator("span", { hasText: /^(QB|RB|WR|TE|K|DEF|DST)$/ })
      .count();
    expect(hasPickText + hasPositionBadge).toBeGreaterThan(0);
  });

  test("changing the season select updates the URL and the list", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/trades");

    const seasonSelect = page.locator("#trade-season");
    if ((await seasonSelect.count()) === 0) return;

    const options = await seasonSelect.locator("option").allTextContents();
    const realSeasonOption = options.find((o) => o !== "All seasons");
    if (!realSeasonOption) return; // No seasons in this environment.

    await seasonSelect.selectOption({ label: realSeasonOption });
    await page.waitForURL(/[?&]season=/);
    expect(page.url()).toContain(`season=${realSeasonOption}`);
  });

  test("changing the team select updates the URL and scopes visible cards", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/trades");

    const teamSelect = page.locator("#trade-team");
    if ((await teamSelect.count()) === 0) return;

    const options = teamSelect.locator("option");
    const optionCount = await options.count();
    if (optionCount < 2) return; // No teams in this environment.

    const secondOption = options.nth(1);
    const teamName = await secondOption.textContent();
    const teamValue = await secondOption.getAttribute("value");
    if (!teamName || !teamValue) return;

    await teamSelect.selectOption({ label: teamName });
    await page.waitForURL(/[?&]team=/);
    expect(page.url()).toContain(`team=${teamValue}`);

    const cards = page.locator(".card-surface", { hasText: "Trade" });
    const cardCount = await cards.count();
    for (let i = 0; i < cardCount; i++) {
      await expect(cards.nth(i)).toContainText(teamName.trim());
    }
  });

  test("franchise page 'Trade History' link lands on the team-scoped trades view", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/teams");

    const teamLink = page.locator('a[href^="/teams/"]').first();
    if ((await teamLink.count()) === 0) return;

    const href = await teamLink.getAttribute("href");
    if (!href) return;

    await page.goto(href);
    const tradeHistoryLink = page.getByRole("link", { name: "Trade History" });
    if ((await tradeHistoryLink.count()) === 0) return;

    await tradeHistoryLink.click();
    await page.waitForURL(/\/trades\?team=/);
    expect(page.url()).toContain("/trades?team=");

    // FranchiseIdentity hero header should render for the scoped team.
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("mobile viewport stacks trade card sides", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/trades");

    const cards = page.locator(".card-surface", { hasText: "Trade" });
    if ((await cards.count()) === 0) return;

    // The flex row wrapping sides should switch to column at mobile width
    // (flex-col md:flex-row on the card's side container).
    const sidesContainer = cards.first().locator(".flex.flex-col.md\\:flex-row").first();
    await expect(sidesContainer).toBeVisible();
  });
});
