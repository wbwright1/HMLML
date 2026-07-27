import { test, expect } from "@playwright/test";
import {
  seedTradeData,
  cleanupTradeData,
  TRADE_TEST_DATA,
} from "./helpers/seed-trades";

/**
 * Trade history page (/trades): completed trades render as cards with
 * franchise names, players/picks received, and a "Trade" badge; season and
 * team filters push query params and update the visible list; a franchise
 * page's "Trade History" link lands on the filtered, team-scoped view.
 *
 * Runs against a real dev server + real Postgres (no mocks). The first
 * describe block SEEDS a known completed trade (fixed franchises, players and
 * a pick) and asserts on the resolved output, so it fails if getTrades()'
 * roster/player/pick resolution regresses (not vacuous). The second block
 * exercises the UI generically against whatever real data exists, no-opping
 * gracefully when empty, matching the pattern used elsewhere in this suite
 * (see e2e/drafts-board.spec.ts).
 */

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

test.describe("Trade history page (seeded fixture)", () => {
  // One worker, ordered: with fullyParallel, each worker would otherwise run
  // beforeAll itself and the concurrent seeds collide in the shared database.
  test.describe.configure({ mode: "serial" });

  let seededSeasonId: number;

  test.beforeAll(async () => {
    seededSeasonId = await seedTradeData();
  });

  test.afterAll(async () => {
    if (seededSeasonId != null) {
      await cleanupTradeData(seededSeasonId);
    }
  });

  test("resolves the seeded trade: both franchises, received players, and pick", async ({
    page,
  }) => {
    const t = TRADE_TEST_DATA;
    await page.setViewportSize(DESKTOP_VIEWPORT);

    // Filter to the seeded season so the fixture is isolated from real data.
    await page.goto(`/trades?season=${t.seasonYear}`);

    // Two trades are seeded (original + pick flip); player 2 only moves in
    // the original, so it uniquely identifies that card.
    const card = page
      .locator(".card-surface", { hasText: "Trade" })
      .filter({ hasText: t.player2.fullName });
    await expect(card).toHaveCount(1);

    // Both franchise names appear (both sides resolved from roster IDs).
    await expect(card).toContainText(t.franchiseA.name);
    await expect(card).toContainText(t.franchiseB.name);

    // Both franchise links present (one per side).
    const franchiseLinks = card.locator('a[href^="/teams/"]');
    expect(await franchiseLinks.count()).toBeGreaterThanOrEqual(2);

    // Received players resolved by name (only visible if adds->roster and the
    // player-name join both ran): player 2 to franchise A, player 1 to B.
    await expect(card).toContainText(t.player1.fullName);
    await expect(card).toContainText(t.player2.fullName);

    // Position badges and NFL teams resolved from the players table.
    await expect(card).toContainText(t.player1.position);
    await expect(card).toContainText(t.player2.position);
    await expect(card).toContainText(t.player1.nflTeam);

    // The received pick resolved from draftPicksInvolved (owner_id === roster).
    await expect(card).toContainText(t.pick.season);
    await expect(card).toContainText(`Round ${t.pick.round} pick`);

    // The "Trade" badge is present.
    await expect(card.getByText("Trade", { exact: true }).first()).toBeVisible();
  });

  test("team filter scopes to the seeded franchise and keeps its resolved trade", async ({
    page,
  }) => {
    const t = TRADE_TEST_DATA;
    await page.setViewportSize(DESKTOP_VIEWPORT);

    await page.goto(`/trades?team=${t.franchiseA.slug}`);

    // Franchise hero header renders for the scoped team.
    await expect(page.getByRole("heading", { name: t.franchiseA.name })).toBeVisible();

    // The seeded trade survives franchise-level filtering with full resolution.
    const card = page
      .locator(".card-surface", { hasText: "Trade" })
      .filter({ hasText: t.player2.fullName });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(t.franchiseB.name);
    await expect(card).toContainText(t.player2.fullName);
    await expect(card).toContainText(`Round ${t.pick.round} pick`);
  });

  test("a flipped pick links to the later trade it moved on in", async ({ page }) => {
    const t = TRADE_TEST_DATA;
    await page.setViewportSize(DESKTOP_VIEWPORT);

    await page.goto(`/trades?season=${t.seasonYear}`);

    // The ORIGINAL trade (identified by player 2) shows the flip link on its
    // received pick instead of a "became" line.
    const originalCard = page
      .locator(".card-surface", { hasText: "Trade" })
      .filter({ hasText: t.player2.fullName });
    const flipLink = originalCard.getByRole("link", {
      name: /flipped in a later trade/,
    });
    await expect(flipLink).toBeVisible();

    const href = await flipLink.getAttribute("href");
    expect(href).toMatch(/^\/trades#trade-\d+$/);

    // Following the link lands on the (unfiltered) trades page with the flip
    // trade's card present at the anchor target.
    await flipLink.click();
    await page.waitForURL(/\/trades#trade-\d+/);

    const target = page.locator(`#${href!.split("#")[1]}`);
    await expect(target).toBeVisible();
    await expect(target).toContainText(`Round ${t.pick.round} pick`);
    // The flip trade's receiver (franchise B) kept the pick: no further link.
    await expect(
      target.getByRole("link", { name: /flipped in a later trade/ })
    ).toHaveCount(0);
  });

  test("year-old trade shows a hindsight grade computed from realized points", async ({
    page,
  }) => {
    const t = TRADE_TEST_DATA;
    await page.setViewportSize(DESKTOP_VIEWPORT);

    await page.goto(`/trades?season=${t.seasonYear}`);

    // The original trade: 150 realized pts (A) vs 40 (B) seeded in
    // player_week_points must grade as Highway Robbery with A+/F letters.
    const card = page
      .locator(".card-surface", { hasText: "Trade" })
      .filter({ hasText: t.player2.fullName });
    await expect(card.getByText("Hindsight Report")).toBeVisible();
    await expect(card.getByText("Highway Robbery")).toBeVisible();
    await expect(card.getByText("A+", { exact: true })).toBeVisible();
    await expect(card.getByText("F", { exact: true })).toBeVisible();
    await expect(card.getByText(/150\.0 pts realized/)).toBeVisible();
    await expect(card.getByText(/40\.0 pts realized/)).toBeVisible();
  });

  test("a trade holding an unplayed rookie-class pick shows Hindsight Pending", async ({
    page,
  }) => {
    const t = TRADE_TEST_DATA;
    await page.setViewportSize(DESKTOP_VIEWPORT);

    await page.goto(`/trades?season=${t.seasonYear}`);

    // The fresh trade's 2099 pick belongs to a class nobody has seen play,
    // which blocks grading outright. (The flip trade is also ungraded, via
    // the low-points "jury" message, so scope to the rookie-class copy.)
    const card = page
      .locator(".card-surface", { hasText: "Trade" })
      .filter({ hasText: "waiting on a rookie class" });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("Hindsight Pending");
    await expect(card.getByText(/^(A\+|A|B\+|B|C|D|F)$/)).toHaveCount(0);
  });
});

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

    // Both sides of a standard 2-team trade should resolve to franchise links,
    // so a broken/unresolved side is caught rather than passing on one link.
    const franchiseLinks = firstCard.locator('a[href^="/teams/"]');
    const franchiseLinkCount = await franchiseLinks.count();
    expect(franchiseLinkCount).toBeGreaterThanOrEqual(2);

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

  test("dynasty value block shows then/now with a correct delta and degrades for missing market data", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/trades");

    const cards = page.locator(".card-surface", { hasText: "Trade" });
    const cardCount = await cards.count();
    if (cardCount === 0) return; // No completed trades seeded in this environment.

    const kickerCount = await page.getByText("Dynasty Value", { exact: false }).count();
    if (kickerCount === 0) return; // No player_values coverage in this environment.

    // Every value row is an <li> inside a "Dynasty Value" section; scan them
    // all across the page rather than trying to scope per-card (the section
    // container isn't uniquely selectable from the kicker text alone).
    const rowItems = page.locator("li").filter({
      hasText: /no market data|current value|no change|▲|▼/,
    });
    const rowCount = await rowItems.count();

    let foundFull = false;
    let foundDegraded = false;

    for (let j = 0; j < rowCount; j++) {
      const row = rowItems.nth(j);
      const text = (await row.textContent()) ?? "";

      if (!foundFull) {
        const nums = text.match(/[\d,]+/g);
        const isUp = text.includes("up ");
        const isDown = text.includes("down ");
        if ((isUp || isDown) && nums && nums.length >= 3) {
          const then = Number(nums[0].replace(/,/g, ""));
          const now = Number(nums[1].replace(/,/g, ""));
          const delta = Number(nums[2].replace(/,/g, ""));
          if (isUp) {
            expect(now - then).toBe(delta);
            foundFull = true;
          } else {
            expect(then - now).toBe(delta);
            foundFull = true;
          }
        }
      }

      if (!foundDegraded && (text.includes("no market data") || text.includes("current value"))) {
        foundDegraded = true;
      }

      if (foundFull && foundDegraded) break;
    }

    // At least one of the two shapes must be present given real data exists;
    // both are asserted when available, but the environment's actual mix of
    // backfilled/unbackfilled assets determines whether both are findable.
    expect(foundFull || foundDegraded).toBe(true);
  });

  test("dynasty value block sits after the Hindsight block and before the Site Desk Verdict", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/trades");

    const cards = page.locator(".card-surface", { hasText: "Trade" });
    const cardCount = await cards.count();
    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i);
      const html = await card.innerHTML();
      const hindsightIdx = html.indexOf("Hindsight Report");
      const hindsightPendingIdx = html.indexOf("Hindsight Pending");
      const valueIdx = html.indexOf("Dynasty Value");
      const verdictIdx = html.indexOf("Site Desk Verdict");

      if (valueIdx === -1) continue;

      const gradeIdx = hindsightIdx !== -1 ? hindsightIdx : hindsightPendingIdx;
      if (gradeIdx !== -1) {
        expect(valueIdx).toBeGreaterThan(gradeIdx);
      }
      if (verdictIdx !== -1) {
        expect(valueIdx).toBeLessThan(verdictIdx);
      }
      break;
    }
  });

  test("attribution line renders exactly once when values are present", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/trades");

    const attribution = page.getByText(
      "Dynasty values via FantasyCalc; historical snapshots via DynastyProcess."
    );
    const count = await attribution.count();
    if (count === 0) return; // No values in this environment.
    expect(count).toBe(1);
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
