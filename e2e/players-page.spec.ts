import { test, expect } from "@playwright/test";

/**
 * Players page (Command Center restyle): position filter pills filter rows,
 * search input filters, headshots render with alt text, sort still works,
 * and ?q= deep-links prefill the search box.
 *
 * The table is a single horizontally-scrolling table at every breakpoint
 * (issue #161): no separate mobile card stack. On narrow screens the table
 * itself overflows and scrolls within its own container, the Player column
 * stays pinned via `position: sticky`, and acronym headers (PTS/AGE/EXP/
 * TM/INJ/TRD) carry their full text via aria-label/title.
 *
 * Runs against a real dev server + real Postgres (no mocks). When the
 * database has no player rows the page shows its EmptyState; assertions
 * that require data gracefully no-op in that case rather than failing,
 * matching the pattern used by the rest of this suite.
 */

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

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

    // The header now shows the acronym "PTS" with the full text ("2026
    // fantasy points") reachable via aria-label/title; match on the title
    // rather than the visible acronym text.
    const ptsHeader = page.getByTitle(/fantasy points/i);
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

  test.describe("mobile (390px): horizontally-scrolling table, no card fallback", () => {
    test("the table is visible and there is no separate mobile card stack", async ({
      page,
    }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.goto("/players");

      const table = page.locator("table");
      const rows = page.locator("table tbody tr");
      const count = await rows.count();
      if (count === 0) return;

      await expect(table).toBeVisible();

      // The old mobile card fallback rendered "HMLML Team" as a row label
      // inside a card-surface div stack, keyed off a `md:hidden` wrapper.
      // That whole block is deleted; the table markup is the only player
      // list on the page at any viewport.
      const cardStack = page.locator(".md\\:hidden .card-surface");
      expect(await cardStack.count()).toBe(0);
    });

    test("acronym headers are present with full text reachable via aria-label/title", async ({
      page,
    }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.goto("/players");

      const rows = page.locator("table tbody tr");
      if ((await rows.count()) === 0) return;

      const ptsHeader = page.locator("th", { hasText: "PTS" });
      await expect(ptsHeader).toBeVisible();
      const ptsTitle = await ptsHeader.getAttribute("title");
      expect(ptsTitle).toMatch(/fantasy points/i);
      const ptsAriaLabel = await ptsHeader.getAttribute("aria-label");
      expect(ptsAriaLabel).toMatch(/fantasy points/i);

      const ageHeader = page.locator("th", { hasText: "AGE" });
      await expect(ageHeader).toBeVisible();
      expect(await ageHeader.getAttribute("title")).toMatch(/age/i);

      const expHeader = page.locator("th", { hasText: "EXP" });
      await expect(expHeader).toBeVisible();
      expect(await expHeader.getAttribute("title")).toMatch(/experience/i);

      const tmHeader = page.locator("th", { hasText: "TM" });
      await expect(tmHeader).toBeVisible();
      expect(await tmHeader.getAttribute("title")).toMatch(/team/i);
    });

    test("the table container scrolls horizontally, but the page body never does", async ({
      page,
    }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.goto("/players");

      const rows = page.locator("table tbody tr");
      if ((await rows.count()) === 0) return;

      const scrollContainer = page.locator("div.overflow-x-auto");

      const { scrollWidth, clientWidth } = await scrollContainer.evaluate(
        (el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })
      );
      expect(scrollWidth).toBeGreaterThan(clientWidth);

      const bodyOverflow = await page.evaluate(() => {
        const se = document.scrollingElement;
        return {
          scrollWidth: se ? se.scrollWidth : 0,
          innerWidth: window.innerWidth,
        };
      });
      expect(bodyOverflow.scrollWidth).toBeLessThanOrEqual(
        bodyOverflow.innerWidth
      );
    });

    test("the Player column is sticky and pinned to the left edge", async ({
      page,
    }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.goto("/players");

      const rows = page.locator("table tbody tr");
      if ((await rows.count()) === 0) return;

      const firstCell = rows.first().locator("td").first();
      const position = await firstCell.evaluate(
        (el) => getComputedStyle(el).position
      );
      expect(position).toBe("sticky");

      const left = await firstCell.evaluate((el) => getComputedStyle(el).left);
      expect(left).toBe("0px");
    });

    test("a rostered player's TM cell shows a team logo with a non-empty name label", async ({
      page,
    }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.goto("/players");

      const rows = page.locator("table tbody tr");
      const count = await rows.count();
      if (count === 0) return;

      // Find a rostered row: its TM cell has a link to /teams/*, unlike a
      // free agent row's plain "FA" text chip.
      let found = false;
      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const teamLink = row.locator('a[href^="/teams/"]');
        if (await teamLink.count()) {
          const title = await teamLink.getAttribute("title");
          expect(title).toBeTruthy();
          expect(title!.length).toBeGreaterThan(0);

          const logoImg = teamLink.locator("img");
          if (await logoImg.count()) {
            const alt = await logoImg.getAttribute("alt");
            expect(alt).toBe(title);
          }
          found = true;
          break;
        }
      }

      // If no player in view is currently rostered, there's nothing to
      // assert against — skip gracefully rather than fail.
      if (!found) return;
    });
  });
});
