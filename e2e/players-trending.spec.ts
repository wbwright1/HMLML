import { test, expect } from "@playwright/test";

/**
 * Players page: PROJ column, TRD (trending-adds) signal, and the trending
 * rail (components/trending-rail.tsx).
 *
 * Both signals are conditional on real, live-adjacent data that this suite
 * cannot seed deterministically:
 *   - PROJ only renders once the hourly sync has written projections for the
 *     CURRENT season/week (matched against the live Sleeper NFL-state
 *     endpoint), for ROSTERED players. The default "Free Agents" roster
 *     filter can legitimately show an all-dash PROJ column even when the
 *     column itself is populated for rostered players elsewhere in the list
 *     -- that mirrors the existing Age/Exp null treatment, not a bug.
 *   - TRD/the trending rail hit the live Sleeper trending-adds endpoint at
 *     render and degrade to [] on any failure.
 *
 * So every assertion here is conditional: if the column/rail isn't present
 * in this run, that's a valid state and the test no-ops rather than failing,
 * matching the pattern already used throughout e2e/players-page.spec.ts.
 */

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };
const NUMBER_OR_DASH = /^-$|^\d+(\.\d+)?$/;

test.describe("Players page: PROJ / trending", () => {
  test("PROJ column, when rendered, shows a number or the null dash for every visible row", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/players");

    const rows = page.locator("table tbody tr");
    if ((await rows.count()) === 0) return;

    const projHeader = page.getByRole("columnheader", { name: "Proj", exact: true });
    if ((await projHeader.count()) === 0) return; // column omitted: no projections synced yet

    await expect(projHeader).toBeVisible();

    // PROJ is the 3rd column (Player, Pts, Proj, ...).
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const cellText = (
        await rows.nth(i).locator("td:nth-child(3) span").textContent()
      )?.trim();
      expect(cellText).toBeTruthy();
      expect(cellText).toMatch(NUMBER_OR_DASH);
    }
  });

  test("switching to All Players can surface non-dash PROJ values for rostered players", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/players");

    const projHeader = page.getByRole("columnheader", { name: "Proj", exact: true });
    if ((await projHeader.count()) === 0) return;

    const rosterSelect = page.getByLabel("Roster");
    await rosterSelect.click();
    await page.getByRole("option", { name: "All Players" }).click();

    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    if (count === 0) return;

    // Not asserting a specific row has a value (the current-week sync may
    // legitimately be empty for every rostered player too); just confirm the
    // column keeps rendering valid cell content after the filter change.
    const firstCell = (
      await rows.first().locator("td:nth-child(3) span").textContent()
    )?.trim();
    expect(firstCell).toBeTruthy();
    expect(firstCell).toMatch(NUMBER_OR_DASH);
  });

  test("TRD column, when rendered, pairs the arrow glyph with a visible count (not color alone)", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/players");

    const trdHeader = page.getByRole("columnheader", { name: "Trd", exact: true });
    if ((await trdHeader.count()) === 0) return; // trending list empty: column omitted

    await expect(trdHeader).toBeVisible();

    const rosterSelect = page.getByLabel("Roster");
    await rosterSelect.click();
    await page.getByRole("option", { name: "All Players" }).click();

    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    if (count === 0) return;

    // TRD is the last column; find any row carrying a trending marker (has
    // an svg arrow) and assert it also carries a plain-text count, not a
    // color-only signal.
    const trendingCell = rows.locator("td:last-child").filter({ has: page.locator("svg") });
    const trendingCount = await trendingCell.count();
    if (trendingCount === 0) return; // no rostered player happens to be trending right now

    const text = (await trendingCell.first().textContent())?.trim();
    expect(text).toBeTruthy();
    expect(text).toMatch(/^\d+$/);
  });

  test("trending rail is either absent or renders real player rows with headshots and counts", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/players");

    const railHeading = page.getByText("Trending · Adds");

    if ((await railHeading.count()) === 0) {
      // Sleeper trending-adds call failed/empty this run: rail correctly
      // renders nothing.
      return;
    }

    await expect(railHeading).toBeVisible();

    const railRows = page
      .locator("aside")
      .locator("li")
      .filter({ has: page.locator("img") });
    const rowCount = await railRows.count();
    expect(rowCount).toBeGreaterThan(0);

    const firstRow = railRows.first();
    await expect(firstRow.locator("img").first()).toBeVisible();

    const countBadge = (await firstRow.locator("span").last().textContent())?.trim();
    expect(countBadge).toBeTruthy();
    expect(countBadge).toMatch(/^\d+$/);
  });
});
