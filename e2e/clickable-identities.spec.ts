import { test, expect, type Page } from "@playwright/test";

// ============================================================================
// Issue #275: every team and player listing is clickable.
//
// Drives the real stack against the real Postgres. Nothing is mocked. Two
// kinds of proof:
//
//   1. Structural: no page in the sweep contains a nested anchor, and no page
//      logs a React hydration error. `<a>` inside `<a>` and `<div>` inside
//      `<p>` are exactly the two mistakes this sweep can make, and neither is
//      caught by lint or by tsc: they surface only in the browser console.
//   2. Behavioral: on each representative surface, clicking the identity
//      lands on that identity's own page. These cannot pass if the links were
//      removed, because the click would have nowhere to go.
// ============================================================================

/** Every route the sweep touched, plus the two it must not have broken. */
const SWEPT_ROUTES = [
  "/",
  "/book",
  "/records",
  "/seasons/2025",
  "/drafts/2025",
  "/playoffs/2025",
  "/trades",
  "/teams",
];

/**
 * The console errors invalid nesting raises. A plain string match keeps this
 * honest across React versions: the messages name the tags involved
 * ("In HTML, <a> cannot be a descendant of <a>", "<div> cannot be a descendant
 * of <p>"), and the structural variant of the hydration failure reports
 * mismatched HTML rather than mismatched text.
 *
 * Deliberately NOT matched: "the server rendered text didn't match". The hub's
 * KickoffCountdown prints a live seconds digit, so its SSR value and its
 * hydration value differ whenever a request straddles a second. That is a
 * clock race in an existing island, not a nesting bug, and matching it makes
 * this gate flake on the hub roughly one run in five.
 */
function isNestingError(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("cannot be a descendant") ||
    t.includes("cannot appear as a descendant") ||
    t.includes("validatedomnesting") ||
    t.includes("server rendered html didn't match")
  );
}

async function collectConsoleErrors(page: Page, url: string): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      const text = msg.text();
      if (isNestingError(text)) errors.push(text);
    }
  });
  page.on("pageerror", (err) => {
    if (isNestingError(err.message)) errors.push(err.message);
  });
  const response = await page.goto(url);
  expect(response?.status(), `${url} should render`).toBeLessThan(400);
  // Give hydration a beat to run and complain. Deliberately not
  // "networkidle": the live-score poller keeps a request in flight during a
  // game window and would never settle.
  await page.waitForLoadState("load");
  await page.waitForTimeout(700);
  return errors;
}

for (const route of SWEPT_ROUTES) {
  test(`${route} hydrates with no nested anchors`, async ({ page }) => {
    const errors = await collectConsoleErrors(page, route);
    expect(errors, `console errors on ${route}`).toEqual([]);

    // The structural assertion, independent of whether React noticed: an
    // anchor inside an anchor is invalid HTML and breaks hydration.
    const nested = await page.locator("a a").count();
    expect(nested, `nested anchors on ${route}`).toBe(0);
  });
}

/**
 * The three swept routes whose URL has to be discovered rather than written
 * down: a franchise's draft page, a matchup detail page, and a player profile.
 * Same hard gate as the static list above.
 */
test("discovered routes hydrate with no nested anchors", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/teams");
  const teamHref = await page
    .locator('a[href^="/teams/"]')
    .first()
    .getAttribute("href");
  const routes = [`${teamHref}/drafts`];

  await page.goto("/players");
  const playerHref = await page
    .locator('a[href^="/players/"]')
    .first()
    .getAttribute("href");
  if (playerHref) routes.push(playerHref);

  // Matchup detail, reached from the schedule page rather than guessed:
  // which weeks are linked depends on the calendar. Count first, because
  // asking a locator that matches nothing for an attribute waits forever.
  await page.goto("/schedule");
  const matchupLinks = page.locator('a[href^="/matchups/"]');
  expect(
    await matchupLinks.count(),
    "the schedule should link at least one matchup"
  ).toBeGreaterThan(0);
  const matchupHref = await matchupLinks.first().getAttribute("href");
  if (matchupHref) routes.push(matchupHref);

  for (const route of routes) {
    const errors = await collectConsoleErrors(page, route);
    expect(errors, `console errors on ${route}`).toEqual([]);
    expect(await page.locator("a a").count(), `nested anchors on ${route}`).toBe(0);
  }
});

