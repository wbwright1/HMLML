import { test, expect, type Page } from "@playwright/test";

// ============================================================================
// Issues #200 / #201: /playoffs/[year] now renders the real persisted bracket
// (both the winners bracket and the inverted Toilet Bowl) instead of guessing
// pairings from flat matchup rows, and the Toilet Bowl champion is crowned
// across the shame surfaces.
//
// THE ASSERTION THAT MATTERS: the losers bracket advances the team that LOSES.
// In the 2023 Toilet Bowl final, Bucky's General Store scored 119.98 and Olave
// Garden scored 109.22, and Olave Garden is the one that sank to last place. A
// naive implementation that marks the higher scorer as the winner passes every
// other test in this file and fails the inversion tests below. That is the
// whole point of this spec.
//
// Read-only against the real synced DB, running against the full stack. No
// mocks, no seeding.
// ============================================================================

/** The bracket card for a specific Sleeper match number. */
function match(page: Page, bracket: "winners" | "losers", matchNumber: number) {
  return page.getByTestId(`bracket-match-${bracket}-${matchNumber}`);
}

test.describe("2023 playoff bracket (/playoffs/2023)", () => {
  test("renders both brackets with all seven winners matches", async ({
    page,
  }) => {
    await page.goto("/playoffs/2023");

    await expect(page.getByTestId("bracket-winners")).toBeVisible();
    await expect(page.getByTestId("bracket-losers")).toBeVisible();

    // Sleeper serves 7 winners matches for a 6-team, 3-round bracket.
    for (const m of [1, 2, 3, 4, 5, 6, 7]) {
      await expect(match(page, "winners", m)).toBeVisible();
    }

    // Rounds are labelled from the end of the bracket, with the week alongside.
    const winners = page.getByTestId("bracket-winners");
    await expect(winners.getByText("Quarterfinals")).toBeVisible();
    await expect(winners.getByText("Semifinals")).toBeVisible();
    await expect(winners.getByText("Championship").first()).toBeVisible();
  });

  test("the championship shows the real pairing, scores and winner", async ({
    page,
  }) => {
    await page.goto("/playoffs/2023");

    // Match 6, p=1: roster 6 beat roster 7, 158.84 to 131.54.
    const title = match(page, "winners", 6);
    await expect(title).toBeVisible();
    await expect(title).toContainText("158.84");
    await expect(title).toContainText("131.54");

    // The higher scorer carries the ADVANCES badge; the other is OUT.
    await expect(title).toContainText("ADVANCES");
    await expect(title).toContainText("OUT");

    // The row marked as advancing is the 158.84 one, not the 131.54 one.
    const advancingRow = title.locator('[data-state="advanced"]');
    await expect(advancingRow).toHaveCount(1);
    await expect(advancingRow).toContainText("158.84");
    await expect(advancingRow).not.toContainText("131.54");
  });

  test("the placement games are labelled, not mistaken for semifinals", async ({
    page,
  }) => {
    await page.goto("/playoffs/2023");

    await expect(match(page, "winners", 7)).toContainText("3rd Place Game");
    await expect(match(page, "winners", 5)).toContainText("5th Place Game");
    // Losers-bracket placements count up from the bottom of a 12-team league.
    await expect(match(page, "losers", 7)).toContainText("9th Place Game");
    await expect(match(page, "losers", 5)).toContainText("7th Place Game");
  });

  test("THE INVERSION: the Toilet Bowl final advances the LOWER scorer", async ({
    page,
  }) => {
    await page.goto("/playoffs/2023");

    const final = match(page, "losers", 6);
    await expect(final).toBeVisible();
    await expect(final).toContainText("Toilet Bowl Final");
    await expect(final).toContainText("109.22");
    await expect(final).toContainText("119.98");

    // Olave Garden scored 109.22 and is the team that sank. A renderer that
    // compares points would mark the 119.98 team instead and fail here.
    const sankRow = final.locator('[data-state="advanced"]');
    await expect(sankRow).toHaveCount(1);
    await expect(sankRow).toContainText("Olave Garden");
    await expect(sankRow).toContainText("109.22");
    await expect(sankRow).toContainText("SANK");

    // The higher scorer escaped the bottom, and must NOT be badged as sinking.
    const escapedRow = final.locator('[data-state="eliminated"]');
    await expect(escapedRow).toHaveCount(1);
    await expect(escapedRow).toContainText("Bucky");
    await expect(escapedRow).toContainText("119.98");
    await expect(escapedRow).toContainText("ESCAPED");

    // No "W" glyph anywhere in the Toilet Bowl: the advancing team lost.
    await expect(final).not.toContainText("ADVANCES");
  });

  test("the Toilet Bowl carries the explainer so the inversion never confuses", async ({
    page,
  }) => {
    await page.goto("/playoffs/2023");
    await expect(
      page.getByText("In the Toilet Bowl, losing advances you.", {
        exact: false,
      }),
    ).toBeVisible();
  });

  test("the Sting card names Olave Garden as Toilet Bowl Champion", async ({
    page,
  }) => {
    await page.goto("/playoffs/2023");

    const sting = page.getByTestId("toilet-bowl-sting");
    await expect(sting).toBeVisible();
    await expect(sting).toContainText("Olave Garden");
    // The centralized snarky label, not hardcoded copy.
    await expect(sting).toContainText("Toilet Bowl Champion");
    await expect(sting).toContainText("finished dead last");
  });
});

