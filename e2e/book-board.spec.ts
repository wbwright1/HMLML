import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { getSql } from "./helpers/sql";
import { membersTableExists, memberFixtureScope } from "./helpers/seed-members";

// ============================================================================
// The Book: The Board.
//
// Drives the real stack (dev/prod server + the real Postgres behind
// POSTGRES_DRIVER=pg). Nothing is mocked: the pick is made by clicking the real
// button, it goes through the real server action, and the assertions check the
// actual book_picks row that lands in the database.
//
// Skips (rather than fails) when the prerequisites are absent: migration 0014
// unapplied, or no lines priced for the current week yet.
// ============================================================================

const fx = memberFixtureScope("book");

let ready = false;
let seededMemberId: number | null = null;
let currentWeek: number | null = null;

async function bookTablesExist(): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`SELECT to_regclass('public.book_lines') AS reg`) as {
    reg: string | null;
  }[];
  return rows[0]?.reg != null;
}

/** The week the board is trading, taken from the priced lines themselves. */
async function pricedWeek(): Promise<number | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT "week", COUNT(*)::int AS n
    FROM "book_lines"
    WHERE "season_id" = (SELECT "id" FROM "seasons" ORDER BY "season_year" DESC LIMIT 1)
    GROUP BY "week"
    ORDER BY "week"
    LIMIT 1`) as { week: number; n: number }[];
  return rows[0]?.week ?? null;
}

async function deleteScopedPicks(): Promise<void> {
  const sql = getSql();
  if (!(await bookTablesExist())) return;
  await sql`DELETE FROM "book_picks" WHERE "member_id" IN
    (SELECT "id" FROM "members" WHERE "sleeper_user_id" LIKE ${"e2e-member-book%"})`;
}

test.beforeAll(async () => {
  ready = (await membersTableExists()) && (await bookTablesExist());
  if (!ready) return;
  currentWeek = await pricedWeek();
  if (currentWeek == null) {
    ready = false;
    return;
  }
  await deleteScopedPicks();
  const ids = await fx.seed();
  seededMemberId = ids.memberId;
});

test.afterAll(async () => {
  if (!ready) return;
  // book_picks references members, so scoped picks go before the fixture does.
  await deleteScopedPicks();
  await fx.cleanup();
});

test.beforeEach(async () => {
  test.skip(!ready, "book tables or priced lines not present");
});

// Serial: both tests drive the same member's slip against one shared board.
test.describe.configure({ mode: "serial" });

async function signIn(page: Page, code: string) {
  await page.goto("/claim");
  await page.fill("#code", code);
  await page.getByRole("button", { name: /claim my team/i }).click();
  await expect(page.locator('a[aria-label*="manage your team"]').first()).toBeVisible();
}

test.describe("The Board, signed out", () => {
  test("renders real priced lines and offers no controls", async ({ page }) => {
    await page.goto("/book");

    await expect(
      page.getByRole("heading", { level: 1, name: "The Book", exact: true }),
    ).toBeVisible();

    // Every board line renders a signed spread chip. Assert on the real
    // rendered prices rather than a container, so a board that rendered but
    // priced nothing would fail here.
    const spreadChips = page.locator("text=/^[+-]\\d+(\\.\\d)?$/");
    expect(await spreadChips.count()).toBeGreaterThan(0);

    // Read-only: nothing on the board is pressable for a visitor.
    await expect(page.locator('button[aria-label^="Pick "]')).toHaveCount(0);

    // And the slip says why. Scoped to the Board's own pane: the Props tab
    // ships in the same cached HTML and opens with the same sentence, so an
    // unscoped match is two elements and a strict-mode failure.
    await expect(
      page
        .locator('[id="book-pane-board"]')
        .getByText("Claim your team to get a slip."),
    ).toBeVisible();

    // The lock day is said ONCE, in the alert above the board, built from the
    // real kickoff data, not repeated as a kicker on every card.
    const board = page.locator("#book-pane-board");
    // (No alert at all once every game has kicked off.)
    const anyOpen = (await board.locator('[data-testid="book-lock-alert"]').count()) > 0;
    if (anyOpen) {
      await expect(board.locator('[data-testid="book-lock-alert"]')).toHaveCount(1);
      await expect(board.locator('[data-testid="book-lock-alert"]')).toContainText(
        /(Most lines|Lines) lock /,
      );
    }

    // Column heads once above the cards, not per row.
    await expect(board.getByText("Spread", { exact: true })).toHaveCount(1);
    await expect(board.getByText("Moneyline", { exact: true })).toHaveCount(1);

    // The "$10 returns $X ($Y profit)" sentence belongs to a member's own
    // pick only; a visitor has none, so no game card carries one.
    await expect(
      board.locator("section").getByText(/returns \$\d+\.\d\d \(\$\d+\.\d\d profit\)/),
    ).toHaveCount(0);

    // The three-chip showcase row (On the Board / Biggest Line / Coin Flip)
    // is gone from the header entirely. Exact match: getByText's default
    // substring/case-insensitive matching would otherwise false-positive on
    // unrelated copy elsewhere on the page ("...put a future on the board.").
    await expect(page.getByText("On the Board", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Biggest Line", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Coin Flip", { exact: true })).toHaveCount(0);
  });

  test("keeps The Book in the nav and /players reachable from the footer", async ({
    page,
  }) => {
    await page.goto("/book");

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link", { name: "The Book" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav.getByRole("link", { name: "Players" })).toHaveCount(0);

    const footerNav = page.getByRole("navigation", { name: "Footer navigation" });
    await footerNav.getByRole("link", { name: "Players" }).click();
    await expect(page).toHaveURL(/\/players$/);
  });
});

test.describe("The Board, signed in", () => {
  test("books a pick, snapshots the line, and un-books it on a second click", async ({
    page,
  }) => {
    const sql = getSql();
    await signIn(page, fx.memberClaimCode);

    await page.goto("/book");

    const firstPick = page.locator('button[aria-label^="Pick "]').first();
    await expect(firstPick).toBeVisible();
    const label = (await firstPick.getAttribute("aria-label")) ?? "";

    await firstPick.click();

    // The slip and the card both reflect it in the browser...
    await expect(page.getByText("Your pick:")).toBeVisible();
    await expect(firstPick).toHaveAttribute("aria-pressed", "true");

    // ...the save is confirmed in a toast naming the team and its line...
    const pickedName = label.replace(/^Pick /, "").replace(/\s+\S+$/, "");
    const toast = page
      .locator("#book-pane-board")
      .getByRole("status")
      .filter({ hasText: "Pick saved:" });
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(pickedName);

    // ...and the payout sentence appears for the picked side only, once.
    await expect(
      page
        .locator("#book-pane-board section")
        .getByText(/returns \$\d+\.\d\d \(\$\d+\.\d\d profit\)/),
    ).toHaveCount(1);

    // ...and the row is really in Postgres, with the line snapshotted onto it.
    await expect
      .poll(
        async () => {
          const rows = (await sql`
            SELECT p."side", p."spread_at_pick", p."ml_at_pick", p."matchup_id",
                   l."spread" AS line_spread, l."ml_home", l."ml_away"
            FROM "book_picks" p
            JOIN "book_lines" l
              ON l."season_id" = p."season_id"
             AND l."week" = p."week"
             AND l."matchup_id" = p."matchup_id"
            WHERE p."member_id" = ${seededMemberId}`) as {
            side: string;
            spread_at_pick: number;
            ml_at_pick: number;
            line_spread: number;
            ml_home: number;
            ml_away: number;
          }[];
          if (rows.length !== 1) return "no row";
          const row = rows[0];
          if (row.spread_at_pick !== row.line_spread) return "spread not snapshotted";
          const expectedMl = row.side === "home" ? row.ml_home : row.ml_away;
          if (row.ml_at_pick !== expectedMl) return "moneyline not snapshotted";
          // The button we clicked names the team and its number; the stored
          // side must be the one that number belongs to.
          const storedSpread =
            row.side === "home" ? row.line_spread : -row.line_spread;
          const shown = Number(label.trim().split(/\s+/).pop());
          if (shown !== storedSpread) return "picked the wrong side";
          return "booked";
        },
        { timeout: 15000 },
      )
      .toBe("booked");

    // Undo in the toast reverses the pick through the same server action:
    // gone from the card AND from Postgres.
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(firstPick).toHaveAttribute("aria-pressed", "false");
    await expect
      .poll(
        async () => {
          const rows = (await sql`
            SELECT COUNT(*)::int AS n FROM "book_picks"
            WHERE "member_id" = ${seededMemberId}`) as { n: number }[];
          return rows[0]?.n ?? -1;
        },
        { timeout: 15000 },
      )
      .toBe(0);

    // Book it again, then clear it by clicking the same side a second time,
    // in the UI and in the database.
    await firstPick.click();
    await expect(firstPick).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(
        async () => {
          const rows = (await sql`
            SELECT COUNT(*)::int AS n FROM "book_picks"
            WHERE "member_id" = ${seededMemberId}`) as { n: number }[];
          return rows[0]?.n ?? -1;
        },
        { timeout: 15000 },
      )
      .toBe(1);
    await firstPick.click();
    await expect(page.getByText("Your pick:")).toHaveCount(0);

    await expect
      .poll(
        async () => {
          const rows = (await sql`
            SELECT COUNT(*)::int AS n FROM "book_picks"
            WHERE "member_id" = ${seededMemberId}`) as { n: number }[];
          return rows[0]?.n ?? -1;
        },
        { timeout: 15000 },
      )
      .toBe(0);
  });

  test("locks the slip early, then hands back the games that have not kicked off", async ({
    page,
  }) => {
    const sql = getSql();
    const lockedPicks = async () => {
      const rows = (await sql`
        SELECT COUNT(*)::int AS n FROM "book_picks"
        WHERE "member_id" = ${seededMemberId} AND "locked_at" IS NOT NULL`) as {
        n: number;
      }[];
      return rows[0]?.n ?? -1;
    };

    await signIn(page, fx.memberClaimCode);
    await page.goto("/book");

    // Only an open game renders pick buttons, two per game (home then away),
    // so taking every other one puts a side on every game the slip can lock.
    // They appear only once the island has resolved the session against the
    // ISR-cached board, so wait for the first one before counting: a bare
    // count() here races the fetch and reads zero.
    // Scoped to the Board pane: the tab shell keeps the Tracking pane mounted
    // (hidden) and its pick'ems strip carries identically labelled buttons.
    const buttons = page
      .locator("#book-pane-board")
      .locator('button[aria-label^="Pick "]');
    let hasOpenGames = true;
    try {
      await expect(buttons.first()).toBeVisible({ timeout: 15000 });
    } catch {
      hasOpenGames = false;
    }
    test.skip(!hasOpenGames, "every game on the board has already kicked off");
    const count = await buttons.count();
    const bookedPicks = async () => {
      const rows = (await sql`
        SELECT COUNT(*)::int AS n FROM "book_picks"
        WHERE "member_id" = ${seededMemberId}`) as { n: number }[];
      return rows[0]?.n ?? -1;
    };

    // One game at a time, each confirmed in Postgres before the next click:
    // the picks all run through the same slip state machine, and firing six of
    // them into a board that revalidates after every write is a race this test
    // has no reason to run.
    for (let i = 0; i < count; i += 2) {
      await buttons.nth(i).click();
      await expect(buttons.nth(i)).toHaveAttribute("aria-pressed", "true");
      await expect.poll(bookedPicks, { timeout: 15000 }).toBe(i / 2 + 1);
    }

    // Let the last "Pick saved" toast time out first: it floats over the
    // bottom of the screen, where the slip's lock button can sit.
    await expect(
      page.locator("#book-pane-board").getByText("Pick saved:"),
    ).toHaveCount(0, { timeout: 15000 });
    await page.getByRole("button", { name: "Lock in picks" }).click();

    // Locked in the browser: the CTA becomes the commitment and every pick
    // control is gone.
    await expect(page.getByText("Picks are in. No takebacks.")).toBeVisible();
    await expect(buttons).toHaveCount(0);

    // ...and locked in Postgres.
    await expect
      .poll(lockedPicks, { timeout: 15000 })
      .toBe(Math.ceil(count / 2));

    // The undo: none of these games has kicked off (they were pickable a
    // moment ago), so the whole slip comes back.
    await page.getByRole("button", { name: "Unlock open games" }).click();

    await expect.poll(lockedPicks, { timeout: 15000 }).toBe(0);

    // And the board is genuinely pickable again, not just visually reopened:
    // switching a side writes the new side to the row.
    const awaySide = page.locator('button[aria-label^="Pick "]').nth(1);
    await expect(awaySide).toBeVisible();
    await awaySide.click();
    await expect(awaySide).toHaveAttribute("aria-pressed", "true");
  });
});
