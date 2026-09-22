import { test, expect, type Page } from "@playwright/test";
import {
  seedMatchupData,
  cleanupMatchupData,
  TEST_DATA,
} from "./helpers/seed-matchups";
import {
  E2E_RIVALRY,
  cleanupRivalry,
  rivalriesTableExists,
  seedRivalry,
} from "./helpers/seed-rivalry";

// ============================================================================
// Named rivalries render on every surface that identifies the pair.
//
// Seeds the e2e-4-1 league (Team Alpha beat Team Bravo 120.5-98.3 in 1999
// week 1, matchup 901) plus one named rivalry row for Alpha v Bravo, then drops
// the ISR + Data Cache the way a sync does. Every assertion looks for the
// seeded name, which exists nowhere but that DB row, so deleting any surface's
// rendering (or the lookup feeding it) fails the matching test.
// ============================================================================

const A = TEST_DATA.franchiseA;
const B = TEST_DATA.franchiseB;
const C = TEST_DATA.franchiseC;

async function revalidateSite(baseURL: string) {
  const secret = process.env.CRON_SECRET?.replace(/^"|"$/g, "");
  const res = await fetch(`${baseURL}/api/revalidate`, {
    headers: { authorization: `Bearer ${secret}` },
  });
  if (!res.ok) {
    throw new Error(`/api/revalidate returned ${res.status}; is CRON_SECRET set?`);
  }
}

/** A FranchiseLogo announces its franchise (monogram role=img or avatar alt). */
async function expectCrestNamed(scope: ReturnType<Page["locator"]>, name: string) {
  await expect(scope.getByRole("img", { name, exact: true }).first()).toBeVisible();
}

