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
      page.getByRole("heading", { level: 1, name: "The Book." }),
    ).toBeVisible();

    // Every board line renders a signed spread chip. Assert on the real
    // rendered prices rather than a container, so a board that rendered but
    // priced nothing would fail here.
    const spreadChips = page.locator("text=/^[+-]\\d+(\\.\\d)?$/");
    expect(await spreadChips.count()).toBeGreaterThan(0);

    // Read-only: nothing on the board is pressable for a visitor.
    await expect(page.locator('button[aria-label^="Pick "]')).toHaveCount(0);

    // And the slip says why.
    await expect(
      page.getByText("Claim your team to get a slip."),
    ).toBeVisible();
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
    await expect(page.getByText("Your pick ·")).toBeVisible();
    await expect(firstPick).toHaveAttribute("aria-pressed", "true");

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

    // Clicking the same side again clears it, in the UI and in the database.
    await firstPick.click();
    await expect(page.getByText("Your pick ·")).toHaveCount(0);

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
});
