import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { getSql } from "./helpers/sql";
import { membersTableExists, memberFixtureScope } from "./helpers/seed-members";

// ============================================================================
// The Book: Props.
//
// Drives the real stack (dev/prod server + the real Postgres behind
// POSTGRES_DRIVER=pg). Nothing is mocked: the pick is made by clicking the
// real button, it goes through the real server action, and the assertions
// check the actual book_prop_picks row that lands in the database.
//
// Skips (rather than fails) when the prerequisites are absent: migration 0014
// unapplied, or no props priced for the current week yet.
// ============================================================================

const fx = memberFixtureScope("bookprops");

let ready = false;
let seededMemberId: number | null = null;
let currentWeek: number | null = null;

async function bookPropsTableExists(): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`SELECT to_regclass('public.book_props') AS reg`) as {
    reg: string | null;
  }[];
  return rows[0]?.reg != null;
}

/** The week the props tab is trading, taken from the priced props themselves. */
async function pricedWeek(): Promise<number | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT "week", COUNT(*)::int AS n
    FROM "book_props"
    WHERE "season_id" = (SELECT "id" FROM "seasons" ORDER BY "season_year" DESC LIMIT 1)
    GROUP BY "week"
    ORDER BY "week"
    LIMIT 1`) as { week: number; n: number }[];
  return rows[0]?.week ?? null;
}

async function deleteScopedPicks(): Promise<void> {
  const sql = getSql();
  if (!(await bookPropsTableExists())) return;
  await sql`DELETE FROM "book_prop_picks" WHERE "member_id" IN
    (SELECT "id" FROM "members" WHERE "sleeper_user_id" LIKE ${"e2e-member-bookprops%"})`;
}

test.beforeAll(async () => {
  ready = (await membersTableExists()) && (await bookPropsTableExists());
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
  // book_prop_picks references members, so scoped picks go before the
  // fixture does.
  await deleteScopedPicks();
  await fx.cleanup();
});

test.beforeEach(async () => {
  test.skip(!ready, "book_props table or priced props not present");
});

// Serial: both tests drive the same member's slip against one shared props tab.
test.describe.configure({ mode: "serial" });

async function signIn(page: Page, code: string) {
  await page.goto("/claim");
  await page.fill("#code", code);
  await page.getByRole("button", { name: /claim my team/i }).click();
  await expect(page.locator('a[aria-label*="manage your team"]').first()).toBeVisible();
}

async function openPropsTab(page: Page) {
  await page.goto("/book");
  await page.getByRole("tab", { name: "Props" }).click();
  // Both tab panes render in the DOM at all times (only `hidden` toggles),
  // so any bare selector for "Pick " buttons would also match the Board
  // tab's hidden pick buttons. Scope everything to the props pane itself.
  return page.locator("#book-pane-props");
}

test.describe("Props, signed out", () => {
  test("renders real priced props and offers no controls", async ({ page }) => {
    const pane = await openPropsTab(page);

    // Every priced prop renders its question and a mono line. Assert on the
    // real rendered content rather than a container, so a tab that rendered
    // but priced nothing would fail here.
    await expect(page.getByText("Combined points, all 12 teams")).toBeVisible();

    // Read-only: nothing on the props tab is pressable for a visitor.
    await expect(pane.locator('button[aria-label^="Pick "]')).toHaveCount(0);
  });
});

test.describe("Props, signed in", () => {
  test("books a prop pick, snapshots the odds, and un-books it on a second click", async ({
    page,
  }) => {
    const sql = getSql();
    await signIn(page, fx.memberClaimCode);

    const pane = await openPropsTab(page);

    const firstPick = pane.locator('button[aria-label^="Pick "]').first();
    await expect(firstPick).toBeVisible();

    await firstPick.click();
    await expect(firstPick).toHaveAttribute("aria-pressed", "true");

    // ...and the row is really in Postgres, with the odds snapshotted onto it.
    await expect
      .poll(
        async () => {
          const rows = (await sql`
            SELECT pk."side", pk."odds_at_pick", pk."prop_id",
                   p."over_odds", p."under_odds"
            FROM "book_prop_picks" pk
            JOIN "book_props" p ON p."id" = pk."prop_id"
            WHERE pk."member_id" = ${seededMemberId}`) as {
            side: string;
            odds_at_pick: number;
            prop_id: number;
            over_odds: number;
            under_odds: number;
          }[];
          if (rows.length !== 1) return "no row";
          const row = rows[0];
          const expectedOdds = row.side === "over" ? row.over_odds : row.under_odds;
          if (row.odds_at_pick !== expectedOdds) return "odds not snapshotted";
          return "booked";
        },
        { timeout: 15000 },
      )
      .toBe("booked");

    // Clicking the same side again clears it, in the UI and in the database.
    await firstPick.click();
    await expect(firstPick).toHaveAttribute("aria-pressed", "false");

    await expect
      .poll(
        async () => {
          const rows = (await sql`
            SELECT COUNT(*)::int AS n FROM "book_prop_picks"
            WHERE "member_id" = ${seededMemberId}`) as { n: number }[];
          return rows[0]?.n ?? -1;
        },
        { timeout: 15000 },
      )
      .toBe(0);
  });
});
