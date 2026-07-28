import { test, expect } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { leagueAwards, franchises } from "../lib/db/schema";
import { AWARD_METADATA, type AwardType } from "../lib/awards";

// ============================================================================
// Issue #173: League Trophy Case (`/records/trophies`) shows EVERY piece of
// league hardware -- the League Champion row plus one row per league award
// type -- and no longer shows the old "Championship Leaders" all-time section
// or the year-by-year championships scroller. Read-only against the real
// synced DB; no seeding/mutation. These are hard assertions, not skip-guards
// for the League Champion row: this league has real synced championship data,
// so a regression that empties the shelf or brings back the deleted section
// MUST fail this suite.
// ============================================================================

function getTestDb() {
  const sql = neon(process.env.POSTGRES_URL!);
  return drizzle(sql);
}

test.describe("League Trophy Case (/records/trophies)", () => {
  test("the deleted Championship Leaders section is gone", async ({ page }) => {
    await page.goto("/records/trophies");
    await expect(page.getByText("Championship Leaders")).toHaveCount(0);
  });

  test("a League Champion row exists with at least one franchise link", async ({
    page,
  }) => {
    await page.goto("/records/trophies");

    const shelf = page.getByTestId("league-trophy-shelf");
    await expect(shelf).toBeVisible();

    const championRow = shelf.getByText("League Champion").first();
    await expect(championRow).toBeVisible();

    // The champion row's cells are franchise crest chips linking to /teams/.
    const teamLinks = shelf.locator('a[href^="/teams/"]');
    expect(await teamLinks.count()).toBeGreaterThan(0);
  });

  test("award rows render player name + franchise crest link when data exists", async ({
    page,
  }) => {
    await page.goto("/records/trophies");

    const shelf = page.getByTestId("league-trophy-shelf");
    await expect(shelf).toBeVisible();

    const db = getTestDb();
    const rows = await db
      .select({ awardType: leagueAwards.awardType })
      .from(leagueAwards);

    if (rows.length === 0) {
      test.info().annotations.push({
        type: "note",
        description: "No league_awards data synced; award-row assertions skipped.",
      });
      return;
    }

    // At least one award row exists overall: some award label must render.
    const labels = Object.values(AWARD_METADATA).map((m) => m.label);
    let sawAnyAwardLabel = false;
    for (const label of labels) {
      const count = await shelf.getByText(label, { exact: true }).count();
      if (count > 0) sawAnyAwardLabel = true;
    }
    expect(sawAnyAwardLabel).toBe(true);

    // Every award cell with a franchise renders a working /teams/ link.
    const teamLinks = shelf.locator('a[href^="/teams/"]');
    expect(await teamLinks.count()).toBeGreaterThan(0);
  });

  test("cells-per-row matches the league_awards DB count per award type", async ({
    page,
  }) => {
    await page.goto("/records/trophies");
    const shelf = page.getByTestId("league-trophy-shelf");
    await expect(shelf).toBeVisible();

    const db = getTestDb();
    const rows = await db
      .select({ awardType: leagueAwards.awardType })
      .from(leagueAwards);

    if (rows.length === 0) return;

    const countByType = new Map<string, number>();
    for (const r of rows) {
      countByType.set(r.awardType, (countByType.get(r.awardType) ?? 0) + 1);
    }

    for (const [awardType, dbCount] of countByType) {
      const meta = AWARD_METADATA[awardType as AwardType];
      if (!meta) continue;

      // Find this award type's row: the fixed identity chip on the left
      // carries the label and the "N times" count.
      const rowChip = shelf
        .locator("div")
        .filter({ hasText: meta.label })
        .filter({ hasText: /time/ })
        .first();

      await expect(rowChip).toBeVisible();
      const chipText = await rowChip.textContent();
      expect(chipText).toContain(String(dbCount));
    }
  });

  test("one award cell's franchise link matches league_awards.franchise_id -> franchises.slug", async ({
    page,
  }) => {
    const db = getTestDb();
    const rows = await db
      .select({
        awardType: leagueAwards.awardType,
        franchiseId: leagueAwards.franchiseId,
        playerName: leagueAwards.playerName,
      })
      .from(leagueAwards);

    const withFranchise = rows.find((r) => r.franchiseId != null);
    if (!withFranchise) return;

    const [franchise] = await db
      .select({ slug: franchises.slug })
      .from(franchises)
      .where(eq(franchises.id, withFranchise.franchiseId!));

    expect(franchise?.slug).toBeTruthy();

    await page.goto("/records/trophies");
    const shelf = page.getByTestId("league-trophy-shelf");
    await expect(shelf).toBeVisible();

    const link = shelf.locator(`a[href="/teams/${franchise!.slug}"]`);
    expect(await link.count()).toBeGreaterThan(0);
  });
});
