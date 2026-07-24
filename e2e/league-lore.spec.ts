import { test, expect } from "@playwright/test";

// ============================================================================
// League Lore module (Hall of Fame & Shame, Player Wing). Read-only against
// the real synced DB, no seeding/mutation: asserts against whatever
// getLeagueLore() currently returns. Mirrors e2e/hof-player-headshots.spec.ts
// conventions.
// ============================================================================

test.describe("League Lore", () => {
  test("renders exactly 12 cards including The Gunslinger and The Bust", async ({ page }) => {
    await page.goto("/records/hall-of-fame");
    await expect(page.locator("h1, h2").first()).toBeVisible();

    const loreGrid = page.getByTestId("player-wing-cards");
    if ((await loreGrid.count()) === 0) {
      test.skip(true, "No League Lore data synced; the module renders nothing.");
      return;
    }

    const cards = loreGrid.locator("> *");
    await expect(cards).toHaveCount(12);

    await expect(loreGrid.getByText("The Gunslinger")).toBeVisible();
    await expect(loreGrid.getByText("The Bust")).toBeVisible();

    const cardCount = await cards.count();
    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i);
      const monoNumerals = card.locator(".font-mono");
      await expect(monoNumerals.first()).toBeVisible();
    }
  });
});
