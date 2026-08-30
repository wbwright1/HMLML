import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { getSql } from "./helpers/sql";
import { membersTableExists, memberFixtureScope } from "./helpers/seed-members";

// ============================================================================
// The Book: Futures.
//
// Drives the real stack (dev/prod server + the real Postgres behind
// POSTGRES_DRIVER=pg). Nothing is mocked: the pick is made by clicking the real
// row, it goes through the real server action, and the assertions check the
// actual book_future_picks row that lands in the database, including that the
// odds were snapshotted off the priced board.
//
// Skips (rather than fails) when the prerequisites are absent: migration 0015
// unapplied, or no futures priced for the current season yet.
// ============================================================================

const fx = memberFixtureScope("futures");

let ready = false;
let seededMemberId: number | null = null;

async function futuresTablesExist(): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`SELECT to_regclass('public.book_futures') AS reg`) as {
    reg: string | null;
  }[];
  return rows[0]?.reg != null;
}

/** An OPEN market with at least one priced row, or null when the book is shut. */
async function openMarket(): Promise<string | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT "market"
    FROM "book_futures"
    WHERE "season_id" = (SELECT "id" FROM "seasons" ORDER BY "season_year" DESC LIMIT 1)
      AND "locked_at" IS NULL
    GROUP BY "market"
    ORDER BY "market"
    LIMIT 1`) as { market: string }[];
  return rows[0]?.market ?? null;
}

async function deleteScopedPicks(): Promise<void> {
  const sql = getSql();
  if (!(await futuresTablesExist())) return;
  await sql`DELETE FROM "book_future_picks" WHERE "member_id" IN
    (SELECT "id" FROM "members" WHERE "sleeper_user_id" LIKE ${"e2e-member-futures%"})`;
}

test.beforeAll(async () => {
  ready = (await membersTableExists()) && (await futuresTablesExist());
  if (!ready) return;
  if ((await openMarket()) == null) {
    ready = false;
    return;
  }
  await deleteScopedPicks();
  const ids = await fx.seed();
  seededMemberId = ids.memberId;
});

test.afterAll(async () => {
  if (!ready) return;
  // book_future_picks references members, so the picks go before the fixture.
  await deleteScopedPicks();
  await fx.cleanup();
});

test.beforeEach(async () => {
  test.skip(!ready, "book_futures table or priced futures not present");
});

// Serial: both tests drive the same member against one shared board.
test.describe.configure({ mode: "serial" });

async function signIn(page: Page, code: string) {
  await page.goto("/claim");
  await page.fill("#code", code);
  await page.getByRole("button", { name: /claim my team/i }).click();
  await expect(page.locator('a[aria-label*="manage your team"]').first()).toBeVisible();
}

/** Opens /book and switches to the Futures pane. */
async function openFutures(page: Page) {
  await page.goto("/book");
  await page.getByRole("tab", { name: "Futures" }).click();
  const pane = page.locator("#book-pane-futures");
  await expect(pane).toBeVisible();
  return pane;
}

test.describe("Futures, signed out", () => {
  test("renders priced season-long markets and offers no controls", async ({
    page,
  }) => {
    const pane = await openFutures(page);

    // Real American odds, on real rows. Asserting on the prices rather than a
    // container means a board that rendered but priced nothing fails here.
    const odds = pane.locator("text=/^[+-]\\d+$/");
    expect(await odds.count()).toBeGreaterThan(0);

    // The grading rule is printed, because a market nobody can check is not a
    // market.
    await expect(pane.getByText(/Disputes go to the commish/).first()).toBeVisible();

    // Read-only: nothing here is pressable for a visitor.
    await expect(pane.locator('button[aria-label^="Pick "]')).toHaveCount(0);
    await expect(
      pane.getByText("Claim your team to put a future on the board."),
    ).toBeVisible();
  });
});

test.describe("Futures, signed in", () => {
  test("books one future, snapshots the odds, and clears it on a second click", async ({
    page,
  }) => {
    const sql = getSql();
    await signIn(page, fx.memberClaimCode);

    const pane = await openFutures(page);

    const firstPick = pane.locator('button[aria-label^="Pick "]').first();
    await expect(firstPick).toBeVisible();

    await firstPick.click();
    await expect(firstPick).toHaveAttribute("aria-pressed", "true");

    // The row is really in Postgres, holding the price that was on the board.
    await expect
      .poll(
        async () => {
          const rows = (await sql`
            SELECT p."market", p."subject_id", p."odds_at_pick", f."odds" AS board_odds
            FROM "book_future_picks" p
            JOIN "book_futures" f
              ON f."season_id" = p."season_id"
             AND f."market" = p."market"
             AND f."subject_id" = p."subject_id"
            WHERE p."member_id" = ${seededMemberId}`) as {
            market: string;
            subject_id: string;
            odds_at_pick: number;
            board_odds: number;
          }[];
          if (rows.length !== 1) return "no row";
          if (rows[0].odds_at_pick !== rows[0].board_odds) {
            return "odds not snapshotted";
          }
          return "booked";
        },
        { timeout: 15000 },
      )
      .toBe("booked");

    // Clicking the same subject again clears it, in the UI and in the database.
    await firstPick.click();
    await expect(firstPick).toHaveAttribute("aria-pressed", "false");

    await expect
      .poll(
        async () => {
          const rows = (await sql`
            SELECT COUNT(*)::int AS n FROM "book_future_picks"
            WHERE "member_id" = ${seededMemberId}`) as { n: number }[];
          return rows[0]?.n ?? -1;
        },
        { timeout: 15000 },
      )
      .toBe(0);
  });

  test("holds one pick per market: a repick replaces it", async ({ page }) => {
    const sql = getSql();
    await signIn(page, fx.memberClaimCode);

    const pane = await openFutures(page);
    const picks = pane.locator('button[aria-label^="Pick "]');
    const count = await picks.count();
    test.skip(count < 2, "need two rows in one market to repick");

    // Two rows inside the SAME market card, so the second click is a repick
    // rather than a second market.
    const card = pane.locator("div.card-surface").filter({
      has: page.locator('button[aria-label^="Pick "]'),
    }).first();
    const rows = card.locator('button[aria-label^="Pick "]');
    await rows.nth(0).click();
    await expect(rows.nth(0)).toHaveAttribute("aria-pressed", "true");
    await rows.nth(1).click();
    await expect(rows.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(rows.nth(0)).toHaveAttribute("aria-pressed", "false");

    await expect
      .poll(
        async () => {
          const found = (await sql`
            SELECT COUNT(*)::int AS n FROM "book_future_picks"
            WHERE "member_id" = ${seededMemberId}`) as { n: number }[];
          return found[0]?.n ?? -1;
        },
        { timeout: 15000 },
      )
      .toBe(1);
  });
});
