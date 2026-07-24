import { test, expect } from "@playwright/test";

// ============================================================================
// The Trophy Case (Hall of Fame & Shame): the "Yearly Hardware" subsection of
// The Player Wing module, surfacing the 15 commissioner-entered honors (5
// seasons x MVP / Finals MVP / Rookie of the Year) plus a per-season "Best
// Waiver Pickup" column computed from transactions + player_week_points.
// Read-only against the real DB; no seeding here. Scoped to the
// data-testid="trophy-case" block. Each row (award or waiver) renders a
// PlayerHeadshot, which always exposes role="img" with the player's name as
// its accessible name (whether the sleepercdn image loads or the initials
// monogram falls back), so the count assertion is robust to both outcomes.
//
// Pre-seed contract: the block renders nothing until league_awards AND the
// waiver computation are both empty, so the test skips cleanly when the
// block is absent rather than asserting fabricated data.
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

    // Four columns (MVP / Championship MVP / Rookie of the Year / Best
    // Waiver Pickup).
    await expect(
      trophyCase.getByText("Regular Season MVP", { exact: true }),
    ).toBeVisible();
    await expect(
      trophyCase.getByText("Championship MVP", { exact: true }),
    ).toBeVisible();
    await expect(
      trophyCase.getByText("Rookie of the Year", { exact: true }),
    ).toBeVisible();
    await expect(
      trophyCase.getByText("Best Waiver Pickup", { exact: true }),
    ).toBeVisible();

    // Every row (award or waiver) carries a player headshot (img role,
    // accessible-name = player name), tolerant of the monogram fallback. The
    // award seed is 15 winners across 5 completed seasons; the waiver column
    // adds one row per completed season (5), for 20 total.
    const headshots = trophyCase.getByRole("img");
    await expect(headshots.first()).toBeVisible();
    expect(await headshots.count()).toBe(20);

    // Waiver rows show their points as a right-aligned gold mono numeral.
    await expect(
      trophyCase.getByText("174.4", { exact: true }),
    ).toBeVisible();

    // 2022's waiver-wire winner is a stable historical fact (moved here from
    // the championships Trophy Case page, which no longer shows waivers).
    await expect(trophyCase.getByText("Geno Smith")).toBeVisible();
  });
});
