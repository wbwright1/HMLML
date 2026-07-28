import { test, expect } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, isNotNull } from "drizzle-orm";
import { leagueAwards, franchises, seasons } from "../lib/db/schema";
import { AWARD_METADATA, type AwardType } from "../lib/awards";

// ============================================================================
// Issue #179 (Part 2): the league-wide Trophy Case (`/records/trophies`) now
// renders the same Medallion Podium shelves used on franchise pages -- a
// League Champion shelf plus one shelf per league award type -- instead of
// the old horizontally-scrolling TrophyRow. Read-only against the real synced
// DB; no seeding/mutation. These are hard assertions, not skip-guards for the
// League Champion shelf: this league has real synced championship data, so a
// regression that empties the shelf or brings back the deleted section MUST
// fail this suite.
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

  test("a League Champion shelf exists with at least one franchise link", async ({
    page,
  }) => {
    await page.goto("/records/trophies");

    const shelf = page.getByTestId("league-trophy-shelf");
    await expect(shelf).toBeVisible();

    const championLabel = shelf.getByText("League Champion").first();
    await expect(championLabel).toBeVisible();

    // The champion shelf's medallions link to /teams/.
    const teamLinks = shelf.locator('a[href^="/teams/"]');
    expect(await teamLinks.count()).toBeGreaterThan(0);
  });

  test("the champion medallion plate shows the franchise name and links to that franchise", async ({
    page,
  }) => {
    const db = getTestDb();
    const rows = await db
      .select({
        championFranchiseId: seasons.championFranchiseId,
      })
      .from(seasons);
    const championId = rows.find((r) => r.championFranchiseId != null)
      ?.championFranchiseId;
    if (!championId) return;

    const [champion] = await db
      .select({ slug: franchises.slug, name: franchises.name })
      .from(franchises)
      .where(eq(franchises.id, championId));
    expect(champion?.slug).toBeTruthy();

    await page.goto("/records/trophies");
    const shelf = page.getByTestId("league-trophy-shelf");
    await expect(shelf).toBeVisible();

    const link = shelf.locator(`a[href="/teams/${champion!.slug}"]`).first();
    await expect(link).toBeVisible();
    await expect(link).toContainText(champion!.name);
  });

  test("award shelves render player name + franchise crest when data exists", async ({
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
        description: "No league_awards data synced; award-shelf assertions skipped.",
      });
      return;
    }

    // At least one award label must render.
    const labels = Object.values(AWARD_METADATA).map((m) => m.label);
    let sawAnyAwardLabel = false;
    for (const label of labels) {
      const count = await shelf.getByText(label, { exact: true }).count();
      if (count > 0) sawAnyAwardLabel = true;
    }
    expect(sawAnyAwardLabel).toBe(true);

    // At least one award medallion links to a player profile.
    const playerLinks = shelf.locator('a[href^="/players/"]');
    expect(await playerLinks.count()).toBeGreaterThan(0);
  });

  test("each shelf's ×N count matches the DB count per award type", async ({
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

      // The shelf's label row carries the award label and a mono "×{N}"
      // count (the Medallion Podium replaces the old "N times" chip).
      const labelRow = shelf
        .locator("div")
        .filter({ hasText: meta.label })
        .filter({ hasText: `×${dbCount}` })
        .first();

      await expect(labelRow).toBeVisible();
    }
  });

  test("the League Champion shelf's ×N count matches seasons.championFranchiseId", async ({
    page,
  }) => {
    // getTrophyCase (lib/queries/records.ts) derives champions from
    // seasons.championFranchiseId, not playoff results, so that is the count
    // the page actually renders.
    const db = getTestDb();
    const seasonsWithChampion = await db
      .select({ seasonYear: seasons.seasonYear })
      .from(seasons)
      .where(isNotNull(seasons.championFranchiseId));

    await page.goto("/records/trophies");
    const shelf = page.getByTestId("league-trophy-shelf");

    if (seasonsWithChampion.length === 0) {
      // No champions in the DB: the shelf either doesn't render at all, or
      // renders without a League Champion row -- nothing to assert further.
      return;
    }

    await expect(shelf).toBeVisible();

    const labelRow = shelf
      .locator("div")
      .filter({ hasText: "League Champion" })
      .filter({ hasText: `×${seasonsWithChampion.length}` })
      .first();

    await expect(labelRow).toBeVisible();
  });

  test("an award's franchise crest shows the franchise name as plain text (no nested link)", async ({
    page,
  }) => {
    const db = getTestDb();
    const rows = await db
      .select({
        franchiseId: leagueAwards.franchiseId,
        playerName: leagueAwards.playerName,
      })
      .from(leagueAwards);

    const withFranchise = rows.find((r) => r.franchiseId != null);
    if (!withFranchise) return;

    const [franchise] = await db
      .select({ slug: franchises.slug, name: franchises.name })
      .from(franchises)
      .where(eq(franchises.id, withFranchise.franchiseId!));

    expect(franchise?.slug).toBeTruthy();

    await page.goto("/records/trophies");
    const shelf = page.getByTestId("league-trophy-shelf");
    await expect(shelf).toBeVisible();

    // The franchise name renders inside the award medallion's plate, but the
    // plate itself is not a link (the enclosing medallion links to the
    // player profile, not the franchise -- no nested anchors).
    await expect(shelf.getByText(franchise!.name).first()).toBeVisible();
    const nestedLink = shelf.locator(
      `a[href^="/players/"] a[href="/teams/${franchise!.slug}"]`,
    );
    expect(await nestedLink.count()).toBe(0);
  });
});
