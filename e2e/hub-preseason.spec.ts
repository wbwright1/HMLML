import { test, expect } from "@playwright/test";

// ============================================================================
// 1a: Preseason Hub ("The Field")
//
// Runs under the "hub-preseason" Playwright project, whose dev server is
// pinned to NFL_STATE_OVERRIDE=pre:1 (playwright.config.ts). The preseason
// state is therefore a precondition of the project, not a runtime guess: no
// test in this file skips based on the live NFL calendar. If the preseason
// hub stops rendering, these go red instead of quietly self-skipping (#249).
// ============================================================================

test.describe("Preseason hub (1a)", () => {
  test("hero renders the countdown headline and dek", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.locator("p.text-kicker", { hasText: /Title Defense Loading/i }).first(),
    ).toBeVisible();

    const hero = page.locator("main section").first();
    await expect(hero.locator("h1")).toContainText(/on the clock/i);

    // Headline uses the serif display family, italic.
    const fontStyle = await hero
      .locator("h1")
      .evaluate((el) => getComputedStyle(el).fontStyle);
    expect(fontStyle).toBe("italic");

    // Dek is present and mentions the 0-0 preseason framing.
    await expect(hero).toContainText(/0-0/);
  });

  test("countdown cards render DAYS / HRS / MIN when the schedule is synced", async ({
    page,
  }) => {
    await page.goto("/");

    const hero = page.locator("main section").first();
    const days = hero.getByText(/^Days$/i);
    const hrs = hero.getByText(/^Hrs$/i);
    const min = hero.getByText(/^Min$/i);
    // The countdown is hidden when neither a draft date nor a kickoff is
    // available. Assert its shape is all-or-nothing rather than short-
    // circuiting on the first element, so a half-rendered countdown fails.
    const daysCount = await days.count();
    if (daysCount > 0) {
      await expect(days.first()).toBeVisible();
      await expect(hrs.first()).toBeVisible();
      await expect(min.first()).toBeVisible();
    } else {
      expect(await hrs.count()).toBe(0);
      expect(await min.count()).toBe(0);
    }
  });

  test("The Field module renders division cards with teams", async ({ page }) => {
    await page.goto("/");

    // The module label.
    await expect(page.locator("p.text-kicker", { hasText: /The Field/i }).first()).toBeVisible();

    // At least one franchise crest (dynasty logo) renders inside the field.
    const crests = page.locator("main img");
    expect(await crests.count()).toBeGreaterThan(0);

    // A last-season tag or record appears: CHAMP / R-UP / DOORMAT, or a W-L.
    const bodyText = await page.locator("main").innerText();
    expect(bodyText).toMatch(/CHAMP|R-UP|DOORMAT|\d+-\d+/);
  });

  test("Burning Questions and Smack Feed rails render", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.locator("p.text-kicker", { hasText: /Burning Questions/i }).first(),
    ).toBeVisible();
    await expect(
      page.locator("p.text-kicker", { hasText: /The Smack Feed/i }).first(),
    ).toBeVisible();
  });

  test("Bold Predictions module renders verdict chips", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.locator("p.text-kicker", { hasText: /Bold Predictions/i }).first(),
    ).toBeVisible();
    // At least one verdict is a text chip (LOCK / NO), never color-only.
    const bodyText = await page.locator("main").innerText();
    expect(bodyText).toMatch(/LOCK|NO/);

    // Prediction card count is always even and capped at 6, so the two-column
    // grid never leaves a lone orphan card on the last row.
    const section = page.locator("section", {
      has: page.locator("p.text-kicker", { hasText: /Bold Predictions/i }),
    });
    const cardCount = await section.locator("div.card-surface").count();
    expect(cardCount % 2).toBe(0);
    expect(cardCount).toBeLessThanOrEqual(6);
  });

  test("hub copy contains no em-dashes", async ({ page }) => {
    await page.goto("/");
    const text = await page.locator("main").innerText();
    expect(text).not.toContain("—");
    expect(text).not.toContain("–");
  });
});
