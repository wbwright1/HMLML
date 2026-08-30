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

  test("renders the expanded slate in sections, with a subject on every card", async ({
    page,
  }) => {
    const pane = await openPropsTab(page);
    const cards = pane.locator('[data-testid="prop-card"]');
    const count = await cards.count();

    // A full slate is 8 to 15 rows. A thin week (no projections yet) prices
    // fewer by design, so this skips rather than failing.
    test.skip(count < 8, `only ${count} props priced this week`);

    // The cap governs NEW additions, not the board: a slate that already
    // carries more than the cap keeps every posted row rather than dropping
    // one members can see. So this asserts the board is sane, not capped.
    expect(count).toBeLessThanOrEqual(20);

    // The sections the expanded slate posts, asserted as real headings.
    await expect(pane.getByRole("heading", { name: "House Specials" })).toBeVisible();
    await expect(pane.getByRole("heading", { name: "Player Props" })).toBeVisible();
    await expect(pane.getByRole("heading", { name: "Team Totals" })).toBeVisible();

    // The new kinds are really on the board, not just the original three.
    await expect(pane.locator('[data-prop-kind="player_points"]').first()).toBeVisible();
    await expect(pane.locator('[data-prop-kind="team_total"]').first()).toBeVisible();

    // Player props carry a face and a name, which is the whole point of the
    // rebuild: the card must say who it is about without being read.
    const playerCard = pane.locator('[data-prop-kind="player_points"]').first();
    await expect(playerCard.locator("img, [role=img]").first()).toBeVisible();

    // The marquee card is the League Total and it renders its line.
    const marquee = pane.locator('[data-prop-kind="league_total"]');
    await expect(marquee).toHaveCount(1);
    await expect(marquee).toContainText("O/U");
  });

  test("graded props show what actually happened, in words not colour", async ({
    page,
  }) => {
    const pane = await openPropsTab(page);
    const graded = pane.locator('[data-prop-graded="true"]');
    const count = await graded.count();
    test.skip(count === 0, "no graded props on this week's board");

    const first = graded.first();
    // The stored actual value is finally on the card. Asserted on the element
    // the card renders it into, not on the wording, so the copy can change
    // without the test going quietly green against a missing number.
    const actual = first.locator('[data-testid="prop-actual"]');
    await expect(actual).toBeVisible();
    expect((await actual.innerText()).trim().length).toBeGreaterThan(0);
    // ...and the outcome reads as a word, so it survives greyscale.
    await expect(first).toContainText(/Hit|Missed|Graded|Push/);
  });

  test("mobile stays a single column with no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const pane = await openPropsTab(page);
    const cards = pane.locator('[data-testid="prop-card"]');
    test.skip((await cards.count()) < 2, "not enough props to compare layout");

    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    // Stacked, not side by side.
    expect(second!.y).toBeGreaterThan(first!.y);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
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

  test("books a PLAYER prop, one of the new kinds, through the same action", async ({
    page,
  }) => {
    const sql = getSql();
    await signIn(page, fx.memberClaimCode);

    const pane = await openPropsTab(page);
    const playerCard = pane.locator('[data-prop-kind="player_points"]').first();
    test.skip(
      (await pane.locator('[data-prop-kind="player_points"]').count()) === 0,
      "no player props priced this week",
    );

    const over = playerCard.locator('button[aria-label^="Pick "]').first();
    await over.click();
    await expect(over).toHaveAttribute("aria-pressed", "true");
    // The picked state is spelled out, not just tinted gold.
    await expect(playerCard).toContainText("Picked");

    // The row really lands in Postgres, on a prop of the NEW kind, proving the
    // untouched server action carries the expanded slate.
    await expect
      .poll(
        async () => {
          const rows = (await sql`
            SELECT p."kind", pk."side"
            FROM "book_prop_picks" pk
            JOIN "book_props" p ON p."id" = pk."prop_id"
            WHERE pk."member_id" = ${seededMemberId}`) as {
            kind: string;
            side: string;
          }[];
          if (rows.length !== 1) return `rows: ${rows.length}`;
          return rows[0].kind;
        },
        { timeout: 15000 },
      )
      .toBe("player_points");

    await over.click();
    await expect(over).toHaveAttribute("aria-pressed", "false");
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
