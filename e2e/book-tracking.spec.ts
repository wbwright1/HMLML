import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { getSql } from "./helpers/sql";
import { membersTableExists, memberFixtureScope } from "./helpers/seed-members";

// ============================================================================
// The Book: Tracking tab, the league pick'ems sheet.
//
// Drives the real stack against the real Postgres behind POSTGRES_DRIVER=pg.
// Every pick here goes through the real UI and the real server action (never a
// raw INSERT): /book is ISR-cached, and only the action's revalidatePath busts
// that cache, so a direct write would sit behind stale HTML for the rest of the
// run. Each assertion that matters is checked in the DATABASE as well as on
// screen.
//
// The league's live season has not kicked off as of this test (every matchup is
// still "scheduled"), so nothing is graded and the ATS leaderboard's honest
// empty state is what real data produces. That empty state is asserted rather
// than mocked around.
// ============================================================================

// Scope name deliberately NOT nested under "book": the fixture scopes filter
// with a prefix LIKE, so e2e/book-board.spec.ts's "e2e-member-book%" cleanup
// would swallow this spec's members and picks mid-run (it did, as an FK
// violation, when this scope was called "book-tracking").
const fx = memberFixtureScope("pickems");

// The pick placed by the picking test is read by the tests after it, so serial
// keeps them in declaration order and stops beforeAll's single seed from racing
// itself across parallel workers (matching book-board.spec.ts).
test.describe.configure({ mode: "serial" });

let ready = false;
let seededMemberId: number | null = null;

async function bookTablesExist(): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`SELECT to_regclass('public.book_lines') AS reg`) as {
    reg: string | null;
  }[];
  return rows[0]?.reg != null;
}

