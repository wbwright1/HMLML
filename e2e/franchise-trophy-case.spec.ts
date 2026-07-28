import { test, expect } from "@playwright/test";

// ============================================================================
// Issue #135: Franchise Trophy Case — horizontal hardware rail merging
// championships (franchise.seasonHistory, playoffResult === "champion") and
// player-level league awards (getFranchiseAwards) on a franchise page.
//
// Read-only against the real synced DB, no seeding/mutation. Foopus won the
// 2023 championship and its roster earned all three 2023 league awards
// (Regular Season MVP, Championship MVP, Rookie of the Year), so it is a
// known-hardware franchise. Of Mice and Mendoza has zero championships and
// zero league awards, so it is a known hardware-less franchise. These are
// HARD assertions, not skip-guards: a regression that empties the rail or
// renders it for a hardware-less franchise MUST fail this suite.
// ============================================================================

test.describe("Franchise Trophy Case", () => {
  test("a franchise with hardware shows the Trophy Case with its championship year", async ({
    page,
  }) => {
    await page.goto("/teams/foopus");

    const trophyCase = page.getByTestId("franchise-trophy-case");
    await expect(trophyCase).toBeVisible();

    // 2023 championship year appears in the rail.
    await expect(trophyCase.getByText("2023").first()).toBeVisible();

    // League Champion badge for the championship card.
    await expect(trophyCase.getByText("League Champion").first()).toBeVisible();

    // The three 2023 player awards this franchise's roster earned.
    await expect(trophyCase.getByText("Christian McCaffrey")).toBeVisible();
    await expect(trophyCase.getByText("Jerome Ford")).toBeVisible();
    await expect(trophyCase.getByText("Puka Nacua")).toBeVisible();
  });

  test("the champion medallion shows the bowl name, a W-L record, and links to that season's playoffs", async ({
    page,
  }) => {
    await page.goto("/teams/foopus");

    const trophyCase = page.getByTestId("franchise-trophy-case");
    await expect(trophyCase).toBeVisible();
    await expect(trophyCase.getByText("HMLML Bowl III")).toBeVisible();
    await expect(trophyCase.getByText(/\d+–\d+/).first()).toBeVisible();

    const championLink = trophyCase.locator('a[href="/playoffs/2023"]');
    await expect(championLink).toHaveCount(1);
  });

  test("a player award medallion links to the player profile route", async ({
    page,
  }) => {
    await page.goto("/teams/foopus");

    const trophyCase = page.getByTestId("franchise-trophy-case");
    await expect(trophyCase).toBeVisible();

    const playerLink = trophyCase.locator('a[href^="/players/"]').first();
    await expect(playerLink).toBeVisible();
  });

  test("a hardware-less franchise renders no Trophy Case section", async ({
    page,
  }) => {
    await page.goto("/teams/of-mice-and-mendoza");

    await expect(page.getByTestId("franchise-trophy-case")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Trophy Case" })).toHaveCount(0);
  });

  test("the rail scrolls horizontally on mobile and desktop widths", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/teams/foopus");

    const trophyCase = page.getByTestId("franchise-trophy-case");
    await expect(trophyCase).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/teams/foopus");
    await expect(page.getByTestId("franchise-trophy-case")).toBeVisible();
  });
});
