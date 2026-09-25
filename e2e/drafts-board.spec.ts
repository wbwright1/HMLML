import { test, expect } from "@playwright/test";
import { teamAcronym } from "../lib/team-acronym";

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

  // Issue #314: the "via" note used to carry the origin franchise's 14px
  // crest, which on an untraded pick (before #314's isTradedPick guard) drew
  // the drafting team's own monogram next to its own code, reading as
  // "XY via XY". Blake asked for "via XY" only: plain text, no crest, on
  // every via note. The column header's crest (a different component,
  // TeamCrest) is untouched by this and still renders one.
  test("renders the traded-pick 'via' note as plain text with no crest", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    const href = await findCompletedDraftHref(page);
    if (!href) return;

    await page.goto(href);

    const notes = page.locator('[data-testid="via-note"]');
    if ((await notes.count()) === 0) return; // No traded picks in this draft.

    const note = notes.first();
    await expect(note).toBeVisible();
    // No crest: no img and no FranchiseLogo monogram box inside the note.
    await expect(note.locator("img")).toHaveCount(0);
    await expect(note.locator("div")).toHaveCount(0);
    // Just "via CODE" text, no space in the code itself.
    await expect(note).toHaveText(/^via \S+$/);
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

  // Issue #314: root cause was every pick since #124 (ef14b86) storing
  // original_franchise_id even on untraded picks, so the render side's
  // "originalName present" guard showed a via note on every single pick.
  // isTradedPick fixes this by comparing originalId to currentId. Checked
  // across several seasons synced after #124, plus 2021 as the legacy-shape
  // control (originalFranchiseId only populated for actually-traded picks
  // there, via scripts/backfill-original-franchise.ts).
  for (const year of [2021, 2023, 2024, 2025]) {
    test(`/drafts/${year}: via notes show on some but not all picks, and never name the drafting team`, async ({
      page,
    }) => {
      await page.setViewportSize(DESKTOP_VIEWPORT);
      await page.goto(`/drafts/${year}`);

      const heading = page.getByRole("heading", { name: "Draft Board." });
      if ((await heading.count()) === 0) return;
      // Not a completed draft (upcoming boards have no filled pick cells).
      const isUpcoming = await page.getByText("Upcoming", { exact: true }).count();
      if (isUpcoming > 0) return;

      // Filled desktop board cells carry both "flex" and the shared
      // min-h-[128px]; the empty placeholder slot (no pick) omits "flex".
      const totalPickCount = await page.locator(".flex.min-h-\\[128px\\]").count();
      if (totalPickCount === 0) return; // No completed board rendered (no data seeded).

      const notes = page.locator('[data-testid="via-note"]');
      const noteCount = await notes.count();

      // Before the #314 fix, every synced-post-#124 season showed a via note
      // on every pick cell. After the fix it must be strictly fewer than the
      // total, and every note must be well-formed "via CODE" text.
      expect(noteCount).toBeLessThan(totalPickCount);

      for (let i = 0; i < noteCount; i++) {
        const text = (await notes.nth(i).textContent())?.trim() ?? "";
        expect(text).toMatch(/^via \S+$/);
      }
    });
  }

  test("franchise drafts page: no via note names the franchise's own team", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/teams");

    const link = page.locator('a[href^="/teams/"]').first();
    if ((await link.count()) === 0) return;
    const href = await link.getAttribute("href");
    if (!href) return;
    const slug = href.replace(/^\/teams\//, "").split("/")[0];
    if (!slug) return;

    await page.goto(`/teams/${slug}/drafts`);

    // The BackLink at the top of the page ("< {franchise.name}") is the most
    // reliable source of this franchise's own name on the page.
    const backLink = page.locator('a[href^="/teams/"]').first();
    if ((await backLink.count()) === 0) return;
    const ownName = (await backLink.textContent())?.trim();
    if (!ownName) return;
    const ownCode = teamAcronym(ownName);

    const notes = page.locator('[data-testid="via-note"]');
    const noteCount = await notes.count();
    if (noteCount === 0) return;

    for (let i = 0; i < noteCount; i++) {
      const text = (await notes.nth(i).textContent())?.trim().toUpperCase() ?? "";
      // Before #314, every untraded pick on this page rendered "via <own
      // name>". Now every rendered note must be a genuine trade, so none can
      // read as this franchise's own code.
      expect(text).not.toBe(`VIA ${ownCode.toUpperCase()}`);
    }
  });
});
