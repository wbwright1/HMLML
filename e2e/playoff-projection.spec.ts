import { test, expect } from "@playwright/test";
import {
  seedDivisionData,
  cleanupDivisionData,
  buildFixture,
  LATEST_SEASON_YEAR,
} from "./helpers/seed-divisions";

// ============================================================================
// Issue #12: Playoff projection
//
// Seeds the DB's *latest* season (by seasonYear DESC) with a full 12-team /
// 3-division fixture so the records page's "Projected Playoff Field" block —
// which only renders for the current season — picks up the real data. The
// fixture has 12 teams for 6 berths, so six teams are genuinely excluded;
// the assertions below are only satisfiable by the real division-winner
// auto-qualify rule and tiebreak chain in lib/queries/divisions.ts:
//
//   - the weakest division winner (Alpha, 5-5) qualifies even though the
//     first-team-out (Hotel, 7-3) has a strictly BETTER overall record — a
//     flat top-6-by-record field would put Hotel in and Alpha out
//   - Alpha (a 5-5 division winner) seeds AHEAD of Foxtrot (an 8-2 non-winner
//     wildcard) because division winners are seeded above all wildcards
//   - Golf sweeps Hotel head-to-head (both 7-3), so Golf takes the last
//     wildcard and Hotel is the bubble team
//
// If getPlayoffProjection were replaced with `seedTeams(teams).slice(0,6)`
// (feature deleted), Alpha would be excluded and Hotel included, failing the
// first assertions below.
// ============================================================================

// Serial: both tests share one seeded season (a single beforeAll/afterAll),
// so they must not run in parallel workers that would each re-seed the same
// franchise ids and collide on the primary key.
test.describe.configure({ mode: "serial" });

test.describe("Playoff projection", () => {
  let seasonId: number;
  const f = buildFixture(LATEST_SEASON_YEAR).franchises;

  test.beforeAll(async () => {
    seasonId = await seedDivisionData(LATEST_SEASON_YEAR);
  });

  test.afterAll(async () => {
    await cleanupDivisionData(seasonId, LATEST_SEASON_YEAR);
  });

  test("weak division winner qualifies while a better-record non-winner is left out; H2H decides the bubble", async ({
    page,
  }) => {
    await page.goto("/records");

    const heading = page.getByText("Projected Playoff Field", { exact: true });
    await expect(heading).toBeVisible({ timeout: 15000 });

    const fieldSection = heading.locator("xpath=following-sibling::div[1]");

    // The qualified field is the set of seed rows, which are <a> links; the
    // bubble ("First Out") is a plain <div>, so it is excluded here. Build an
    // ordered list of the qualified team names from the links only.
    const qualifiedNames = await fieldSection.locator("a").allInnerTexts();
    const qualifiedText = qualifiedNames.join("\n");
    const seededIdx = (name: string) =>
      qualifiedNames.findIndex((t) => t.includes(name));

    // Exactly 6 teams qualify.
    expect(qualifiedNames.length).toBe(6);

    // Alpha (Division East winner, 5-5, the weakest division winner) is IN
    // the field despite auto-qualify. This is the discriminating assertion:
    // a flat top-6 would exclude Alpha in favor of a better record.
    expect(qualifiedText).toContain(f.a.name);

    // The other two division winners are in.
    expect(qualifiedText).toContain(f.e.name); // Echo, West winner (9-1)
    expect(qualifiedText).toContain(f.i.name); // India, North winner (9-1)

    // Hotel (7-3) has a strictly BETTER overall record than Alpha (5-5) yet
    // is the FIRST TEAM OUT — only possible because Alpha auto-qualifies as a
    // division winner. Under a flat top-6, Hotel would be in and Alpha out.
    await expect(page.getByText("First Out")).toBeVisible();
    const bubbleRow = page.getByText("First Out").locator("xpath=ancestor::div[1]");
    await expect(bubbleRow).toContainText(f.h.name);
    // And the better-record team really is excluded from the qualified field.
    expect(qualifiedText).not.toContain(f.h.name);

    // Alpha (5-5 division winner) is seeded AHEAD of Foxtrot (8-2 non-winner
    // wildcard): division winners rank above all wildcards regardless of
    // record. alphaIdx < foxtrotIdx.
    expect(seededIdx(f.f.name)).toBeGreaterThan(-1); // Foxtrot is in as a wildcard
    expect(seededIdx(f.a.name)).toBeLessThan(seededIdx(f.f.name));

    // Golf (7-3) swept Hotel (7-3) head-to-head, so Golf takes the last
    // wildcard while Hotel is the bubble — the H2H tiebreak decided this,
    // not record (identical) or points (Golf actually has MORE, but that is
    // the last fallback; the sweep is what the rules apply first).
    expect(qualifiedText).toContain(f.g.name);
  });

  test("leaderboard table berth line agrees with the projection (division-winner auto-qualify, not top-6-by-record)", async ({
    page,
  }) => {
    await page.goto("/records");

    // Select the seeded latest season in the leaderboard's season picker.
    const seasonTab = page.getByRole("tab", { name: String(LATEST_SEASON_YEAR) });
    await expect(seasonTab).toBeVisible({ timeout: 15000 });
    await seasonTab.click();

    // A row's data-berth reflects the SAME source as the projection block.
    // Under a flat top-6-by-record berth line, Alpha (5-5) would be OUT and
    // Hotel (7-3) IN — the opposite of the projection. So these assertions
    // fail unless the table adopted the projection (division-winner
    // auto-qualify), which was the self-contradiction fix.
    const alphaRow = page
      .locator("table tr")
      .filter({ hasText: f.a.name })
      .first();
    await expect(alphaRow).toBeVisible();
    await expect(alphaRow).toHaveAttribute("data-berth", "true");

    const hotelRow = page
      .locator("table tr")
      .filter({ hasText: f.h.name })
      .first();
    await expect(hotelRow).toBeVisible();
    await expect(hotelRow).toHaveAttribute("data-berth", "false");
  });
});
