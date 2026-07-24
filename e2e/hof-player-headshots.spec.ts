import { test, expect } from "@playwright/test";

// ============================================================================
// Player Wing headshots (Hall of Fame & Shame) + Franchise Cornerstone card
// (team page). Read-only against the real synced DB, no seeding/mutation:
// asserts against whatever the Player Wing / cornerstone queries currently
// return. PlayerHeadshot always renders role="img" with the player's name as
// the accessible name, whether the sleepercdn image loads or falls back to
// the initials monogram — so this assertion is robust to both outcomes and
// never touches the sleepercdn URL itself (next/image rewrites it).
// ============================================================================

test.describe("Hall of Fame Player Wing headshots", () => {
  test("Wanderer / Waiver Yo-Yo / League Cornerstone cards render a player headshot", async ({
    page,
  }) => {
    await page.goto("/records/hall-of-fame");
    await expect(page.locator("h1, h2").first()).toBeVisible();

    const cardHeadings = page.locator(
      "text=Wanderer, text=Waiver Yo-Yo, text=League Cornerstone"
    );

    // Small-N league data: the Player Wing renders nothing when every
    // underlying query is empty. Skip-guard mirrors the component's own
    // "render nothing" contract rather than asserting fabricated data.
    const headingCount = await page
      .getByText(/Wanderer|Waiver Yo-Yo|League Cornerstone/)
      .count();
    if (headingCount === 0) {
      test.skip(true, "No player-lore data synced; Player Wing renders nothing.");
      return;
    }

    // Each populated card names a player (h3) immediately preceded by a
    // headshot with a matching accessible name.
    const playerNames = await page.locator("p.text-h3").allTextContents();
    expect(playerNames.length).toBeGreaterThan(0);

    for (const name of playerNames) {
      const headshot = page.getByRole("img", { name }).first();
      await expect(headshot).toBeVisible();
    }

    void cardHeadings;
  });
});

test.describe("Franchise Cornerstone card headshots", () => {
  test("a franchise page with cornerstones renders headshot(s) for the player(s)", async ({
    page,
  }) => {
    await page.goto("/teams");
    await expect(page.locator("h1, h2").first()).toBeVisible();

    const teamLinks = await page
      .locator('a[href^="/teams/"]')
      .evaluateAll((els) =>
        Array.from(
          new Set(
            els
              .map((el) => el.getAttribute("href"))
              .filter(
                (href): href is string =>
                  !!href && /^\/teams\/[^/]+$/.test(href)
              )
          )
        )
      );

    let found = false;

    for (const href of teamLinks) {
      await page.goto(href);
      const kicker = page.getByText(/Franchise Cornerstones?/);
      if ((await kicker.count()) === 0) continue;

      found = true;
      const names = await page.locator("p.text-h3").allTextContents();
      // The cornerstone card's name text is one of the h3 elements on the
      // page; assert at least one headshot exists whose accessible name
      // matches one of them (single-cornerstone: full name; two-cornerstone:
      // "Lastname · Lastname", which PlayerHeadshot is not keyed to, so we
      // fall back to asserting the section contains a headshot role at all).
      const cornerstoneSection = page
        .locator("div")
        .filter({ has: kicker })
        .first();
      const headshotsInSection = cornerstoneSection.getByRole("img");
      await expect(headshotsInSection.first()).toBeVisible();
      void names;
      break;
    }

    test.skip(!found, "No franchise with a synced cornerstone found.");
  });
});
