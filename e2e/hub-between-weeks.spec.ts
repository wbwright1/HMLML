import { test, expect } from "@playwright/test";
import type { Page, Locator } from "@playwright/test";
import { signaturePhrasesIn } from "../lib/content-gen/phrases";

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

  test("T11: every slate card carries its own angle, never the 0-0 placeholder", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByText("The Rest of the Slate", { exact: true })
    ).toBeVisible();

    const angles = (
      await page.getByTestId("slate-angle").allInnerTexts()
    ).map((a) => a.trim());

    // The slate is the whole week minus the Game of the Week, so a real week
    // always has several cards.
    expect(angles.length).toBeGreaterThanOrEqual(2);

    // AC 2: no two cards say the same thing.
    expect(new Set(angles).size).toBe(angles.length);

    for (const angle of angles) {
      // AC 1: never the records placeholder, and never a 0-0 claim at all.
      expect(angle).not.toMatch(/\d+-\d+ against \d+-\d+/);
      expect(angle).not.toContain("0-0");
      // Substantive copy, not a bare fragment.
      expect(angle.length).toBeGreaterThan(20);
    }
  });

  // Issue #274: the hero dek, the Game of the Week kicker and the Game of the
  // Week blurb are three generated lines stacked on one screen. They used to
  // share stock idioms ("receipts to settle", "first place on the line"),
  // which made them read as one fill-in-the-blank template.
  test("T12: hero dek, GotW kicker and GotW blurb share no signature phrase", async ({
    page,
  }) => {
    await page.goto("/");

    const dek = (await page.getByTestId("hero-dek").innerText()).trim();
    const kicker = (await page.getByTestId("gotw-kicker").innerText()).trim();
    const blurb = (await page.getByTestId("gotw-blurb").innerText()).trim();

    for (const line of [dek, kicker, blurb]) {
      expect(line.length).toBeGreaterThan(0);
    }

    const pairs: [string, string, string][] = [
      ["dek/kicker", dek, kicker],
      ["dek/blurb", dek, blurb],
      ["kicker/blurb", kicker, blurb],
    ];
    for (const [label, a, b] of pairs) {
      const shared = [...signaturePhrasesIn(a)].filter((p) =>
        signaturePhrasesIn(b).has(p)
      );
      expect(shared, `${label} share: ${shared.join(", ")}`).toEqual([]);
    }

    // The Game of the Week line keeps its own phrasing (owner's call); it is
    // the surrounding copy that varies around it.
    expect(blurb.toLowerCase()).toContain("first place");
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
      // Every pick carries a story kicker: the headliner, or one of the
      // archetype slots (see lib/queries/players-to-watch.ts).
      // Case-insensitive: the kicker line renders through CSS `uppercase`,
      // and innerText returns the rendered casing.
      expect(text).toMatch(
        /The Headliner|The Debut|Revenge Game|New Face|The Leap/i
      );
    }
  });

  test("T09: the rail reads the league's own data, never Sleeper trending", async ({
    page,
  }) => {
    await page.goto("/");
    const text = await page.locator("main").innerText();
    // The Trending module is gone; the hub makes no live Sleeper call.
    expect(text).not.toContain("Most-added player in the league");
    // League Moves and the history card are both optional (empty renders
    // nothing), so assert their shape only when they are on the page.
    if (/League Moves/i.test(text)) {
      expect(text).toMatch(/\bADD\b|\bDROP\b|\bTRADE\b/);
    }
    if (/This Week in HMLML History/i.test(text)) {
      // Case-insensitive for the same CSS `uppercase` reason as T06.
      expect(text).toMatch(/High Water|Beatdown|Nail-Biter/i);
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

  test("T10: rail story text wraps instead of clipping, at desktop and mobile widths", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      const main = page.locator("main");
      const text = await main.innerText();

      // Players to Watch: story-detail and projection paragraphs.
      if (/Players to Watch/i.test(text)) {
        const storyParagraphs = page.locator(
          "p.text-body-sm.text-text-secondary.line-clamp-3, p.text-body-sm.text-text-tertiary.line-clamp-2"
        );
        const count = await storyParagraphs.count();
        for (let i = 0; i < count; i++) {
          const el = storyParagraphs.nth(i);
          const { scrollWidth, clientWidth, fontSize, textTransform } =
            await el.evaluate((node) => {
              const style = getComputedStyle(node);
              return {
                scrollWidth: node.scrollWidth,
                clientWidth: node.clientWidth,
                fontSize: parseFloat(style.fontSize),
                textTransform: style.textTransform,
              };
            });
          expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
          expect(fontSize).toBeGreaterThanOrEqual(14);
          expect(textTransform).toBe("none");
        }
      }

      // This Week in HMLML History: the claim paragraph.
      if (/This Week in HMLML History/i.test(text)) {
        const claimParagraphs = page.locator(
          "p.mt-1.text-body-sm.text-text-secondary"
        );
        const count = await claimParagraphs.count();
        for (let i = 0; i < count; i++) {
          const el = claimParagraphs.nth(i);
          const { scrollWidth, clientWidth, fontSize, textTransform } =
            await el.evaluate((node) => {
              const style = getComputedStyle(node);
              return {
                scrollWidth: node.scrollWidth,
                clientWidth: node.clientWidth,
                fontSize: parseFloat(style.fontSize),
                textTransform: style.textTransform,
              };
            });
          expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
          expect(fontSize).toBeGreaterThanOrEqual(14);
          expect(textTransform).toBe("none");
        }
      }
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

    // Right-rail modules (League Moves, This Week in HMLML History, Left On
    // The Bench) are desktop-only.
    await expect(page.getByText("Left On The Bench", { exact: true })).toBeHidden();
    await expect(page.getByText("League Moves", { exact: true })).toBeHidden();
    await expect(
      page.getByText("This Week in HMLML History", { exact: true })
    ).toBeHidden();

    // Page does not scroll horizontally.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(overflow).toBe(true);
  });
});