test.describe("Named rivalries", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== "chromium", "chromium-only");
  });

  let seasonId: number | undefined;

  test.beforeAll(async ({ baseURL }) => {
    if (!(await rivalriesTableExists())) {
      throw new Error("rivalries table missing: apply migration 0017 first");
    }
    seasonId = await seedMatchupData();
    await seedRivalry();
    await revalidateSite(baseURL!);
  });

  test.afterAll(async ({ baseURL }) => {
    await cleanupRivalry();
    if (seasonId) await cleanupMatchupData(seasonId);
    await revalidateSite(baseURL!);
  });

  test("T01: matchup detail puts the rivalry name and tagline in the hero kicker", async ({
    page,
  }) => {
    await page.goto(`/matchups/${TEST_DATA.seasonYear}/1/901`);
    const kicker = page.getByTestId("matchup-rivalry");
    await expect(kicker).toContainText(E2E_RIVALRY.name);
    await expect(kicker).toContainText(E2E_RIVALRY.tagline);
    // The name wins over the generic auto-detected kicker.
    await expect(page.getByText("Rivalry Week", { exact: true })).toHaveCount(0);
    await expect(kicker.getByRole("link", { name: E2E_RIVALRY.name })).toHaveAttribute(
      "href",
      `/records/head-to-head?a=${A.slug}&b=${B.slug}`,
    );
  });

  test("T02: an unnamed pairing shows no rivalry kicker", async ({ page }) => {
    await page.goto(`/matchups/${TEST_DATA.seasonYear}/1/902`);
    await expect(
      page.getByRole("region", { name: `${TEST_DATA.franchiseC.name} versus ${TEST_DATA.franchiseD.name}` }),
    ).toBeVisible();
    await expect(page.getByTestId("matchup-rivalry")).toHaveCount(0);
    await expect(page.getByText(E2E_RIVALRY.name)).toHaveCount(0);
  });

  test("T03: head-to-head hero carries the name, tagline and origin", async ({ page }) => {
    await page.goto(`/records/head-to-head?a=${A.slug}&b=${B.slug}`);
    const hero = page.getByTestId("h2h-rivalry");
    await expect(hero.getByRole("heading", { name: E2E_RIVALRY.name })).toBeVisible();
    await expect(hero).toContainText(E2E_RIVALRY.tagline);
    await expect(page.getByRole("complementary", { name: "Rivalry origin" })).toHaveText(
      E2E_RIVALRY.origin,
    );
    // The game log is untouched: the one seeded meeting is still listed.
    await expect(page.getByText(/1\s*game played/)).toBeVisible();
  });

  test("T04: head-to-head for an unnamed pair has no rivalry hero", async ({ page }) => {
    await page.goto(`/records/head-to-head?a=${A.slug}&b=${C.slug}`);
    await expect(page.getByRole("heading", { name: "Head-to-Head." })).toBeVisible();
    await expect(page.getByTestId("h2h-rivalry")).toHaveCount(0);
  });

  test("T05: rivalries page features the named pair with record and crests", async ({
    page,
  }) => {
    await page.goto("/records/rivalries");
    await expect(page.getByRole("heading", { name: "Named Rivalries" })).toBeVisible();
    const card = page
      .getByTestId("named-rivalry-card")
      .filter({ has: page.getByRole("heading", { name: E2E_RIVALRY.name }) });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(E2E_RIVALRY.tagline);
    await expect(card).toContainText(E2E_RIVALRY.origin);
    await expect(card).toContainText(A.name);
    await expect(card).toContainText(B.name);
    // Alpha (side A in canonical order) won the only meeting.
    await expect(card.locator(".font-mono", { hasText: /^1-0$/ }).first()).toBeVisible();
    await expectCrestNamed(card, A.name);
    await expectCrestNamed(card, B.name);
    await expect(card.getByRole("link", { name: "Full head-to-head" })).toHaveAttribute(
      "href",
      `/records/head-to-head?a=${A.slug}&b=${B.slug}`,
    );

    // The auto list still lists the pair, now wearing the name chip.
    const autoRow = page
      .locator(`a[href="/records/head-to-head?a=${A.slug}&b=${B.slug}"]`)
      .filter({ has: page.getByTestId("rivalry-chip") });
    await expect(autoRow).toHaveCount(1);
    await expect(autoRow.getByTestId("rivalry-chip")).toHaveText(E2E_RIVALRY.name);
  });

  test("T06: team page leads with the named rival and labels the grid row", async ({
    page,
  }) => {
    await page.goto(`/teams/${A.slug}`);

    // Signature band: the named rival takes the rival slot.
    const band = page.getByRole("list", { name: "Franchise highlights" });
    const rivalCallout = band
      .getByRole("listitem")
      .filter({ hasText: E2E_RIVALRY.name });
    await expect(rivalCallout).toHaveCount(1);
    await expect(rivalCallout).toContainText("1-0");
    await expect(rivalCallout).toContainText(`vs ${B.name}`);
    await expect(band.getByText("Primary Rival")).toHaveCount(0);

    // Named rival card with both crests announced.
    const card = page.getByTestId("named-rivalry-card");
    await expect(card).toHaveCount(1);
    await expect(card.getByRole("heading", { name: E2E_RIVALRY.name })).toBeVisible();
    await expect(card).toContainText(E2E_RIVALRY.tagline);
    await expectCrestNamed(card, A.name);
    await expectCrestNamed(card, B.name);

    // Who Owns Who: the Bravo row carries the name as a secondary label.
    const bravoRow = page.getByRole("link", {
      name: new RegExp(`^${B.name} \\(${E2E_RIVALRY.name}\\):`),
    });
    await expect(bravoRow).toHaveCount(1);
    await expect(bravoRow.getByTestId("rivalry-chip")).toHaveText(E2E_RIVALRY.name);
  });

  test("T07: schedule rows chip the named pairing only", async ({ page }) => {
    await page.goto(`/schedule?season=${TEST_DATA.seasonYear}`);
    const named = page.getByRole("link", {
      name: `${A.name} versus ${B.name}, ${E2E_RIVALRY.name}, view detail`,
    });
    await expect(named).toHaveCount(1);
    await expect(named.getByTestId("rivalry-chip").filter({ visible: true })).toHaveText(
      E2E_RIVALRY.name,
    );
    const unnamed = page.getByRole("link", {
      name: `${TEST_DATA.franchiseC.name} versus ${TEST_DATA.franchiseD.name}, view detail`,
    });
    await expect(unnamed).toHaveCount(1);
    await expect(unnamed.getByTestId("rivalry-chip")).toHaveCount(0);

    // The franchise schedule labels the week Alpha played Bravo.
    await page.goto(`/teams/${A.slug}/schedule?season=${TEST_DATA.seasonYear}`);
    const week1 = page.getByRole("link", {
      name: `Week 1: versus ${B.name}, ${E2E_RIVALRY.name}, view matchup detail`,
    });
    await expect(week1.getByTestId("rivalry-chip")).toHaveText(E2E_RIVALRY.name);
    const week2 = page.getByRole("link", {
      name: `Week 2: versus ${C.name}, view matchup detail`,
    });
    await expect(week2.getByTestId("rivalry-chip")).toHaveCount(0);
  });
});
