import { test, expect } from "@playwright/test";

/**
 * Players page (Command Center restyle): position filter pills filter rows,
 * search input filters, headshots render with alt text, sort still works,
 * and ?q= deep-links prefill the search box.
 *
 * Runs against a real dev server + real Postgres (no mocks). When the
 * database has no player rows the page shows its EmptyState; assertions
 * that require data gracefully no-op in that case rather than failing,
 * matching the pattern used by the rest of this suite.
 */

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };

test.describe("Players page", () => {
  test("position filter pills filter the visible rows", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/players");

    const rows = page.locator("table tbody tr");
    const initialCount = await rows.count();
    if (initialCount === 0) {
      // No seeded players in this environment — nothing to filter.
      return;
    }

    const qbTab = page.getByRole("tab", { name: "QB", exact: true });
    await expect(qbTab).toBeVisible();
    await qbTab.click();
    await expect(qbTab).toHaveAttribute("aria-selected", "true");

    const filteredRows = page.locator("table tbody tr");
    const filteredCount = await filteredRows.count();

    if (filteredCount === 0) {
      // No QBs on rosters in this environment.
      return;
    }

    // Every visible row's "TEAM · POS" line must end in QB.
    for (let i = 0; i < filteredCount; i++) {
      const teamPosLine = filteredRows.nth(i).locator("p").nth(1);
      await expect(teamPosLine).toContainText("QB");
    }

    // Filtering to a single position should never show more rows than
    // the unfiltered "ALL" view.
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test("search input filters players by name", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/players");

    const rows = page.locator("table tbody tr");
    const initialCount = await rows.count();
    if (initialCount === 0) return;

    // Grab a real player's name from the first row to search for.
    const firstName = await rows.first().locator("p").first().textContent();
    if (!firstName) return;
    const query = firstName.trim().split(/\s+/)[0]; // first name / first token

    const search = page.getByRole("searchbox");
    await search.fill(query);

    const filteredRows = page.locator("table tbody tr");
    const filteredCount = await filteredRows.count();
    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThanOrEqual(initialCount);

    for (let i = 0; i < filteredCount; i++) {
      const rowText = (await filteredRows.nth(i).textContent()) ?? "";
      expect(rowText.toLowerCase()).toContain(query.toLowerCase());
    }
  });

  test("player headshots render with non-empty alt text", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/players");

    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    if (count === 0) return;

    const headshotImg = rows.first().locator("img").first();
    await expect(headshotImg).toBeVisible();
    const alt = await headshotImg.getAttribute("alt");
    expect(alt).toBeTruthy();
    expect(alt!.length).toBeGreaterThan(0);
  });

  test("clicking the points column header sorts the table", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/players");

    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    if (count < 2) return;

    const ptsHeader = page.getByRole("button", { name: /Pts/ });
    await expect(ptsHeader).toBeVisible();

    // Default sort is points descending — capture it, then toggle to
    // ascending and confirm the order actually flips.
    const pointsCellSelector = "td:nth-child(2) span";
    const beforeFirst = await rows.first().locator(pointsCellSelector).textContent();

    await ptsHeader.click(); // toggles desc -> asc
    await expect(ptsHeader).toHaveAttribute("aria-sort", "ascending");

    const afterRows = page.locator("table tbody tr");
    const afterFirst = await afterRows.first().locator(pointsCellSelector).textContent();

    expect(afterFirst).not.toBe(beforeFirst);
  });

  test("?q= query param prefills the search box and filters results", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);

    // First, discover a real player name to deep-link with.
    await page.goto("/players");
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    if (count === 0) return;

    const firstName = await rows.first().locator("p").first().textContent();
    if (!firstName) return;
    const query = firstName.trim().split(/\s+/)[0];

    await page.goto(`/players?q=${encodeURIComponent(query)}`);

    const search = page.getByRole("searchbox");
    await expect(search).toHaveValue(query);

    const filteredRows = page.locator("table tbody tr");
    const filteredCount = await filteredRows.count();
    expect(filteredCount).toBeGreaterThan(0);

    for (let i = 0; i < filteredCount; i++) {
      const rowText = (await filteredRows.nth(i).textContent()) ?? "";
      expect(rowText.toLowerCase()).toContain(query.toLowerCase());
    }
  });
});
