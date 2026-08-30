import { test, expect } from "@playwright/test";
import type { Page, Locator } from "@playwright/test";

// ============================================================================
// Between-Weeks Hub (state 1d)
//
// The Tue/Wed lull: regular season, no live game, the slate set but not yet
// kicked off. Runs under the "hub-in-season" Playwright project, whose dev
// server is pinned to NFL_STATE_OVERRIDE=regular:1:force (playwright.config.ts).
// Bundled with #249's fix because it shares that server and had the same
// silent-skip defect (a runtime isBetweenWeeks() guard letting every test
// self-skip with zero assertions exercised).
//
// The distinctive marker is the hero kicker "... THE SLATE IS SET". The first
// test below asserts it unconditionally, making the state itself a hard claim
// rather than an implicit one; every other test in the file also asserts
// unconditionally now.
//
// Fallback documented in the PR: if the forced regular:1:force state does not
// land the hub in the between-weeks sub-state (computeIsBetweenWeeks needs a
// slate with no kicked-off games), this file is dropped from the
// hub-in-season project's testMatch and from STATE_FORCED in
// playwright.config.ts rather than fought.
// ============================================================================

const SLATE_MARKER = /THE SLATE IS SET/i;

/** The between-weeks hero is the first section in <main>. */
function hero(page: Page): Locator {
  return page.locator("main section").first();
}

test.describe("Between-Weeks Hub (1d)", () => {
  test("T00: the between-weeks slate marker renders", async ({ page }) => {
    await page.goto("/");
    const main = page.locator("main");
    const text = await main.innerText();
    expect(text).toMatch(SLATE_MARKER);
  });

  test("T01: hero renders the slate kicker and a serif headline", async ({
    page,
  }) => {
    await page.goto("/");

    const h = hero(page);
    await expect(h.locator("p.text-kicker").first()).toContainText(
      /Harambe Memorial League/i
    );
    const h1 = h.locator("h1");
    await expect(h1).toBeVisible();
    expect((await h1.innerText()).trim().length).toBeGreaterThan(0);
    // Serif italic display family.
    const fontStyle = await h1.evaluate((el) => getComputedStyle(el).fontStyle);
    expect(fontStyle).toBe("italic");
  });

  test("T02: Game of the Week feature card is present with both teams", async ({
    page,
  }) => {
    await page.goto("/");

    const gotwLabel = page.getByText("Game of the Week", { exact: true });
    await expect(gotwLabel).toBeVisible();
    // The card carries a serif "vs" between the two teams.
    await expect(page.getByText("vs", { exact: true }).first()).toBeVisible();
  });

  test("T03: the rest of the slate section renders preview cards", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByText("The Rest of the Slate", { exact: true })
    ).toBeVisible();
  });

  test("T04: no em-dashes anywhere in the hub copy", async ({ page }) => {
    await page.goto("/");
    const text = await page.locator("main").innerText();
    expect(text).not.toContain("—"); // em dash
    expect(text).not.toContain("–"); // en dash
  });

  test("T06: pre-kickoff rail shows Players to Watch, never Standouts", async ({
    page,
  }) => {
    await page.goto("/");
    const main = page.locator("main");
    const text = await main.innerText();
    expect(text).not.toContain("Standouts");
    // Only assert the heading exists when the rail actually has picks; an
    // empty result renders nothing, which is also correct behavior.
    const hasPlayersToWatch = /Players to Watch/i.test(text);
    if (hasPlayersToWatch) {
      await expect(
        page.getByText(/Players to Watch/i).first()
      ).toBeVisible();
    }
  });

  test("T07: no duplicate <h2> section headings in <main>", async ({ page }) => {
    await page.goto("/");
    const headings = await page.locator("main h2").allInnerTexts();
    const normalized = headings.map((h) => h.trim()).filter(Boolean);
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  test("T08: no fabricated division-leader claim while the Game of the Week teams are both 0-0", async ({
    page,
  }) => {
    await page.goto("/");
    // Scope to the Game of the Week card's own season records (not the
    // all-time head-to-head badge, which is a different, always-nonzero
    // number even at week 1): both teams reading 0-0 there means the league
    // has played zero games, so no "1st in Division" claim should exist
    // anywhere in <main>.
    const gotwHeading = page.getByText("Game of the Week", { exact: true });
    await expect(gotwHeading).toBeVisible();
    const gotwCard = gotwHeading.locator("xpath=following-sibling::*[1]");
    const recordSpans = gotwCard.locator("span.text-stat");
    const records = await recordSpans.allInnerTexts();
    const seasonRecords = records.filter((r) => /^\d+-\d+$/.test(r.trim()));
    const bothZero =
      seasonRecords.length >= 2 && seasonRecords.every((r) => r.trim() === "0-0");
    if (bothZero) {
      const text = await page.locator("main").innerText();
      expect(text).not.toContain("1st in Division");
    }
  });

  test("T05: mobile keeps the top of the funnel and hides the rail", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    // Hero + Game of the Week visible on mobile.
    await expect(hero(page).locator("h1")).toBeVisible();
    await expect(page.getByText("Game of the Week", { exact: true })).toBeVisible();

    // Right-rail modules (Trending, Left On The Bench) are desktop-only.
    await expect(page.getByText("Left On The Bench", { exact: true })).toBeHidden();
    await expect(page.getByText("Trending", { exact: true })).toBeHidden();

    // Page does not scroll horizontally.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(overflow).toBe(true);
  });
});
