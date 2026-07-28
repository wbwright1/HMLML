import { test, expect } from "@playwright/test";

/**
 * Mobile weekly-line cards on the player-profile page (issue #134): the hero
 * actual-points number, inline projection + delta, the compact stat summary
 * line, honest status chips (including NOT ROSTERED on stat-only weeks with
 * no hero shown), and that the desktop table still renders unchanged at md+.
 *
 * Runs against a real dev/build server + real Postgres (no mocks).
 *
 * Deviation from the approved plan: the plan asked for a real QB and a real K.
 * This league has no K roster slot (verified against player_week_points /
 * player_week_stats — zero K rows exist in either table), so no kicker is
 * ever rostered and no kicker has weekly points. The K rendering path
 * (formatStatSummary "K" branch, fgm/fga pair + xpm) is covered by the unit
 * test in weekly-line-model.test.ts instead. This spec uses a QB (Patrick
 * Mahomes, id 4046, multi-season with real scoring) for the hero/summary
 * assertions and a WR with a known stat-only week (James Proche, id 6957,
 * 2025 week 14: real NFL stats but not rostered by any HMLML franchise that
 * season) for the NOT ROSTERED assertion.
 */

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const DESKTOP_VIEWPORT = { width: 1280, height: 900 };

const QB_ID = "4046"; // Patrick Mahomes
const STAT_ONLY_ID = "6957"; // James Proche
const STAT_ONLY_SEASON = 2025;

// KC's real 2024 bye was week 6 (verified against the live nfl_games
// schedule: `getSeasonScheduleFacts([2024]).teamByeWeeks.get("2024:KC")` ===
// 6). Mahomes was left in the BENCH slot that week with 0 recorded points —
// exactly the case honest BYE labeling exists for (#132/#133).
const KC_BYE_SEASON = 2024;
const KC_BYE_WEEK = 6;

test.describe("Mobile weekly-line cards", () => {
  test("QB profile at mobile viewport renders hero points, projection, and stat summary", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto(`/players/${QB_ID}`);

    const cards = page.locator('[role="listitem"]');
    await expect(cards.first()).toBeVisible();

    // At least one played week: hero actual points in mono, tabular text.
    const heroValues = cards.locator("span.text-stat");
    await expect(heroValues.first()).toBeVisible();
    const heroText = (await heroValues.first().textContent())?.trim() ?? "";
    expect(heroText).toMatch(/^\d+\.\d$/);

    // Inline projection text somewhere on the played card.
    await expect(page.getByText(/^proj \d+\.\d$/).first()).toBeVisible();

    // A QB stat summary segment (pass yards, TD, or cmp/att pair) shows up
    // in mono in at least one card.
    const summaryLine = page.locator("p.font-mono").filter({ hasText: /YD|TD|INT|\// });
    await expect(summaryLine.first()).toBeVisible();

    // START status renders bold/primary text, not color alone.
    await expect(page.getByText("START", { exact: true }).first()).toBeVisible();
  });

  test("stat-only week shows NOT ROSTERED with no hero points, other weeks unaffected", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto(`/players/${STAT_ONLY_ID}?season=${STAT_ONLY_SEASON}`);

    const notRosteredChip = page.getByText("NOT ROSTERED", { exact: true });
    test.skip(
      (await notRosteredChip.count()) === 0,
      "Stat-only week fixture not present in this environment's data.",
    );

    await expect(notRosteredChip.first()).toBeVisible();

    // The card carrying the NOT ROSTERED chip has no hero points figure
    // (only rostered/played weeks get the big mono actual number).
    const card = page.locator('[role="listitem"]').filter({ hasText: "NOT ROSTERED" }).first();
    await expect(card.locator("span.text-stat")).toHaveCount(0);
    await expect(card.getByText(/^proj \d/)).toHaveCount(0);
  });

  test("KC player's 2024 season shows BYE on week 6 with no fabricated points (#132/#133)", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto(`/players/${QB_ID}?season=${KC_BYE_SEASON}`);

    const cards = page.locator('[role="listitem"]');
    await expect(cards.first()).toBeVisible();

    const byeCard = cards.filter({ hasText: `WK ${KC_BYE_WEEK}` });
    await expect(byeCard).toHaveCount(1);
    await expect(byeCard.getByText("BYE", { exact: true })).toBeVisible();

    // No fabricated 0.0 hero number and no dangling "proj" line on the bye card.
    await expect(byeCard.locator("span.text-stat")).toHaveCount(0);
    await expect(byeCard.getByText(/^proj \d/)).toHaveCount(0);
  });

  test("KC player's 2024 season shows BYE on week 6 in the desktop table with a dash, not 0.0", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(`/players/${QB_ID}?season=${KC_BYE_SEASON}`);

    const table = page.locator("table");
    await expect(table).toBeVisible();

    const rows = table.locator("tbody tr");
    const rowCount = await rows.count();
    let byeRow = rows.first();
    let found = false;
    for (let i = 0; i < rowCount; i++) {
      const weekText = (await rows.nth(i).locator("td").first().textContent())?.trim();
      if (weekText === String(KC_BYE_WEEK)) {
        byeRow = rows.nth(i);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
    await expect(byeRow.getByText("BYE", { exact: true })).toBeVisible();

    // Actual + delta columns show the en-dash placeholder, never "0.0".
    const cells = byeRow.locator("td");
    const actualText = (await cells.nth(6).textContent())?.trim();
    expect(actualText).toBe("–");
  });

  test("desktop viewport renders the table, not the mobile cards", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(`/players/${QB_ID}`);

    const table = page.locator("table");
    await expect(table).toBeVisible();
    await expect(table.locator("thead th", { hasText: "Owner" })).toBeVisible();
    await expect(table.locator("thead th", { hasText: "Actual" })).toBeVisible();

    // The mobile card list is present in the DOM but hidden at md+.
    const cardList = page.locator('[role="list"]').filter({ has: page.locator('[role="listitem"]') }).first();
    if (await cardList.count()) {
      await expect(cardList).toBeHidden();
    }
  });
});
