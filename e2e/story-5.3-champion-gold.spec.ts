import { test, expect } from "@playwright/test";

test.describe("Story 5.3: Season Champion Gold Highlight", () => {
  /**
   * Helper: discover season URLs from the /seasons index page, then find one
   * that has (or lacks) a champion highlight. Uses allTextContents to avoid
   * auto-wait timeouts on .nth() locators.
   */
  async function findSeasonUrl(
    page: import("@playwright/test").Page,
    withChampion: boolean
  ): Promise<string | null> {
    await page.goto("/seasons");
    await page.waitForLoadState("domcontentloaded");

    // Gather all links on the page that point to /seasons/YYYY
    const allLinks = await page.locator("a").all();
    const seasonHrefs: string[] = [];
    for (const link of allLinks) {
      const href = await link.getAttribute("href");
      if (href && /^\/seasons\/\d{4}$/.test(href) && !seasonHrefs.includes(href)) {
        seasonHrefs.push(href);
      }
    }

    for (const href of seasonHrefs) {
      await page.goto(href);
      await page.waitForLoadState("domcontentloaded");
      const championSection = page.locator('[class*="bg-gold"]');
      const hasChampion = (await championSection.count()) > 0;
      if (hasChampion === withChampion) {
        return href;
      }
    }

    return null;
  }

  test("champion section has gold-tinted background and border", async ({
    page,
  }) => {
    const url = await findSeasonUrl(page, true);
    test.skip(!url, "No season with a champion found in database");
    await page.goto(url!);

    // The champion container should have bg-gold/5 class (gold at 5% opacity)
    const goldBgSection = page.locator('[class*="bg-gold"]');
    await expect(goldBgSection.first()).toBeVisible();

    // Verify it also has the gold border class
    const goldBorderSection = page.locator('[class*="border-gold"]');
    await expect(goldBorderSection.first()).toBeVisible();
  });

  test("champion section contains ChampionshipStars SVG elements", async ({
    page,
  }) => {
    const url = await findSeasonUrl(page, true);
    test.skip(!url, "No season with a champion found in database");
    await page.goto(url!);

    // ChampionshipStars renders with role="img" and an aria-label containing "championship"
    const starsContainer = page.locator(
      '[role="img"][aria-label*="championship"]'
    );
    await expect(starsContainer.first()).toBeVisible();

    // Inside the stars container, there should be at least one SVG star element
    const svgStars = starsContainer.first().locator("svg");
    const starCount = await svgStars.count();
    expect(starCount).toBeGreaterThanOrEqual(1);
  });

  test("champion section contains League Champion SuperlativeBadge", async ({
    page,
  }) => {
    const url = await findSeasonUrl(page, true);
    test.skip(!url, "No season with a champion found in database");
    await page.goto(url!);

    // The gold-background champion section should contain the "League Champion" badge
    const goldSection = page.locator('[class*="bg-gold"]').first();
    const badge = goldSection.getByText("League Champion", { exact: true });
    await expect(badge).toBeVisible();

    // Badge should use gold variant styling classes
    await expect(badge).toHaveClass(/bg-gold/);
    await expect(badge).toHaveClass(/text-gold/);
  });

  test("champion name is displayed within the gold section", async ({
    page,
  }) => {
    const url = await findSeasonUrl(page, true);
    test.skip(!url, "No season with a champion found in database");
    await page.goto(url!);

    // The champion section should have a paragraph with the text-h3 class (champion name)
    const goldSection = page.locator('[class*="bg-gold"]').first();
    const championName = goldSection.locator("p");
    await expect(championName).toBeVisible();

    // Champion name should not be empty
    const nameText = await championName.textContent();
    expect(nameText?.trim().length).toBeGreaterThan(0);
  });

  test("season without a champion has no champion highlight section", async ({
    page,
  }) => {
    const url = await findSeasonUrl(page, false);
    test.skip(!url, "No season without a champion found in database");
    await page.goto(url!);

    // There should be no gold-tinted champion highlight section
    const goldBgSection = page.locator('[class*="bg-gold"]');
    await expect(goldBgSection).toHaveCount(0);

    // No "League Champion" badge should appear in the champion section area
    const championBadge = page.getByText("League Champion", { exact: true });
    await expect(championBadge).toHaveCount(0);
  });

  test("champion stars have hero variant at 20px size", async ({ page }) => {
    const url = await findSeasonUrl(page, true);
    test.skip(!url, "No season with a champion found in database");
    await page.goto(url!);

    // Stars in hero variant are rendered at 20px (width and height on SVG)
    const starsContainer = page.locator(
      '[role="img"][aria-label*="championship"]'
    );
    const firstStar = starsContainer.first().locator("svg").first();
    await expect(firstStar).toBeVisible();

    // Lucide Star renders with width/height attributes matching the size prop
    const width = await firstStar.getAttribute("width");
    const height = await firstStar.getAttribute("height");
    expect(width).toBe("20");
    expect(height).toBe("20");
  });

  test("champion section has centered layout with rounded corners", async ({
    page,
  }) => {
    const url = await findSeasonUrl(page, true);
    test.skip(!url, "No season with a champion found in database");
    await page.goto(url!);

    // The champion container should have text-center and rounded-xl classes
    const goldSection = page.locator('[class*="bg-gold"]').first();
    await expect(goldSection).toHaveClass(/text-center/);
    await expect(goldSection).toHaveClass(/rounded-xl/);
  });
});
