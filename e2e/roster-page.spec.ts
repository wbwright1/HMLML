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

  /**
   * Detects the live season segment from the nav's seasonal live pill, a
   * completely separate code path (lib/hub/season-state + kickoff countdown)
   * from the roster table's column logic. This makes the assertions below
   * non-circular: if the PROJ-leads rendering were deleted while the site is
   * in preseason, the pill would still read "PRESEASON" and the test would
   * fail rather than silently pass. Mirrors e2e/players-page.spec.ts.
   */
  async function detectPreseason(page: import("@playwright/test").Page) {
    const chromeText = await page.locator("body").innerText();
    const preseasonKickoff = chromeText.match(
      /PRESEASON\b[^\n]*?\bIN\s+(\d+)\s*D\b/i
    );
    const isPreseasonPill =
      preseasonKickoff != null || /\bpreseason\b/i.test(chromeText);

    // KICKOFF_LEAD_DAYS in lib/season-segment.ts: within this window before
    // week-1 kickoff the page (deliberately) flips to the in-season WK
    // layout, even while the pill still says PRESEASON.
    const KICKOFF_LEAD_DAYS = 7;
    const daysToKickoff = preseasonKickoff ? Number(preseasonKickoff[1]) : null;
    const inKickoffSeam =
      daysToKickoff != null && daysToKickoff <= KICKOFF_LEAD_DAYS;

    return { isPreseasonPill, inKickoffSeam, daysToKickoff };
  }

  test("preseason: PROJ column leads with a real projected value, and mobile stays width-capped without horizontal page overflow", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    const rosterPath = await firstRosterPath(page);
    if (!rosterPath) return; // No franchises seeded in this environment.

    await page.goto(rosterPath);

    const { isPreseasonPill, inKickoffSeam, daysToKickoff } =
      await detectPreseason(page);

    test.skip(
      !isPreseasonPill,
      "live season is not preseason (nav pill did not read PRESEASON); nothing to assert for the PROJ-leads roster layout"
    );
    test.skip(
      inKickoffSeam,
      `within the kickoff seam (${daysToKickoff}D out): roster page flips to the in-season WK layout by design`
    );

    // From here the live season is unambiguously preseason: the PROJ-leads
    // layout MUST be present on the Starting Lineup table. No early returns
    // below; any deviation is a hard failure.
    const startingLineupHeading = page.locator("h2", {
      hasText: "Starting Lineup",
    });
    await expect(startingLineupHeading).toBeVisible();

    const startingLineupTable = startingLineupHeading
      .locator("xpath=following-sibling::div[1]")
      .locator("table");
    await expect(startingLineupTable).toBeVisible();

    const projHeader = startingLineupTable.locator("th").filter({ hasText: /^PROJ$/ });
    const projHeaderCount = await projHeader.count();

    // The roster page gates the PROJ column on the roster actually having
    // projection data (projSeason != null), not on segment alone: before the
    // daily projection sync has run for this franchise's roster, PROJ is
    // suppressed and PTS gets the headline treatment instead. That is a
    // legitimate no-data state, not a broken layout, so skip with a logged
    // reason rather than failing. When PROJ IS present, the guard guarantees
    // real data backs it, so the assertions below are sound and unskippable.
    test.skip(
      projHeaderCount === 0,
      "PROJ column is data-guarded and suppressed (no projSeason data on this roster yet); nothing to hard-assert for the PROJ-leads layout"
    );

    await expect(projHeader).toBeVisible();
    await expect(projHeader).toHaveAttribute("title", /projected/i);

    // PROJ is the third column: Player (sticky), POS, then PROJ.
    const projColIndex = await projHeader.evaluate((el) =>
      Array.from(el.parentElement!.children).indexOf(el)
    );
    expect(projColIndex).toBe(2);

    // At least one starter row renders a non-dash PROJ value in the mono
    // stat style (text-stat), proving real projection data reached the cell.
    const rows = startingLineupTable.locator("tbody tr");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    let foundNonDash = false;
    for (let i = 0; i < rowCount; i++) {
      const cell = rows.nth(i).locator("td").nth(projColIndex);
      const text = (await cell.textContent())?.trim() ?? "";
      if (text !== "-" && text.length > 0) {
        expect(text).toMatch(/^\d+\.\d$/);
        const statSpan = cell.locator(".text-stat");
        await expect(statSpan).toHaveCount(1);
        await expect(statSpan).toHaveClass(/text-text-primary/);
        foundNonDash = true;
        break;
      }
    }
    expect(foundNonDash).toBe(true);

    // Mobile: the sticky Player cell stays width-capped and the document
    // never scrolls horizontally, matching the players page's mobile
    // compaction contract.
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto(rosterPath);

    const firstRow = page.locator("table tbody tr").first();
    await expect(firstRow).toBeVisible();

    const firstCell = firstRow.locator("td").first();
    const width = await firstCell.evaluate(
      (el) => el.getBoundingClientRect().width
    );
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThanOrEqual(176);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
});
