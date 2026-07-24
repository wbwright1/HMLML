import { test, expect } from "@playwright/test";

// ============================================================================
// The Trophy Case (Hall of Fame & Shame): the "Yearly Hardware" subsection of
// The Player Wing module, surfacing the 15 commissioner-entered honors (5
// seasons x MVP / Finals MVP / Rookie of the Year). Read-only against the
// real DB; no seeding here. Scoped to the data-testid="trophy-case" block.
// Each award row renders a PlayerHeadshot, which always exposes role="img"
// with the player's name as its accessible name (whether the sleepercdn
// image loads or the initials monogram falls back), so the count assertion
// is robust to both outcomes.
//
// Pre-seed contract: the block renders nothing until league_awards is
// populated, so the test skips cleanly when the block is absent rather than
// asserting fabricated data.
// ============================================================================

test.describe("The Trophy Case", () => {
  test("renders the seeded league-award winners with headshots", async ({
    page,
  }) => {
    await page.goto("/records/hall-of-fame");
    await expect(page.locator("h1, h2").first()).toBeVisible();

    // The Player Wing module (parent of Trophy Case + League Lore) is titled.
    await expect(
      page.getByRole("heading", { name: "The Player Wing" }),
    ).toBeVisible();

    // The live DB is seeded with 15 award rows; the block must render.
    // A missing block means the feature (or its query) regressed.
    const trophyCase = page.getByTestId("trophy-case");
    await expect(trophyCase).toBeVisible();

    // "Yearly Hardware" subheading present inside the Player Wing section.
    await expect(trophyCase.getByText("Yearly Hardware")).toBeVisible();
    await expect(
      trophyCase.getByRole("heading", { name: "The Trophy Case" }),
    ).toBeVisible();

    // Three award columns (MVP / Championship MVP / Rookie of the Year).
    await expect(
      trophyCase.getByText("Regular Season MVP", { exact: true }),
    ).toBeVisible();
    await expect(
      trophyCase.getByText("Championship MVP", { exact: true }),
    ).toBeVisible();
    await expect(
      trophyCase.getByText("Rookie of the Year", { exact: true }),
    ).toBeVisible();

    // Every award row carries a player headshot (img role, accessible-name =
    // player name), tolerant of the monogram fallback. The full seed is 15
    // winners across 5 completed seasons.
    const headshots = trophyCase.getByRole("img");
    await expect(headshots.first()).toBeVisible();
    expect(await headshots.count()).toBe(15);
  });
});
