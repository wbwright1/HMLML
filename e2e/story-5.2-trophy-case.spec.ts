import { test, expect } from "@playwright/test";

test.describe("Story 5.2: Trophy Case Enhancement", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/records/trophies");
  });

  test("trophy case page loads and section exists", async ({ page }) => {
    // Page should have the Trophy Case heading
    await expect(page.getByRole("heading", { name: /trophy case/i })).toBeVisible();
    // Year-by-Year section should exist
    await expect(page.getByRole("heading", { name: /championships/i })).toBeVisible();
  });

  test("most recent champion has prominent StatHero display", async ({ page }) => {
    // The featured champion section uses StatHero with lg variant, which renders
    // a large season year number and "Reigning Champion" label
    const reigningLabel = page.getByText("Reigning Champion");
    // If there are trophies, the featured section should be visible
    const trophySection = page.locator('[class*="border-gold"]');
    const count = await trophySection.count();
    if (count > 0) {
      await expect(reigningLabel).toBeVisible();
    }
  });

  test("'League Champion' badge text is present, not just 'Champion'", async ({ page }) => {
    // All champion badges should say "League Champion", not bare "Champion"
    const leagueChampBadges = page.getByText("League Champion", { exact: true });
    const count = await leagueChampBadges.count();

    // If there are any champions, there should be at least one "League Champion" badge
    const anyChampionData = page.locator('[class*="border-primary"]');
    const champCount = await anyChampionData.count();
    if (champCount > 0) {
      expect(count).toBeGreaterThan(0);
    }

    // Ensure no standalone "Champion" badge without "League" prefix exists
    // (except for the "Nx League Champion" badges in the all-time section and "No Champion")
    const allBadgeTexts = await page.locator("span").allTextContents();
    for (const text of allBadgeTexts) {
      const trimmed = text.trim();
      if (trimmed === "Champion") {
        throw new Error(
          'Found bare "Champion" badge text. All champion badges should read "League Champion" per FR19.'
        );
      }
    }
  });

  test("championship entries show franchise identity info", async ({ page }) => {
    // FranchiseIdentity component renders a franchise logo (via FranchiseLogo)
    // which uses an img or a colored circle with abbreviation text.
    // Check that champion entries contain franchise identity elements.
    const featuredSection = page.locator('[class*="border-gold"]');
    const hasFeatured = (await featuredSection.count()) > 0;
    if (hasFeatured) {
      // The FranchiseIdentity hero variant should be present in the featured section
      // It renders the franchise name and championship stars
      const franchiseName = featuredSection.locator("h1, span").first();
      await expect(franchiseName).toBeVisible();
    }

    // Historical champion rows should also have FranchiseIdentity (compact variant)
    // which renders a franchise logo and name
    const historicalRows = page.locator('[class*="border-primary/30"]');
    const rowCount = await historicalRows.count();
    // Featured section also has border-primary, so check the non-gold ones
    if (rowCount > 1) {
      // Each row should have franchise identity content (logo + name)
      const secondRow = historicalRows.nth(1);
      const nameEl = secondRow.locator("span").first();
      await expect(nameEl).toBeVisible();
    }
  });

  test("historical champions are in chronological order (descending)", async ({ page }) => {
    // Year links in the historical section should be in descending order
    const yearLinks = page.locator('a[href^="/seasons/"]');
    const count = await yearLinks.count();
    if (count >= 2) {
      const years: number[] = [];
      for (let i = 0; i < count; i++) {
        const text = await yearLinks.nth(i).textContent();
        const year = parseInt(text?.trim() ?? "0", 10);
        if (!isNaN(year) && year > 0) {
          years.push(year);
        }
      }
      // Verify descending order
      for (let i = 1; i < years.length; i++) {
        expect(years[i]).toBeLessThan(years[i - 1]);
      }
    }
  });

  test("all-time championship leaders section uses FranchiseIdentity", async ({ page }) => {
    const leadersSection = page.getByRole("heading", { name: /championship leaders/i });
    const hasLeaders = (await leadersSection.count()) > 0;
    if (hasLeaders) {
      // The leaders section should contain "League Champion" badge text
      const leaderCards = page.locator('[class*="border-primary/30"][class*="bg-primary/5"]');
      const cardCount = await leaderCards.count();
      if (cardCount > 0) {
        // Each leader card should have franchise identity content
        const firstCard = leaderCards.first();
        // FranchiseIdentity renders franchise name in a span with font-semibold
        const nameSpan = firstCard.locator(".font-semibold").first();
        await expect(nameSpan).toBeVisible();
      }
    }
  });
});
