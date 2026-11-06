import { test, expect } from "@playwright/test";

// Season Arc on /seasons/[year]: the week-by-week bump chart. 2025 is a
// completed season with a champion, so the crown column must render and must
// agree with the champion banner the same page renders from franchise_seasons.
const YEAR = 2025;

test.describe("Season Arc", () => {
  test("renders both lenses, crowns the real champion, and follows a team", async ({
    page,
  }) => {
    await page.goto(`/seasons/${YEAR}`);

    const arc = page.getByTestId("season-arc");
    await expect(arc).toBeVisible();

    const power = arc.locator('[data-lens="power"]');
    const standings = arc.locator('[data-lens="standings"]');
    await expect(power).toBeVisible();
    await expect(standings).toBeHidden();

    // Every franchise in the final standings has a line (a row in the
    // screen-reader table carries the same data as the SVG).
    const standingsRows = await page
      .locator("table")
      .filter({ hasText: "Record" })
      .locator("tbody tr")
      .count();
    await expect(power.locator(".sr-only table tbody tr")).toHaveCount(standingsRows);

    // The crown goes to the same franchise the champion banner names.
    const championName = (
      await page.locator(".card-tint-gold .text-h3").first().innerText()
    ).trim();
    await expect(power.locator(".sr-only table caption")).toContainText(
      `Champion: ${championName}`
    );
    await expect(power.getByText(championName).first()).toBeVisible();

    // Follow a team: the crest is a label for that team's radio.
    const clear = arc.getByText("Show everyone");
    await expect(clear).toBeHidden();
    const crest = power.locator("label.arc-crest").last();
    const forId = await crest.getAttribute("for");
    await crest.click();
    await expect(page.locator(`#${forId}`)).toBeChecked();
    await expect(clear).toBeVisible();
    await clear.click();
    await expect(page.locator(`#${forId}`)).not.toBeChecked();

    // Lens toggle swaps panels with no client JS.
    await arc.getByText("Standings", { exact: true }).click();
    await expect(standings).toBeVisible();
    await expect(power).toBeHidden();
  });
});
