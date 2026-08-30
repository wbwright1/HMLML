import { test, expect } from "@playwright/test";

/**
 * Draft board (Command Center restyle): the completed-draft grid renders
 * with position labels as visible text (not color-only), the mobile round
 * selector actually switches which picks are shown, and traded-pick "via"
 * attribution survives the restyle.
 *
 * Runs against a real dev server + real Postgres (no mocks). Discovers a
 * real completed draft year from /drafts rather than hardcoding one; when
 * the database has no draft data the index page shows its EmptyState and
 * these specs no-op, matching the pattern used by the rest of this suite.
 */

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

/** Find a completed (non-"Upcoming") draft year link on the /drafts index. */
async function findCompletedDraftHref(page: import("@playwright/test").Page): Promise<string | null> {
  await page.goto("/drafts");

  const rows = page.locator('a[href^="/drafts/"]');
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const text = await row.textContent();
    if (text && !text.includes("Upcoming")) {
      return row.getAttribute("href");
    }
  }
  return null;
}

test.describe("Draft board", () => {
  test("renders a board for a completed draft year with position labels as text", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    const href = await findCompletedDraftHref(page);
    if (!href) return; // No completed draft seeded in this environment.

    await page.goto(href);

    await expect(page.getByRole("heading", { name: "Draft Board." })).toBeVisible();

    // Desktop grid should render at least one pick cell with a real position
    // abbreviation rendered as visible text (not conveyed by color alone).
    const positionText = page.locator("span", { hasText: /^(QB|RB|WR|TE|K|DEF|DST)$/ }).first();
    await expect(positionText).toBeVisible();
    const label = await positionText.textContent();
    expect(label).toMatch(/^(QB|RB|WR|TE|K|DEF|DST)$/);
  });

  test("round grouping/selector switches the visible picks on mobile", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    const href = await findCompletedDraftHref(page);
    if (!href) return;

    await page.goto(href);

    const roundNav = page.getByRole("navigation", { name: "Draft round" });
    if ((await roundNav.count()) === 0) return; // Single-round draft — no selector to test.

    const roundLinks = roundNav.getByRole("link");
    const roundCount = await roundLinks.count();
    if (roundCount < 2) return; // Nothing to switch between.

    const roundOneActive = roundLinks.first();
    await expect(roundOneActive).toHaveAttribute("aria-current", "page");

    const pickList = page.locator(".card-surface.divide-y");
    const firstRoundFirstPick = await pickList.first().textContent();

    await roundLinks.nth(1).click();
    await expect(roundLinks.nth(1)).toHaveAttribute("aria-current", "page");
    await expect(roundOneActive).not.toHaveAttribute("aria-current", "page");

    const secondRoundFirstPick = await pickList.first().textContent();
    expect(secondRoundFirstPick).not.toBe(firstRoundFirstPick);
  });

  test("traded-pick 'via' attribution renders when a pick was traded", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    const href = await findCompletedDraftHref(page);
    if (!href) return;

    await page.goto(href);

    const viaText = page.getByText(/^via /).first();
    if ((await viaText.count()) === 0) return; // No traded picks in this draft.

    await expect(viaText).toBeVisible();
    const text = await viaText.textContent();
    expect(text?.trim().startsWith("via ")).toBe(true);
    expect(text?.trim().length).toBeGreaterThan("via ".length);
  });

  // Issue #255: the "via" note carries the origin franchise's crest, and the
  // column header's visible code now comes from the same source the crest
  // draws its monogram from (they used to disagree: abbreviation.slice(0,2)
  // above, teamAcronym(name) below).
  test("puts a crest on the traded-pick 'via' note", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    const href = await findCompletedDraftHref(page);
    if (!href) return;

    await page.goto(href);

    const notes = page.locator('[data-testid="via-note"]');
    if ((await notes.count()) === 0) return; // No traded picks in this draft.

    const note = notes.first();
    await expect(note).toBeVisible();
    // The crest is FranchiseLogo's 14px box, a sibling of the "via" text.
    const crest = note.locator("div").first();
    await expect(crest).toBeAttached();
    const box = await crest.boundingBox();
    expect(box?.width).toBe(14);
    // Never image-only: the origin is still named in text.
    await expect(note).toHaveText(/via \S+/);
  });

  test("draws the column header's code from the same source as its crest", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    const href = await findCompletedDraftHref(page);
    if (!href) return;

    await page.goto(href);

    const headers = page.locator('[data-testid="draft-column-header"]');
    const count = await headers.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const header = headers.nth(i);
      // The monogram inside the crest, and the visible label below it.
      const monogram = ((await header.locator("span").first().textContent()) ?? "").trim();
      const label = ((await header.locator("span").last().textContent()) ?? "").trim();
      expect(monogram.length).toBeGreaterThan(0);
      expect(label.length).toBeGreaterThan(0);
      // FranchiseLogo's monogram is the first two characters of the same code
      // the label prints, so one must be a prefix of the other.
      expect(label.slice(0, 2).toUpperCase()).toBe(monogram.toUpperCase());
    }
  });

  test("upcoming draft board renders roster breakdown instead of players", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/drafts");

    const upcomingLink = page.locator('a[href^="/drafts/"]', { hasText: "Upcoming" }).first();
    if ((await upcomingLink.count()) === 0) return; // No upcoming season in this environment.

    const href = await upcomingLink.getAttribute("href");
    if (!href) return;

    await page.goto(href);
    await expect(page.getByText("Upcoming", { exact: true }).first()).toBeVisible();

    // Roster-breakdown counts render as mono position-letter pairs (e.g. "2Q").
    const rosterCount = page.locator("span", { hasText: /^\d+[QRWT]$/ }).first();
    if ((await rosterCount.count()) === 0) return; // Falls back to the mobile list layout at this viewport.
    await expect(rosterCount).toBeVisible();
  });
});