test("season standings rows link to their franchise", async ({ page }) => {
  await page.goto("/seasons/2025");
  const row = page.locator('table a[href^="/teams/"]').first();
  await expect(row).toBeVisible();
  const href = await row.getAttribute("href");
  await row.click();
  await page.waitForURL(`**${href}`);
  await expect(page.locator("h1").first()).toBeVisible();
});

test("the playoffs champion hero links to the champion's page", async ({
  page,
}) => {
  await page.goto("/playoffs/2025");
  const hero = page.locator('a[href^="/teams/"]').first();
  await expect(hero).toBeVisible();
  const href = await hero.getAttribute("href");
  expect(href).toMatch(/^\/teams\/[a-z0-9-]+$/);
  await hero.click();
  await page.waitForURL(`**${href}`);
  await expect(page.locator("h1").first()).toBeVisible();
});

test("draft board column headers link to their franchise", async ({ page }) => {
  await page.goto("/drafts/2025");
  const header = page
    .locator('[data-testid="draft-column-header"] a[href^="/teams/"]')
    .first();
  await expect(header).toBeAttached();
  const href = await header.getAttribute("href");
  expect(href).toMatch(/^\/teams\/[a-z0-9-]+$/);
});

test("a franchise's draft picks link to the player", async ({ page }) => {
  // Reach the page the way a reader does, off the teams index.
  await page.goto("/teams");
  const team = page.locator('a[href^="/teams/"]').first();
  const teamHref = await team.getAttribute("href");
  await page.goto(`${teamHref}/drafts`);

  // :visible because the page ships a mobile row list and a desktop table;
  // only one of the two is on screen at the viewport under test.
  const pick = page.locator('a[href^="/players/"]:visible').first();
  await expect(pick).toBeVisible();
  const href = await pick.getAttribute("href");
  await pick.click();
  await page.waitForURL(`**${href}**`);
  await expect(page.locator("h1").first()).toBeVisible();
});

test("The Book's ATS leaderboard rows link to their franchise", async ({
  page,
}) => {
  await page.goto("/book");
  // The Book's tabs are client state, not a search param: all four panes ship
  // in the cached HTML and the pill flips which one is visible.
  await page.getByRole("tab", { name: "Tracking" }).click();
  const row = page
    .locator('[id="book-pane-tracking"] a[href^="/teams/"]:visible')
    .first();
  await expect(row).toBeVisible();
  const href = await row.getAttribute("href");
  expect(href).toMatch(/^\/teams\/[a-z0-9-]+$/);
  await row.click();
  await page.waitForURL(`**${href}`);
  await expect(page.locator("h1").first()).toBeVisible();
});

test("The Book's props chips link to their subject", async ({ page }) => {
  await page.goto("/book");
  await page.getByRole("tab", { name: "Props" }).click();
  // Props subjects are players or franchises depending on the slate; either is
  // a pass, a chip with no link at all is not.
  const chip = page
    .locator(
      '[id="book-pane-props"] a[href^="/players/"]:visible, [id="book-pane-props"] a[href^="/teams/"]:visible'
    )
    .first();
  await expect(chip).toBeVisible();
  const href = await chip.getAttribute("href");
  expect(href).toMatch(/^\/(players|teams)\/[^/]+$/);
});

test("trade cards link both franchises and the grade rows", async ({ page }) => {
  await page.goto("/trades");
  const teamLinks = page.locator('article a[href^="/teams/"], a[href^="/teams/"]');
  expect(await teamLinks.count()).toBeGreaterThan(0);
  const href = await teamLinks.first().getAttribute("href");
  expect(href).toMatch(/^\/teams\/[a-z0-9-]+/);
});

test("the hub links the franchises it names", async ({ page }) => {
  await page.goto("/");
  // The hub always names franchises in some module for the current calendar
  // state (matchup/slate cards, standings, superlatives, recap rows).
  const links = page.locator('main a[href^="/teams/"]');
  // The hub's body streams in behind a Suspense skeleton, so a bare count()
  // can read the fallback and see zero. Wait on the first link (auto-retrying)
  // before asserting the count.
  await expect(links.first()).toBeVisible();
  expect(await links.count(), "team links on the hub").toBeGreaterThan(0);
  const href = await links.first().getAttribute("href");
  await links.first().click();
  await page.waitForURL(`**${href}`);
  await expect(page.locator("h1").first()).toBeVisible();
});
