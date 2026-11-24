import { test, expect } from "@playwright/test";
import { isRecapWindowOpen } from "../lib/hub/week-recap";

// ============================================================================
// Post-week recap on the between-weeks hub
//
// The Tuesday-morning week roll through Thursday kickoff: the prior week is
// fully complete, the next slate is set, nothing has kicked off. The hub must
// LEAD with last week's recap (the Week N wrap tiles, including the dud and
// the bench blunder, then Final scores and Team of the week) in the main column, so a phone sees it
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

/** The slate meta's schedule clause: the kickoff day, or the slate fallback. */
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
      await expect(page.getByTestId("slate-meta")).toContainText(HERO_SCHEDULE_TAIL);
      await expect(page.getByTestId("week-recap")).toHaveCount(0);
      await expect(page.locator("main")).toContainText(/Week \d+ wrap/);
      test.skip(true, "recap window closed (post Thursday cron); slate-only state asserted");
    }
  });

  test("the recap block renders in the main column above the slate", async ({ page }) => {
    const main = page.locator("main");
    await expect(page.getByTestId("slate-meta")).toContainText(HERO_SCHEDULE_TAIL);
    const recap = page.getByTestId("week-recap");
    await expect(recap).toBeVisible();
    // Recap precedes Game of the week in document order (labels are
    // sentence case now, no CSS uppercase).
    const text = await main.innerText();
    const recapAt = text.search(/Week \d+ wrap/);
    expect(recapAt).toBeGreaterThan(-1);
    expect(recapAt).toBeLessThan(text.indexOf("Game of the week"));
  });

  test("the wrap is nickname stat tiles only: no serif headline, no No-show tile", async ({ page }) => {
    // The serif sentence headline restated the hero, and the hero owns the
    // week's low score, so both are gone (UI/UX pass, 2026-11-24).
    await expect(page.getByTestId("recap-headline")).toHaveCount(0);
    const tiles = page.getByTestId("recap-tile");
    expect(await tiles.count()).toBeGreaterThanOrEqual(3);
    const labels = (await tiles.locator("p.text-kicker").allInnerTexts()).map((t) => t.trim());
    expect(labels).not.toContain("No-show");
    for (const l of labels) {
      expect(l).toMatch(/^(Boom game|Mercy rule|Photo finish|Dud of the week|Coaching malpractice)$/);
    }
    for (const tile of await tiles.all()) {
      const value = tile.locator("p.text-stat");
      await expect(value).toHaveText(/^\+?\d+\.\d$/);
    }
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
      // The numeral stays in the serif: the headline is one run, no mono span.
      await expect(h1.locator("span.font-mono")).toHaveCount(0);
    } else {
      // No finals rung fired: a slate rung or the fallback, never a day count.
      expect(rung).toMatch(/^(unbeaten-clash|winless-clash|division-flip|named-rivalry|winless-watch|fallback)$/);
    }
  });

  test("the hero's fact line and the Game of the week blurb never restate the headline's number", async ({ page }) => {
    // The hero owns its fact (lib/hub/hero-claim.ts): the line under it is
    // one plain companion fact, and the blurb states a different true fact.
    const hero = (await page.getByTestId("hero-headline").innerText()).trim();
    const heroNumbers = hero.match(/\d+\.\d/g) ?? [];
    const dek = (await page.getByTestId("hero-dek").innerText()).trim();
    expect(dek.length).toBeGreaterThan(0);
    const blurb = page.getByTestId("gotw-blurb");
    const blurbText = (await blurb.count()) > 0 ? (await blurb.innerText()).trim() : "";
    for (const n of heroNumbers) {
      const printed = new RegExp(`(^|[^\\d.])${n.replace(".", "\\.")}(?![\\d])`);
      expect(dek, `hero fact line repeats ${n}`).not.toMatch(printed);
      expect(blurbText, `Game of the week blurb repeats ${n}`).not.toMatch(printed);
    }
  });

  test("every completed pairing is one 44px link row with a W, an L and two scores", async ({ page }) => {
    const rows = page.getByTestId("recap-result");
    await expect(rows).toHaveCount(6);
    for (const row of await rows.all()) {
      await expect(row).toHaveAttribute("href", /^\/matchups\/\d{4}\/\d+\/\d+$/);
      expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
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
      // The row IS the player link; its href (/players/<id>) is the
      // identity, since a franchise name can share a line.
      hrefs.push(
        (await slot.locator("xpath=ancestor::a[1]").getAttribute("href")) ?? ""
      );
    }
    expect(hrefs.every((h) => /^\/players\//.test(h))).toBe(true);
    expect(new Set(hrefs).size).toBe(10);
    const total = await page.getByTestId("totw-total").locator("span.text-stat").innerText();
    expect(Math.abs(Number(total) - sum)).toBeLessThan(0.15);
  });

  test("Top performers is folded into Team of the week, not listed twice", async ({ page }) => {
    await expect(page.getByTestId("recap-top")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText(/Top performers/i);
  });

  test("the dud and the bench blunder render as wrap tiles with real numbers", async ({ page }) => {
    const tiles = page.getByTestId("recap-tile");
    const dud = tiles.filter({ has: page.getByText("Dud of the week", { exact: true }) });
    await expect(dud).toHaveCount(1);
    await expect(dud.locator("p.text-stat")).toHaveText(/^\d+\.\d$/);
    await expect(dud.locator('a[href^="/players/"]')).toHaveCount(1);
    const bench = tiles.filter({ has: page.getByText("Coaching malpractice", { exact: true }) });
    await expect(bench).toHaveCount(1);
    await expect(bench.locator("p.text-stat")).toHaveText(/^\d+\.\d$/);
    await expect(bench).toContainText(/left on the bench/);
    await expect(bench.locator('a[href^="/teams/"]')).toHaveCount(1);
  });

  test("the recap is not duplicated in the desktop rail", async ({ page }) => {
    const text = await page.locator("main").innerText();
    expect(text.match(/Week \d+ wrap/g)?.length ?? 0).toBe(1);
    // The rail's bench fallback stays off while the recap carries the tile.
    await expect(page.getByText("Left on the bench", { exact: true })).toHaveCount(0);
  });

  test("the recap is visible at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 860 });
    await page.goto("/");
    await expect(page.getByTestId("week-recap")).toBeVisible();
    await expect(page.getByTestId("recap-result").first()).toBeVisible();
  });
});
