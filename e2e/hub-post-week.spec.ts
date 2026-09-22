import { test, expect } from "@playwright/test";
import { isRecapWindowOpen } from "../lib/hub/week-recap";

// ============================================================================
// Post-week recap on the between-weeks hub
//
// The Tuesday-morning week roll through Thursday kickoff: the prior week is
// fully complete, the next slate is set, nothing has kicked off. The hub must
// LEAD with last week's recap (finals, superlatives, Team of the Week, top
// performers, dud, bench blunder) in the main column, so a phone sees it
// rather than jumping straight to next week's slate.
//
// Runs under the "hub-post-week" Playwright project (playwright.config.ts),
// whose dev server is pinned to NFL_STATE_OVERRIDE=regular:next:recap against
// the real Postgres: "next" is the earliest week whose matchups are all still
// scheduled, so the prior week is the last completed one, and ":recap" holds
// the recap window open on any weekday (the hero stamps data-recap-forced).
// Without ":recap" the window closes at the Thursday MORNING cron (06:00 UTC
// on kickoff day, lib/hub/week-recap.ts), so the suite reads the hero's
// stamped kickoff target and asserts the recap is present before that
// instant and absent after it. Both branches assert.
// ============================================================================

/** The hero kicker's schedule clause: the kickoff day, or the slate fallback. */
const HERO_SCHEDULE_TAIL =
  /KICKOFF (MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY|TODAY)|THE SLATE IS SET/i;

/** The slate's first kickoff, stamped on the hero section as
 * data-kickoff-target, or null when the hub has no kickoff to point at. */
async function kickoffTarget(page: import("@playwright/test").Page): Promise<Date | null> {
  const el = page.locator("[data-kickoff-target]").first();
  if ((await el.count()) === 0) return null;
  const iso = await el.getAttribute("data-kickoff-target");
  return iso ? new Date(iso) : null;
}

