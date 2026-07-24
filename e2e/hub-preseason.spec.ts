import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// ============================================================================
// 1a: Preseason Hub ("The Field")
//
// The preseason hub renders on "/" when the league is between the new season
// starting and Week 1 kicking off (seasonType === "pre"). Its signature is the
// "Title Defense Loading" hero kicker plus the "The Field" division module.
// Which hub state renders depends on the live NFL calendar + seeded data, so
// when the homepage is NOT in the preseason state these tests skip on a runtime
// condition (matching the story-3.1 hero-spec pattern) rather than blanket-skip.
// When the state IS active, the assertions below fail if any 1a module is
// missing, so a deleted/broken feature is caught.
// ============================================================================

/** True when "/" is currently rendering the 1a preseason hub. */
async function isPreseasonHub(page: Page): Promise<boolean> {
  const kicker = page.locator("p.text-kicker", { hasText: /Title Defense Loading/i });
  return (await kicker.count()) > 0;
}

test.describe("Preseason hub (1a)", () => {
  test("hero renders the countdown headline and dek", async ({ page }) => {
    await page.goto("/");
    if (!(await isPreseasonHub(page))) {
      test.skip(true, "Homepage is not in the preseason (1a) state");
      return;
    }

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
    if (!(await isPreseasonHub(page))) {
      test.skip(true, "Homepage is not in the preseason (1a) state");
      return;
    }

    const hero = page.locator("main section").first();
    const days = hero.getByText(/^Days$/i);
    // The countdown is hidden when neither a draft date nor a kickoff is
    // available; assert its shape only when it rendered.
    if ((await days.count()) > 0) {
      await expect(hero.getByText(/^Days$/i).first()).toBeVisible();
      await expect(hero.getByText(/^Hrs$/i).first()).toBeVisible();
      await expect(hero.getByText(/^Min$/i).first()).toBeVisible();
    }
  });

  test("The Field module renders division cards with teams", async ({ page }) => {
    await page.goto("/");
    if (!(await isPreseasonHub(page))) {
      test.skip(true, "Homepage is not in the preseason (1a) state");
      return;
    }

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
    if (!(await isPreseasonHub(page))) {
      test.skip(true, "Homepage is not in the preseason (1a) state");
      return;
    }

    await expect(
      page.locator("p.text-kicker", { hasText: /Burning Questions/i }).first(),
    ).toBeVisible();
    await expect(
      page.locator("p.text-kicker", { hasText: /The Smack Feed/i }).first(),
    ).toBeVisible();
  });

  test("Bold Predictions module renders verdict chips", async ({ page }) => {
    await page.goto("/");
    if (!(await isPreseasonHub(page))) {
      test.skip(true, "Homepage is not in the preseason (1a) state");
      return;
    }

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
    if (!(await isPreseasonHub(page))) {
      test.skip(true, "Homepage is not in the preseason (1a) state");
      return;
    }
    const text = await page.locator("main").innerText();
    expect(text).not.toContain("—");
    expect(text).not.toContain("–");
  });
});
