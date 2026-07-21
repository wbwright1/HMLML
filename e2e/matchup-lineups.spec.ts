import { test, expect } from "@playwright/test";
import {
  seedPlayerWeekPoints,
  cleanupPlayerWeekPoints,
  TEST_DATA,
} from "./helpers/seed-player-week-points";

// ============================================================================
// B1a: Matchup lineup tables
// Tests verify the matchup detail page renders real per-player starters and
// bench for both rosters when player_week_points rows exist, and falls back
// to a calm empty-state message when they don't (legacy weeks).
//
// NOTE: getMatchupsByWeek (lib/queries/matchups.ts, not owned by this story)
// pairs rows without an ORDER BY, so which seeded franchise lands in the
// page's homeTeam vs. awayTeam slot is not guaranteed. Assertions below
// intentionally avoid depending on that ordering.
// ============================================================================

test.describe("Matchup Lineup Tables", () => {
  test.describe.configure({ mode: "serial" });

  let seasonId: number;

  test.beforeAll(async () => {
    seasonId = await seedPlayerWeekPoints();
  });

  test.afterAll(async () => {
    await cleanupPlayerWeekPoints(seasonId);
  });

  function lineupsUrl(matchupId: number) {
    return `/matchups/${TEST_DATA.seasonYear}/${TEST_DATA.week}/${matchupId}`;
  }

  test("both lineup sections render with slot labels for the starters", async ({
    page,
  }) => {
    await page.goto(lineupsUrl(TEST_DATA.matchupIdWithLineups));

    const lineupSections = page.getByRole("region", { name: /lineup$/ });
    await expect(lineupSections).toHaveCount(2);
    await expect(lineupSections.first()).toBeVisible();
    await expect(lineupSections.last()).toBeVisible();

    // Slot labels present at least once (rendered per side).
    for (const slot of ["QB", "RB", "WR", "TE", "FLEX", "DEF"]) {
      await expect(page.getByText(slot, { exact: true }).first()).toBeVisible();
    }
  });

  test("named starters render on both sides with their points", async ({
    page,
  }) => {
    await page.goto(lineupsUrl(TEST_DATA.matchupIdWithLineups));

    const bodyText = await page.locator("body").innerText();

    // Side A (higher-scoring roster)
    expect(bodyText).toContain("Aaron Testman");
    expect(bodyText).toContain("24.6");
    expect(bodyText).toContain("Denver Defense");
    expect(bodyText).toContain("Jordan Flexwell");

    // Side B (lower-scoring roster)
    expect(bodyText).toContain("Blake Passwell");
    expect(bodyText).toContain("19.1");
    expect(bodyText).toContain("Cleveland Defense");

    // The FLEX starter on side A has no seeded projection -> "—" fallback.
    expect(bodyText).toContain("—");
  });

  test("each side's totals row sums its seeded starter points", async ({
    page,
  }) => {
    await page.goto(lineupsUrl(TEST_DATA.matchupIdWithLineups));

    const bodyText = await page.locator("body").innerText();

    expect(bodyText).toContain(TEST_DATA.homeStartersTotal.toFixed(1));
    expect(bodyText).toContain(TEST_DATA.awayStartersTotal.toFixed(1));
  });

  test("bench is a secondary, collapsed-by-default section that expands to reveal players", async ({
    page,
  }) => {
    await page.goto(lineupsUrl(TEST_DATA.matchupIdWithLineups));

    const benchToggles = page.locator("summary", { hasText: "Bench" });
    await expect(benchToggles).toHaveCount(2);

    const benchNames = [
      "Bench Runner Alpha",
      "Bench Wideout Alpha",
      "Bench Passer Bravo",
      "Bench Blocker Bravo",
    ];

    // Collapsed by default: no bench player name is visible yet.
    for (const name of benchNames) {
      await expect(page.getByText(name)).toBeHidden();
    }

    await benchToggles.first().click();

    // Expanding the first bench section reveals at least one bench player.
    const visibleCount = await Promise.all(
      benchNames.map((name) => page.getByText(name).isVisible())
    );
    expect(visibleCount.some(Boolean)).toBe(true);
  });

  test("empty state renders a calm message for a matchup with no lineup rows", async ({
    page,
  }) => {
    await page.goto(lineupsUrl(TEST_DATA.matchupIdWithoutLineups));

    await expect(
      page.getByText("Per-player lineups aren't available for this matchup.")
    ).toBeVisible();

    // No lineup section rendered for either side.
    await expect(page.getByRole("region", { name: /lineup$/ })).toHaveCount(0);
  });

  test("matchup detail hero still renders correctly alongside lineups", async ({
    page,
  }) => {
    await page.goto(lineupsUrl(TEST_DATA.matchupIdWithLineups));

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain(TEST_DATA.home.name);
    expect(bodyText).toContain(TEST_DATA.away.name);
  });
});