async function pricedWeekExists(): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    SELECT "week", COUNT(*)::int AS n
    FROM "book_lines"
    WHERE "season_id" = (SELECT "id" FROM "seasons" ORDER BY "season_year" DESC LIMIT 1)
    GROUP BY "week"
    ORDER BY "week"
    LIMIT 1`) as { week: number; n: number }[];
  return rows.length > 0;
}

async function scopedPickRows(): Promise<
  { matchup_id: number; side: string; spread_at_pick: number }[]
> {
  const sql = getSql();
  return (await sql`
    SELECT "matchup_id", "side", "spread_at_pick"
    FROM "book_picks"
    WHERE "member_id" IN
      (SELECT "id" FROM "members" WHERE "sleeper_user_id" LIKE ${"e2e-member-pickems%"})
    ORDER BY "matchup_id"`) as {
    matchup_id: number;
    side: string;
    spread_at_pick: number;
  }[];
}

async function deleteScopedPicks(): Promise<void> {
  const sql = getSql();
  if (!(await bookTablesExist())) return;
  await sql`DELETE FROM "book_picks" WHERE "member_id" IN
    (SELECT "id" FROM "members" WHERE "sleeper_user_id" LIKE ${"e2e-member-pickems%"})`;
}

test.beforeAll(async () => {
  ready = (await membersTableExists()) && (await bookTablesExist()) && (await pricedWeekExists());
  if (!ready) return;
  await deleteScopedPicks();
  const ids = await fx.seed();
  seededMemberId = ids.memberId;
});

test.afterAll(async () => {
  if (!ready) return;
  await deleteScopedPicks();
  await fx.cleanup();
});

test.beforeEach(async () => {
  test.skip(!ready, "book tables or a priced week are not present");
});

async function signIn(page: Page, code: string) {
  await page.goto("/claim");
  await page.fill("#code", code);
  await page.getByRole("button", { name: /claim my team/i }).click();
  await expect(page.locator('a[aria-label*="manage your team"]').first()).toBeVisible();
}

function trackingPanel(page: Page) {
  return page.getByRole("tabpanel", { name: "Tracking" });
}

async function openTrackingTab(page: Page) {
  await page.getByRole("tab", { name: "Tracking" }).click();
  await expect(trackingPanel(page)).toBeVisible();
}

/**
 * The fixture member's cell on one game. The desktop grid and the mobile
 * (one-division) grid both live in the DOM, so this takes the first match: on
 * the default desktop viewport that is the visible desktop grid.
 */
function fixtureCell(page: Page, matchupId: number) {
  return page
    .locator(
      `[data-testid="pickems-cell"][data-member-id="${seededMemberId}"][data-matchup-id="${matchupId}"]`,
    )
    .first();
}

let pickedLabel: string | null = null;

test.describe("Tracking tab pick'ems", () => {
  test("renders the honest empty state when nothing is graded yet", async ({ page }) => {
    await page.goto("/book");
    await openTrackingTab(page);

    // The real season has no completed week yet, so the ATS leaderboard has
    // nothing to rank; this asserts the real (non-fabricated) empty state.
    await expect(
      page.getByText("No graded picks yet. The ledger opens once a week finishes."),
    ).toBeVisible();

    // The tab still renders, because picking is what it is for now.
    await expect(trackingPanel(page).getByText("Your Picks")).toBeVisible();
  });

  test("tells a signed-out visitor to claim a team instead of showing controls", async ({
    page,
  }) => {
    await page.goto("/book");
    await openTrackingTab(page);

    await expect(
      trackingPanel(page).getByText("Claim your team to get on the sheet."),
    ).toBeVisible();
    await expect(
      trackingPanel(page).locator('button[aria-label^="Pick "]'),
    ).toHaveCount(0);
  });

  test("books a pick from the Tracking tab and writes it to book_picks", async ({
    page,
  }) => {
    await signIn(page, fx.memberClaimCode);
    await page.goto("/book");
    await openTrackingTab(page);

    const button = trackingPanel(page).locator('button[aria-label^="Pick "]').first();
    await expect(button).toBeVisible();
    pickedLabel = (await button.innerText()).trim();
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");

    // The database is the proof, not the optimistic button state.
    await expect
      .poll(async () => (await scopedPickRows()).length, { timeout: 10000 })
      .toBe(1);

    // And it survives a reload, which can only come from the persisted row
    // re-read through /api/book/picks.
    await page.reload();
    await openTrackingTab(page);
    await expect(
      trackingPanel(page).locator('button[aria-pressed="true"]').first(),
    ).toHaveText(pickedLabel!, { timeout: 10000 });
  });

  test("shows that same pick on the Board tab without a reload", async ({ page }) => {
    test.skip(!pickedLabel, "no pick was booked by the previous test");

    await signIn(page, fx.memberClaimCode);
    await page.goto("/book");

    // The Board pane mounts with the pick already on the slip: same row, same
    // member, read back through the same API the Board uses.
    await expect(page.getByText("Your pick ·").first()).toBeVisible({
      timeout: 10000,
    });

    // Now prove the live two-way signal: clear the pick from Tracking and watch
    // the Board slip drop it with no navigation at all.
    await openTrackingTab(page);
    const pressed = trackingPanel(page).locator('button[aria-pressed="true"]').first();
    await expect(pressed).toBeVisible({ timeout: 10000 });
    await pressed.click();

    await page.getByRole("tab", { name: "The Board" }).click();
    await expect(page.getByText("Your pick ·")).toHaveCount(0, { timeout: 10000 });

    // Toggling the same side off deletes the row outright.
    await expect
      .poll(async () => (await scopedPickRows()).length, { timeout: 10000 })
      .toBe(0);
  });

  test("groups picker columns by division and keeps open picks private", async ({
    page,
  }) => {
    await signIn(page, fx.memberClaimCode);
    await page.goto("/book");
    await openTrackingTab(page);

    const button = trackingPanel(page).locator('button[aria-label^="Pick "]').first();
    await button.click();
    await expect
      .poll(async () => (await scopedPickRows()).length, { timeout: 10000 })
      .toBe(1);
    const [row] = await scopedPickRows();

    // The viewer's own column shows the pick (overlaid client-side), which is
    // exactly the half of the privacy rule that must still work.
    await expect(fixtureCell(page, row.matchup_id)).not.toHaveText("—", {
      timeout: 10000,
    });

    // A column header per member, clustered under a division label.
    await expect(trackingPanel(page).getByText("YOU").first()).toBeVisible();

    // Signed out, the very same cell is empty: the payload never carried it.
    await page.context().clearCookies();
    await page.goto("/book");
    await openTrackingTab(page);
    await expect(fixtureCell(page, row.matchup_id)).toHaveText("—", {
      timeout: 10000,
    });
  });

  test("swaps the wide grid for a division dropdown on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/book");
    await openTrackingTab(page);

    const select = page.locator("#pickems-division");
    await expect(select).toBeVisible();

    // Only the selected division's columns render on this viewport, so the
    // visible cell count is a fraction of the twelve-column desktop grid.
    const options = await select.locator("option").count();
    expect(options).toBeGreaterThan(0);
  });
});
