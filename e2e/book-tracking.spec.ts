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
// The tab is game-first: one slate card per game, both sides as the pick
// buttons, and the members who took each side as a rail of crest chips under
// that side once the game is off the board. The rail is the anti-tailing rule's
// sharpest edge, so the privacy test below asserts on the shipped HTML and not
// only on what the DOM happens to be showing.
//
// The league's live season has not kicked off as of this test (every matchup is
// still "scheduled"), so nothing is graded and the ledger's honest empty state
// is what real data produces. That empty state is asserted rather than mocked
// around, and it is also why no test here expects a revealed picker rail.
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

function slateCards(page: Page) {
  return trackingPanel(page).locator('[data-testid="slate-card"]');
}

/** The card for one game, which is the unit of this tab. */
function slateCard(page: Page, matchupId: number) {
  return trackingPanel(page).locator(
    `[data-testid="slate-card"][data-matchup-id="${matchupId}"]`,
  );
}

let pickedLabel: string | null = null;

test.describe("Tracking tab pick'ems", () => {
  test("renders the honest empty state when nothing is graded yet", async ({ page }) => {
    await page.goto("/book");
    await openTrackingTab(page);

    // The real season has no completed week yet, so the ledger has nothing to
    // rank; this asserts the real (non-fabricated) empty state.
    await expect(
      page.getByText("No graded picks yet. The ledger opens once a week finishes."),
    ).toBeVisible();

    // The slate still renders, because picking is what the tab is for now.
    await expect(trackingPanel(page).getByText("The Slate")).toBeVisible();
    expect(await slateCards(page).count()).toBeGreaterThan(0);
  });

  test("tells a signed-out visitor to claim a team instead of showing controls", async ({
    page,
  }) => {
    await page.goto("/book");
    await openTrackingTab(page);

    // The words themselves are the link now, not a repeated sentence after it.
    const claim = trackingPanel(page).getByRole("link", {
      name: "Claim your team",
    });
    await expect(claim).toBeVisible();
    await expect(claim).toHaveAttribute("href", "/claim");
    await expect(
      trackingPanel(page).getByText("Claim your team to get on the sheet."),
    ).toBeVisible();

    await expect(
      trackingPanel(page).locator('button[aria-label^="Pick "]'),
    ).toHaveCount(0);
    // No lock control either: there is no slip to lock.
    await expect(
      trackingPanel(page).getByRole("button", { name: /lock in picks/i }),
    ).toHaveCount(0);
  });

  test("books a pick from a slate card and writes it to book_picks", async ({
    page,
  }) => {
    await signIn(page, fx.memberClaimCode);
    await page.goto("/book");
    await openTrackingTab(page);

    const button = trackingPanel(page).locator('button[aria-label^="Pick "]').first();
    await expect(button).toBeVisible();
    // The aria-label, not the text: it is the stable identity of the side.
    pickedLabel = (await button.getAttribute("aria-label"))!;
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    // The written label on the card, not just the gold tint on the row.
    await expect(trackingPanel(page).getByText("Your pick ·").first()).toBeVisible();

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

  test("counts an open pick without revealing a single side of it", async ({
    page,
  }) => {
    await signIn(page, fx.memberClaimCode);
    await page.goto("/book");
    await openTrackingTab(page);

    const button = trackingPanel(page).locator('button[aria-label^="Pick "]').first();
    const pickedTeam = (await button.getAttribute("aria-label"))!.replace(
      /^Pick /,
      "",
    );
    await button.click();
    await expect
      .poll(async () => (await scopedPickRows()).length, { timeout: 10000 })
      .toBe(1);
    const [row] = await scopedPickRows();
    const card = slateCard(page, row.matchup_id);

    // The viewer's own pick is visible to the viewer: that is the half of the
    // privacy rule that must still work.
    await expect(card.getByText("Your pick ·")).toBeVisible({ timeout: 10000 });

    // Nobody's side is on an open card, not even the viewer's own, in the rail:
    // the rail does not exist before kickoff.
    await expect(card.locator('[data-testid="rail-chip"]')).toHaveCount(0);
    // The card counts the picks that ARE in, which is all an open game may say.
    await expect(card.getByText(/of \d+ in · reveals at kickoff/)).toBeVisible();

    // Signed out, the same card carries no trace of the pick at all.
    await page.context().clearCookies();
    await page.goto("/book");
    await openTrackingTab(page);
    await expect(slateCard(page, row.matchup_id)).toBeVisible();
    await expect(
      slateCard(page, row.matchup_id).getByText("Your pick ·"),
    ).toHaveCount(0);

    // The DOM assertions above could in principle pass while the pick still
    // rode along in the payload (hidden by client code). Assert on the RAW
    // RESPONSE BODY instead: the shipped card for this game carries no rail
    // chip, no side attribute, and no mention of the team that was picked.
    const res = await page.request.get("/book");
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    const cardHtml = openSlateCardHtml(body, row.matchup_id);
    expect(cardHtml).not.toBeNull();
    expect(cardHtml!).not.toContain("rail-chip");
    expect(cardHtml!).not.toContain("data-side");
    expect(cardHtml!).not.toContain(`data-member-id="${seededMemberId}"`);
    // The whole shipped page, not just this card: an open pick's side must not
    // appear anywhere in it.
    expect(body).not.toContain(`Your pick · ${pickedTeam}`);
  });

  // Issue #255: a picker is identified by a crest, not by a bare letter code.
  // The code is demoted to a compact secondary label, so it must still be on
  // screen: nothing here may be image-only.
  test("identifies each picker chip by a crest, without dropping its text", async ({
    page,
  }) => {
    await page.goto("/book");
    await openTrackingTab(page);

    // The fixture member has no picks on most of the week, so they are in the
    // Week Pulse's "still ghosting" row, which is the tab's other chip surface
    // and the only one that renders before any game has kicked off.
    const chips = trackingPanel(page).locator('[data-testid="ghost-chip"]');
    expect(await chips.count()).toBeGreaterThan(0);

    const fixtureChip = trackingPanel(page)
      .locator(`[data-testid="ghost-chip"][data-member-id="${seededMemberId}"]`)
      .first();
    await expect(fixtureChip).toBeVisible();

    // The fixture franchise has no franchise_seasons row, so avatar_url IS
    // NULL for it: this is the monogram fallback path, and it must render a
    // styled monogram with NO <img> at all (a broken-image glyph would be the
    // regression this pins).
    expect(await fixtureChip.locator("img").count()).toBe(0);
    // FranchiseLogo's monogram is the first two characters of the abbreviation,
    // which the fixture seeds as "E2".
    await expect(fixtureChip).toContainText("E2");
    // #259: the monogram path must announce the franchise, not just paint
    // initials. The chip is not a link, so this crest IS the accessible name.
    await expect(
      fixtureChip.getByRole("img", { name: fx.franchiseName }),
    ).toBeVisible();

    // At least one real franchise carries a synced crest for this season; that
    // chip must render a real <img> with a NON-EMPTY alt, which is what fails
    // if the deliberate non-decorative decision here is ever reverted.
    const sql = getSql();
    const withAvatar = (await sql`
      SELECT COUNT(*)::int AS n
      FROM "members" m
      JOIN "franchise_seasons" fs ON fs."franchise_id" = m."franchise_id"
      WHERE fs."avatar_url" IS NOT NULL`) as { n: number }[];
    if ((withAvatar[0]?.n ?? 0) > 0) {
      const crest = chips.locator("img").first();
      await expect(crest).toHaveAttribute("src", /\S/);
      await expect(crest).toHaveAttribute("alt", /\S/);
    }
  });

  test("renders the same slate on a phone, with no sideways scroll anywhere", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/book");
    await openTrackingTab(page);

    // Same component tree as the desktop, not a different one: the cards are
    // there, and so is the ledger.
    expect(await slateCards(page).count()).toBeGreaterThan(0);
    await expect(trackingPanel(page).getByText("The Slate")).toBeVisible();

    // The retired grid's phone affordances must be gone with it.
    await expect(page.locator("#pickems-division")).toHaveCount(0);

    // Nothing on this tab scrolls sideways any more: not the page, and not a
    // container inside it either.
    const docWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(docWidth).toBeLessThanOrEqual(390);

    const overflowing = await page.evaluate(() => {
      const panel = document.getElementById("book-pane-tracking");
      if (!panel) return -1;
      // Only scrollable containers count: a `truncate` span legitimately has
      // a scrollWidth wider than its box, and that is an ellipsis, not a drag.
      return [...panel.querySelectorAll("*")].filter((el) => {
        const overflowX = getComputedStyle(el).overflowX;
        if (overflowX !== "auto" && overflowX !== "scroll") return false;
        return el.scrollWidth - el.clientWidth > 1;
      }).length;
    });
    expect(overflowing).toBe(0);

    // The franchise name on a side row is the payload, so it must survive the
    // width rather than truncating to an initial.
    const name = trackingPanel(page)
      .locator('[data-testid="slate-card"] .truncate')
      .first();
    await expect(name).toBeVisible();
    const box = (await name.boundingBox())!;
    expect(box.width).toBeGreaterThan(80);
  });

  // Last on purpose: this test locks the fixture member's slip for the week,
  // which closes every pick control for the rest of the run.
  test("locks the slip from the Tracking tab, and the server refuses the pick anyway", async ({
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

    const openCards = trackingPanel(page).locator(
      '[data-testid="slate-card"]:has(button[aria-label^="Pick "])',
    );
    const openGames = await openCards.count();
    expect(openGames).toBeGreaterThan(0);

    // Until every open game has a pick, the lock row says so instead of
    // offering a button. That is the third state of the one lock control this
    // tab has, and the tab now has one at all, which it did not before.
    await expect(
      trackingPanel(page).getByText(/picks? still open/),
    ).toBeVisible();

    // Capture the REAL server-action request behind the first pick. Once the
    // slip locks the button is gone (which is the point), so replaying this
    // captured call is the only honest way to ask the server directly whether
    // it re-enforces the lock rather than trusting the disabled UI.
    const capturedPromise = page.waitForRequest(
      (r) => r.method() === "POST" && r.headers()["next-action"] !== undefined,
    );

    for (let i = 0; i < openGames; i++) {
      const card = openCards.nth(i);
      // Each pick is: click, wait for the action's own follow-up slip refetch
      // (fired through pick-events), then confirm the row in Postgres before
      // touching the next game. Clicking at browser speed instead would race
      // the re-render that refetch triggers and silently drop a click, which
      // would make this test about Playwright timing rather than the lock rule.
      const refetch = page.waitForResponse(
        (r) => r.url().includes("/api/book/picks"),
        { timeout: 15000 },
      );
      await card.locator('button[aria-label^="Pick "]').first().click();
      await refetch;
      await expect(card.locator('[aria-pressed="true"]')).toHaveCount(1, {
        timeout: 10000,
      });
      await expect
        .poll(async () => (await scopedPickRows()).length, { timeout: 15000 })
        .toBe(i + 1);
    }
    const captured = await capturedPromise;
    const before = await scopedPickRows();

    // Lock from THIS tab: the redesign gives the Tracking tab its own lock
    // control, so a member who never opens the Board can still commit.
    const lockButton = trackingPanel(page).getByRole("button", {
      name: /lock in picks/i,
    });
    await expect(lockButton).toBeVisible({ timeout: 10000 });
    await lockButton.click();
    await expect(
      trackingPanel(page).getByText("Picks are in. No takebacks."),
    ).toBeVisible({ timeout: 10000 });

    // The pick controls close on this tab...
    await expect(
      trackingPanel(page).locator('button[aria-label^="Pick "]'),
    ).toHaveCount(0, { timeout: 10000 });
    // ...the sides still render as inert rows carrying the state...
    await expect(
      trackingPanel(page).getByText("Locked in").first(),
    ).toBeVisible();
    // ...and the lock can be handed back while the games are still to kick off.
    await expect(
      trackingPanel(page).getByRole("button", { name: /unlock open games/i }),
    ).toBeVisible();

    // ...and the Board agrees, with no reload, through the pick-events signal.
    await page.getByRole("tab", { name: "The Board" }).click();
    await expect(page.getByText("Picks are in. No takebacks.").first()).toBeVisible({
      timeout: 10000,
    });

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

/**
 * The shipped HTML of one slate card, cut from the response body by hand.
 *
 * Deliberately a raw string slice rather than a DOM query: the point of the
 * privacy assertion is what the SERVER put on the wire, before any client code
 * has had a chance to hide something.
 */
function openSlateCardHtml(body: string, matchupId: number): string | null {
  const marker = `data-matchup-id="${matchupId}"`;
  const start = body.indexOf(marker);
  if (start === -1) return null;
  // Cards are siblings, so the next card's marker (or the end of the document)
  // bounds this one.
  const next = body.indexOf('data-testid="slate-card"', start + marker.length);
  return body.slice(start, next === -1 ? body.length : next);
}