test.describe("bracket shape regressions", () => {
  test("2021 renders its 2-round losers bracket without error", async ({
    page,
  }) => {
    await page.goto("/playoffs/2021");

    const losers = page.getByTestId("bracket-losers");
    await expect(losers).toBeVisible();
    // Two rounds only, while the winners bracket has three.
    await expect(losers.getByText("Toilet Bowl Round 1")).toBeVisible();
    await expect(losers.getByText("Toilet Bowl Final").first()).toBeVisible();
    await expect(losers.getByText("Toilet Bowl Round 3")).toHaveCount(0);

    await expect(page.getByTestId("bracket-winners")).toBeVisible();

    // 2021's Toilet Bowl champion is Bucky's General Store (roster 9).
    await expect(page.getByTestId("toilet-bowl-sting")).toContainText("Bucky");
  });

  test("2026 renders in-progress brackets with TBD slots and crowns nobody", async ({
    page,
  }) => {
    await page.goto("/playoffs/2026");

    await expect(page.getByTestId("bracket-winners")).toBeVisible();
    await expect(page.getByTestId("bracket-losers")).toBeVisible();

    // Unresolved slots say TBD and name the match that feeds them.
    await expect(page.getByText("TBD from match 3").first()).toBeVisible();

    // Nothing is decided, so no advancement badges and no champion.
    await expect(page.getByText("SANK")).toHaveCount(0);
    await expect(page.getByTestId("toilet-bowl-sting")).toHaveCount(0);
  });
});

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("rounds stack vertically with no horizontal page scroll", async ({
    page,
  }) => {
    await page.goto("/playoffs/2023");
    await expect(page.getByTestId("bracket-winners")).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);

    // Round groups are stacked: each round card starts below the previous one.
    const rounds = page
      .getByTestId("bracket-winners")
      .locator("> div.card-surface");
    await expect(rounds).toHaveCount(3);

    const first = await rounds.nth(0).boundingBox();
    const second = await rounds.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.y).toBeGreaterThan(first!.y + first!.height - 1);
  });
});

test.describe("#201: the Toilet Bowl champion across the shame surfaces", () => {
  test("the league Trophy Case has a tarnished Toilet Bowl shelf", async ({
    page,
  }) => {
    await page.goto("/records/trophies");

    const shelf = page.getByTestId("league-trophy-shelf");
    await expect(shelf).toBeVisible();
    await expect(shelf.getByText("Toilet Bowl Champion")).toBeVisible();

    // 2023's entry names Olave Garden and links to that season's bracket.
    const entry = shelf.getByRole("link", { name: /Olave Garden.*2023/ });
    await expect(entry).toBeVisible();
    await expect(entry).toHaveAttribute("href", "/playoffs/2023");
  });

  test("the Hall of Fame & Shame has a Basement section with a known season", async ({
    page,
  }) => {
    await page.goto("/records/hall-of-fame");

    const basement = page.getByTestId("hall-of-shame-toilet-bowl");
    await expect(basement).toBeVisible();
    await expect(basement).toContainText("The Basement");
    // 2025's Toilet Bowl champion is Latter Day Lamb Special.
    await expect(basement).toContainText("Latter Day Lamb Special");
    await expect(basement).toContainText("2025");
  });

  test("the season page calls out the Toilet Bowl champion", async ({
    page,
  }) => {
    await page.goto("/seasons/2023");

    const sting = page.getByTestId("season-toilet-bowl-sting");
    await expect(sting).toBeVisible();
    await expect(sting).toContainText("Olave Garden");
    await expect(sting).toContainText("Toilet Bowl Champion");
  });

  test("a franchise trophy case shows its Toilet Bowl seasons", async ({
    page,
  }) => {
    await page.goto("/teams/olave-garden");

    const trophyCase = page.getByTestId("franchise-trophy-case");
    await expect(trophyCase).toBeVisible();
    await expect(trophyCase.getByText("Toilet Bowl Champion")).toBeVisible();
    await expect(trophyCase).toContainText("Finished dead last");
  });
});
