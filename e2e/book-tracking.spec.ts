import { test, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
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

// The claim endpoint throttles at 10 attempts per minute per IP
// (app/claim/actions.ts), and this file signs in on most of its tests, so the
// real session cookie issued by the first real claim is reused by the rest
// rather than burning a claim attempt (and flaking) on every test.
type BrowserCookies = Awaited<ReturnType<BrowserContext["cookies"]>>;
let sessionCookies: BrowserCookies | null = null;

async function signIn(page: Page, code: string) {
  if (sessionCookies) {
    await page.context().addCookies(sessionCookies);
    return;
  }
  await page.goto("/claim");
  await page.fill("#code", code);
  await page.getByRole("button", { name: /claim my team/i }).click();
  await expect(page.locator('a[aria-label*="manage your team"]').first()).toBeVisible();
  sessionCookies = await page.context().cookies();
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
    // The aria-label, not the text: the picked state appends a "✓" glyph, so
    // the label is the stable identity of the side that was picked.
    pickedLabel = (await button.getAttribute("aria-label"))!;
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    // The written label beside the row, not just the gold tint.
    await expect(trackingPanel(page).getByText("✓ Your pick").first()).toBeVisible();

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
    ).toHaveAttribute("aria-label", pickedLabel!, { timeout: 10000 });
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
    const pickedAbbreviation = (await button.innerText()).trim().split(/\s+/)[0];
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

    // The DOM assertion above could in principle pass while the pick still rode
    // along in the payload (hidden by client code). Assert on the RAW RESPONSE
    // BODY instead: every one of this member's cells in the shipped HTML reads
    // as empty, and the picked side's abbreviation is nowhere among them.
    const res = await page.request.get("/book");
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    const cellPattern = new RegExp(
      `data-member-id="${seededMemberId}"[^>]*data-matchup-id="\\d+"[^>]*>([^<]*)<`,
      "g",
    );
    const shipped = [...body.matchAll(cellPattern)].map((m) => m[1].trim());
    expect(shipped.length).toBeGreaterThan(0);
    for (const cell of shipped) {
      expect(cell).toBe("—");
      expect(cell).not.toContain(pickedAbbreviation);
    }
  });

  // Issue #255: the picker column identifies a franchise by crest, not by a
  // bare letter code. The code is demoted to a compact secondary label, so it
  // must still be on screen: nothing here may be image-only.
  test("identifies each picker column by a crest, without dropping its text", async ({
    page,
  }) => {
    await page.goto("/book");
    await openTrackingTab(page);

    const headers = trackingPanel(page).locator('[data-testid="picker-header"]');
    expect(await headers.count()).toBeGreaterThan(0);

    // The fixture franchise has no franchise_seasons row, so avatar_url IS
    // NULL for it: this is the monogram fallback path, and it must render a
    // styled monogram with NO <img> at all (a broken-image glyph would be the
    // regression this pins).
    const fixtureHeader = trackingPanel(page)
      .locator(`[data-picker-slug="${fx.franchiseSlug}"]`)
      .first();
    await expect(fixtureHeader).toBeAttached();
    expect(await fixtureHeader.locator("img").count()).toBe(0);
    // FranchiseLogo's monogram is the first two characters of the abbreviation,
    // which the fixture seeds as "E2".
    await expect(fixtureHeader).toContainText("E2");
    // The visible compact label and the season record survive the swap.
    const label = fixtureHeader.locator("span[title]");
    await expect(label).toHaveAttribute("title", new RegExp(fx.franchiseName));
    await expect(label).toHaveText(/\S/);

    // At least one real franchise carries a synced crest for this season; that
    // header must render a real <img> with a NON-EMPTY alt, which is what fails
    // if the deliberate non-decorative decision here is ever reverted.
    const sql = getSql();
    const withAvatar = (await sql`
      SELECT COUNT(*)::int AS n
      FROM "members" m
      JOIN "franchise_seasons" fs ON fs."franchise_id" = m."franchise_id"
      WHERE fs."avatar_url" IS NOT NULL`) as { n: number }[];
    if ((withAvatar[0]?.n ?? 0) > 0) {
      const crest = headers.locator("img").first();
      await expect(crest).toHaveAttribute("src", /\S/);
      await expect(crest).toHaveAttribute("alt", /\S/);
    }
  });

  test("keeps the compact phone grid inside the viewport with crested columns", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/book");
    await openTrackingTab(page);

    // The grid scrolls sideways inside its own container by design; what must
    // not happen is the PAGE growing wider than the phone because a 24px crest
    // landed in a 40px column.
    const docWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(docWidth).toBeLessThanOrEqual(390);
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

  // Last on purpose: this test locks the fixture member's slip for the week,
  // which closes every pick control for the rest of the run.
  test("closes the control on a locked slip, and the server refuses the pick anyway", async ({
    page,
  }) => {
    // Start from an empty slip: an earlier test in this serial file leaves a
    // pick behind, and clicking a side that is already picked CLEARS it (the
    // toggle), which would quietly turn the loop below into a no-op.
    await deleteScopedPicks();
    await signIn(page, fx.memberClaimCode);
    await page.goto("/book");
    await openTrackingTab(page);

    // The controls only appear once the session resolves client-side.
    await expect(
      trackingPanel(page).locator('button[aria-label^="Pick "]').first(),
    ).toBeVisible({ timeout: 10000 });

    const pickRows = trackingPanel(page).locator(
      'li:has(button[aria-label^="Pick "])',
    );
    const openGames = await pickRows.count();
    expect(openGames).toBeGreaterThan(0);

    // Capture the REAL server-action request behind the first pick. Once the
    // slip locks the button is gone (which is the point), so replaying this
    // captured call is the only honest way to ask the server directly whether
    // it re-enforces the lock rather than trusting the disabled UI.
    const capturedPromise = page.waitForRequest(
      (r) => r.method() === "POST" && r.headers()["next-action"] !== undefined,
    );

    // The slip can only be locked once every open game has a pick, so pick
    // them all through the Tracking strip itself.
    for (let i = 0; i < openGames; i++) {
      const row = pickRows.nth(i);
      // Each pick is: click, wait for the action's own follow-up slip refetch
      // (fired through pick-events), then confirm the row in Postgres before
      // touching the next game. Clicking at browser speed instead would race
      // the re-render that refetch triggers and silently drop a click, which
      // would make this test about Playwright timing rather than the lock rule.
      const refetch = page.waitForResponse(
        (r) => r.url().includes("/api/book/picks"),
        { timeout: 15000 },
      );
      await row.locator('button[aria-label^="Pick "]').first().click();
      await refetch;
      await expect(row.locator('[aria-pressed="true"]')).toHaveCount(1, {
        timeout: 10000,
      });
      await expect
        .poll(async () => (await scopedPickRows()).length, { timeout: 15000 })
        .toBe(i + 1);
    }
    const captured = await capturedPromise;
    const before = await scopedPickRows();

    // Lock the slip from the Board (the one control that can), then come back.
    await page.getByRole("tab", { name: "The Board" }).click();
    await page.getByRole("button", { name: /lock in picks/i }).click();
    await expect(page.getByText("Picks are in. No takebacks.")).toBeVisible({
      timeout: 10000,
    });

    await openTrackingTab(page);
    // No reload: the pick-events signal closes this tab's controls too.
    await expect(
      trackingPanel(page).locator('button[aria-label^="Pick "]'),
    ).toHaveCount(0, { timeout: 10000 });
    // The sides still render, just as inert labels carrying the lock state.
    await expect(trackingPanel(page).getByText("Locked").first()).toBeVisible();

    // Now the server itself, asked directly with a request it already accepted
    // once: it must refuse and leave the row exactly as booked.
    const headers = { ...captured.headers() };
    delete headers["content-length"];
    const replay = await page.request.post(captured.url(), {
      headers,
      data: captured.postData() ?? "",
    });
    expect(replay.status()).toBe(200);
    expect(await replay.text()).toContain("Your slip is locked. No takebacks.");

    const after = await scopedPickRows();
    expect(after).toEqual(before);
  });
});
