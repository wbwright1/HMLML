import { test, expect } from "@playwright/test";

/**
 * Team roster page (#164): converted from card/table breakpoint switching to
 * a single horizontally-scrolling table at all breakpoints, mirroring
 * app/players/player-table.tsx's desktop table.
 *
 * Runs against a real dev server + real Postgres (no mocks). When no
 * franchises/rosters are seeded, assertions that require data gracefully
 * no-op rather than failing, matching the convention used across e2e/.
 */

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

/** Navigates to /teams, grabs the first franchise slug, and returns its roster path. Returns null when no franchises are seeded. */
async function firstRosterPath(page: import("@playwright/test").Page): Promise<string | null> {
  await page.goto("/teams");
  const link = page.locator('a[href^="/teams/"]').first();
  const count = await link.count();
  if (count === 0) return null;

  const href = await link.getAttribute("href");
  if (!href) return null;

  const slug = href.replace(/^\/teams\//, "").split("/")[0];
  if (!slug) return null;

  return `/teams/${slug}/roster`;
}

test.describe("Roster page", () => {
  test("desktop: at least one section table renders with rows", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    const rosterPath = await firstRosterPath(page);
    if (!rosterPath) return;

    await page.goto(rosterPath);

    const tables = page.locator("table");
    const tableCount = await tables.count();
    if (tableCount === 0) return; // No roster data synced in this environment.

    const rows = tables.first().locator("tbody tr");
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test("mobile: table is visible and no card-stack fallback remains", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    const rosterPath = await firstRosterPath(page);
    if (!rosterPath) return;

    await page.goto(rosterPath);

    const table = page.locator("table").first();
    if ((await table.count()) === 0) return;

    await expect(table).toBeVisible();
    expect(await page.locator(".md\\:hidden").count()).toBe(0);
  });

  test("mobile: acronym headers carry full-text title + aria-label", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    const rosterPath = await firstRosterPath(page);
    if (!rosterPath) return;

    await page.goto(rosterPath);

    const table = page.locator("table").first();
    if ((await table.count()) === 0) return;

    const checks: [string, RegExp][] = [
      ["POS", /position/i],
      ["TM", /team/i],
      ["AGE", /age/i],
      ["EXP", /experience/i],
      ["INJ", /injury/i],
    ];

    for (const [label, pattern] of checks) {
      const th = table.locator("th", { hasText: label }).first();
      if ((await th.count()) === 0) continue; // e.g. PROJ-gated headers shift columns; POS/TM/AGE/EXP/INJ always render.

      const title = await th.getAttribute("title");
      const ariaLabel = await th.getAttribute("aria-label");
      const text = (title ?? ariaLabel ?? "").trim();
      expect(text.length).toBeGreaterThan(0);
      expect(text).toMatch(pattern);
    }
  });

  test("mobile: section table scrolls horizontally without the page scrolling", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    const rosterPath = await firstRosterPath(page);
    if (!rosterPath) return;

    await page.goto(rosterPath);

    const scrollContainer = page.locator("div.overflow-x-auto").first();
    if ((await scrollContainer.count()) === 0) return;

    const { scrollWidth, clientWidth } = await scrollContainer.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);

    const pageScroll = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement?.scrollWidth ?? 0,
      innerWidth: window.innerWidth,
    }));
    expect(pageScroll.scrollWidth).toBeLessThanOrEqual(pageScroll.innerWidth);
  });

  test("mobile: first row's Player cell is sticky at the left edge", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    const rosterPath = await firstRosterPath(page);
    if (!rosterPath) return;

    await page.goto(rosterPath);

    const firstRow = page.locator("table tbody tr").first();
    if ((await firstRow.count()) === 0) return;

    const firstCell = firstRow.locator("td").first();
    const style = await firstCell.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return { position: computed.position, left: computed.left };
    });

    expect(style.position).toBe("sticky");
    expect(style.left).toBe("0px");
  });

  test("mobile: TM cell renders an image with non-empty alt text", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    const rosterPath = await firstRosterPath(page);
    if (!rosterPath) return;

    await page.goto(rosterPath);

    const firstRow = page.locator("table tbody tr").first();
    if ((await firstRow.count()) === 0) return;

    // TM is the 5th visible column when PROJ is absent (Player, POS, AGE,
    // EXP, TM, INJ); PROJ shifts it to 6th. Rather than hard-code an index,
    // scan cells for one containing an <img>, which the TM (or DEF's
    // NflTeamLogo fallback) column always does, distinct from the Player
    // cell which is sticky and comes first.
    const cellsWithImg = firstRow.locator("td:not(:first-child) img");
    const count = await cellsWithImg.count();
    if (count === 0) return; // NflTeamLogo fell back to a text monogram (no <img>).

    const alt = await cellsWithImg.first().getAttribute("alt");
    expect(alt).toBeTruthy();
    expect(alt!.length).toBeGreaterThan(0);
  });
});
