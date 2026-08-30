import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { getSql } from "./helpers/sql";
import { membersTableExists, memberFixtureScope } from "./helpers/seed-members";

// ============================================================================
// The Book: Tracking tab.
//
// Drives the real stack against the real Postgres behind POSTGRES_DRIVER=pg.
// The league's live season has not kicked off yet as of this test (every
// matchup is still "scheduled"), so there is no graded pick anywhere in the
// database to build an ATS leaderboard from; the leaderboard's honest empty
// state is exactly what real data produces right now, and that empty state is
// what the first test proves against the real DB rather than a mock.
//
// What CAN be exercised against real data today is the Who Picked Whom grid's
// privacy rule (the one behavior this tab adds beyond "render some rows"): an
// open game's pick is invisible to everyone except its own owner, who sees it
// via the client-side /api/book/picks overlay. The pick is placed through the
// real Board UI (the server action, exactly like e2e/book-board.spec.ts),
// never inserted directly: /book is ISR-cached, and only the server action's
// revalidatePath("/book") busts that cache, so a raw SQL insert would sit
// behind stale HTML for the rest of the run.
// ============================================================================

const fx = memberFixtureScope("book-tracking");

// The pick placed in "books a pick..." is read by the later privacy test, so
// serial keeps them in declaration order and stops beforeAll's single seed
// from racing itself across parallel workers (matching book-board.spec.ts).
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

async function deleteScopedPicks(): Promise<void> {
  const sql = getSql();
  if (!(await bookTablesExist())) return;
  await sql`DELETE FROM "book_picks" WHERE "member_id" IN
    (SELECT "id" FROM "members" WHERE "sleeper_user_id" LIKE ${"e2e-member-book-tracking%"})`;
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

async function openTrackingTab(page: Page) {
  await page.getByRole("tab", { name: "Tracking" }).click();
  await expect(page.getByRole("tabpanel", { name: "Tracking" })).toBeVisible();
}

/** The Who Picked Whom section, scoped so row lookups can't match the leaderboard. */
function whoPickedWhomSection(page: Page) {
  return page.locator("section").filter({ hasText: "Who Picked Whom" });
}

let pickedTeamAbbreviation: string | null = null;

test.describe("Tracking tab", () => {
  test("renders the honest empty state when nothing is graded yet", async ({ page }) => {
    await page.goto("/book");
    await openTrackingTab(page);

    // The real season has no completed week yet, so the ATS leaderboard has
    // nothing to rank; this asserts the real (non-fabricated) empty state,
    // not a stubbed one.
    await expect(
      page.getByText("No graded picks yet. The ledger opens once a week finishes."),
    ).toBeVisible();
  });

  test("books a pick and sees it on the Tracking tab via the session overlay", async ({
    page,
  }) => {
    await signIn(page, fx.memberClaimCode);
    await page.goto("/book");

    const firstPick = page.locator('button[aria-label^="Pick "]').first();
    await expect(firstPick).toBeVisible();
    await firstPick.click();
    await expect(page.getByText("Your pick ·")).toBeVisible();

    // The Pick Slip renders "{abbreviation} {spread}" for a booked row (see
    // components/book/board-island.tsx's SlipRow); the Tracking grid renders
    // the same abbreviation, so read it from here instead of re-deriving it.
    // `.filter({ hasText })` on "div" matches every ancestor div that contains
    // the text too, not just the innermost panel, and `.first()` in DOM order
    // is the OUTERMOST match (its opening tag comes first); `.last()` is the
    // innermost "card-surface p-5" panel div that actually wraps the slip.
    const pickSlip = page.locator("div").filter({ hasText: "Pick Slip" }).last();
    const slipAbbreviation = await pickSlip
      .locator("span.font-mono.font-bold.tabular-nums.text-text-primary")
      .first()
      .innerText();
    pickedTeamAbbreviation = slipAbbreviation.trim().split(/\s+/)[0];
    expect(pickedTeamAbbreviation).toMatch(/^[A-Z0-9]{2,4}$/);

    await openTrackingTab(page);
    const grid = whoPickedWhomSection(page);
    const fixtureRow = grid.locator("li", { hasText: fx.memberDisplayName });
    await expect(fixtureRow).toBeVisible();
    // Overlaid client-side from /api/book/picks after mount: waits for the
    // real async fetch rather than asserting on server-rendered HTML.
    await expect(
      fixtureRow.getByText(pickedTeamAbbreviation!, { exact: false }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("hides that same pick from a signed-out visitor", async ({ page }) => {
    test.skip(!pickedTeamAbbreviation, "no pick was booked by the previous test");

    await page.goto("/book");
    await openTrackingTab(page);

    const grid = whoPickedWhomSection(page);
    const fixtureRow = grid.locator("li", { hasText: fx.memberDisplayName });
    await expect(fixtureRow).toBeVisible();
    await expect(
      fixtureRow.getByText(pickedTeamAbbreviation!, { exact: false }),
    ).toHaveCount(0);
  });
});