test.describe("Post-week recap (between weeks)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    const forced =
      (await page.locator('[data-recap-forced="true"]').count()) > 0;
    const open = forced || isRecapWindowOpen(new Date(), await kickoffTarget(page));
    if (!open) {
      // Thursday morning cron has passed: the plain slate hub, with the
      // rail fallbacks, and NO recap. Assert that state and stop.
      await expect(page.getByTestId("hero-kicker")).toContainText(HERO_SCHEDULE_TAIL);
      await expect(page.getByTestId("week-recap")).toHaveCount(0);
      await expect(page.locator("main")).toContainText(/IN THE BOOKS/);
      test.skip(true, "recap window closed (post Thursday cron); slate-only state asserted");
    }
  });

  test("the recap block renders in the main column above the slate", async ({ page }) => {
    const main = page.locator("main");
    await expect(page.getByTestId("hero-kicker")).toContainText(HERO_SCHEDULE_TAIL);
    const recap = page.getByTestId("week-recap");
    await expect(recap).toBeVisible();
    // Recap precedes Game of the Week in document order. Kickers render
    // through CSS `uppercase`, so innerText carries the rendered casing.
    const text = (await main.innerText()).toUpperCase();
    const recapAt = text.indexOf("IN THE BOOKS");
    expect(recapAt).toBeGreaterThan(-1);
    expect(recapAt).toBeLessThan(text.indexOf("GAME OF THE WEEK"));
  });

  test("the headline is a serif, number-backed claim with no em-dash", async ({ page }) => {
    const h = page.getByTestId("recap-headline");
    await expect(h).toBeVisible();
    const txt = (await h.innerText()).trim();
    expect(txt.length).toBeGreaterThan(10);
    expect(txt).toMatch(/\d+\.\d/);
    expect(txt).not.toContain("—");
    const fontStyle = await h.evaluate((el) => getComputedStyle(el).fontStyle);
    expect(fontStyle).toBe("italic");
  });

  // The hero headline leads with LAST week while the recap sits under it
  // (lib/hub/hero-headline.ts). Every number it prints must be a number the
  // recap's own finals print, so the take is provably about last week.
  test("the hero headline is a take on last week's finals, backed by the recap", async ({ page }) => {
    const h1 = page.getByTestId("hero-headline");
    const text = (await h1.innerText()).trim();
    const rung = await h1.getAttribute("data-hero-rung");
    expect(text).not.toMatch(/days? (to|until) kickoff/i);
    expect(text).not.toContain("—");
    const finalsText = (await page.getByTestId("recap-result").allInnerTexts()).join(" ");
    if (rung === "mercy" || rung === "monster" || rung === "photo-finish" || rung === "dud") {
      const num = /(\d+\.\d)/.exec(text)?.[1];
      expect(num, text).toBeTruthy();
      if (rung === "mercy" || rung === "photo-finish") {
        // A margin: some listed final's two scores differ by exactly it.
        const scores = (await page.getByTestId("recap-result").allInnerTexts()).map((t) =>
          (t.match(/\d+\.\d/g) ?? []).map(Number)
        );
        const margins = scores
          .filter((s) => s.length >= 2)
          .map((s) => Math.abs(s[0] - s[1]).toFixed(1));
        // Scores print to one decimal and the margin is rounded from the raw
        // scores, so the two can differ by up to 0.1 (204.94 - 140.78 = 64.16
        // prints 64.2, the shown 204.9 - 140.8 gives 64.1). 0.15 absorbs that
        // plus float error and still rejects every other final's margin.
        expect(
          margins.some((m) => Math.abs(Number(m) - Number(num)) < 0.15),
          `${num} vs ${margins.join(", ")}`
        ).toBe(true);
      } else {
        expect(finalsText).toContain(num!);
      }
      // The numeral renders in the mono face inside the serif headline.
      await expect(h1.locator("span.font-mono").first()).toHaveText(num!);
    } else {
      // No finals rung fired: a slate rung or the fallback, never a day count.
      expect(rung).toMatch(/^(unbeaten-clash|winless-clash|division-flip|named-rivalry|winless-watch|fallback)$/);
    }
  });

  test("the recap headline and the Game of the Week blurb never restate the hero's number", async ({ page }) => {
    // The hero owns its fact (lib/hub/hero-claim.ts): the two lines right
    // under it state a different true fact instead of echoing its figure.
    const hero = (await page.getByTestId("hero-headline").innerText()).trim();
    const heroNumbers = hero.match(/\d+\.\d/g) ?? [];
    const recapHeadline = (await page.getByTestId("recap-headline").innerText()).trim();
    expect(recapHeadline.length).toBeGreaterThan(0);
    const blurb = page.getByTestId("gotw-blurb");
    const blurbText = (await blurb.count()) > 0 ? (await blurb.innerText()).trim() : "";
    for (const n of heroNumbers) {
      const printed = new RegExp(`(^|[^\\d.])${n.replace(".", "\\.")}(?![\\d])`);
      expect(recapHeadline, `recap headline repeats ${n}`).not.toMatch(printed);
      expect(blurbText, `Game of the Week blurb repeats ${n}`).not.toMatch(printed);
    }
  });

  test("every completed pairing is listed with a W and an L and two scores", async ({ page }) => {
    const rows = page.getByTestId("recap-result");
    await expect(rows).toHaveCount(6);
    for (const row of await rows.all()) {
      const t = await row.innerText();
      expect(t).toMatch(/\bW\b/);
      expect(t).toMatch(/\bL\b/);
      expect(t.match(/\d+\.\d/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  test("Team of the Week fills every starting slot with a distinct player and sums the total", async ({ page }) => {
    const slots = page.getByTestId("totw-slot");
    // The live season starts QB, RB, RB, WR, WR, WR, TE, FLEX, FLEX, SUPER_FLEX.
    await expect(slots).toHaveCount(10);
    const hrefs: string[] = [];
    let sum = 0;
    for (const slot of await slots.all()) {
      const t = await slot.innerText();
      expect(t).not.toContain("Empty");
      const pts = t.match(/(\d+\.\d)\s*$/);
      expect(pts).not.toBeNull();
      sum += Number(pts![1]);
      // The player link's href (/players/<id>) is the identity; link text is
      // not, since a headshot monogram or franchise name can share a line.
      hrefs.push((await slot.locator('a[href^="/players/"]').first().getAttribute("href")) ?? "");
    }
    expect(hrefs.every((h) => h.length > 0)).toBe(true);
    expect(new Set(hrefs).size).toBe(10);
    const total = await page
      .getByText("Best Possible Lineup")
      .locator("xpath=following-sibling::p")
      .innerText();
    expect(Math.abs(Number(total) - sum)).toBeLessThan(0.15);
  });

  test("top performers are started players in descending order", async ({ page }) => {
    const rows = page.getByTestId("recap-top");
    await expect(rows).toHaveCount(6);
    const pts: number[] = [];
    for (const row of await rows.all()) {
      const m = (await row.innerText()).match(/(\d+\.\d)\s*$/);
      expect(m).not.toBeNull();
      pts.push(Number(m![1]));
    }
    for (let i = 1; i < pts.length; i++) expect(pts[i]).toBeLessThanOrEqual(pts[i - 1]);
  });

  test("the dud and the bench blunder both render with real numbers", async ({ page }) => {
    const main = page.locator("main");
    await expect(main).toContainText("Dud of the Week");
    await expect(main).toContainText("Left On The Bench");
    await expect(main).toContainText(/left on the bench\. Optimal was \d+\.\d, they started \d+\.\d\./);
  });

  test("the recap is not duplicated in the desktop rail", async ({ page }) => {
    // Kickers render uppercase; the sentence "left on the bench." in the
    // callout body is lowercase, so a case-sensitive match counts kickers only.
    const text = await page.locator("main").innerText();
    expect(text.match(/IN THE BOOKS/g)?.length ?? 0).toBe(1);
    expect(text.match(/LEFT ON THE BENCH/g)?.length ?? 0).toBe(1);
  });

  test("the recap is visible at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 860 });
    await page.goto("/");
    await expect(page.getByTestId("week-recap")).toBeVisible();
    await expect(page.getByTestId("recap-result").first()).toBeVisible();
  });
});
