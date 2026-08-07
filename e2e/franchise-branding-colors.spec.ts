import { test, expect } from "@playwright/test";
import {
  CURATED_FRANCHISE_COLORS,
  FRANCHISE_PALETTE,
} from "../lib/franchise-colors";
import { hexToRgb } from "../lib/color-metrics";

/**
 * Issue #197: franchises.branding_color is populated by the daily sync, so the
 * crest ring and crest tile render a real per-team color.
 *
 * These assertions fail if the feature is removed: with branding_color NULL,
 * FranchiseIdentity emits data-branding="false" and no boxShadow at all, and
 * FranchiseLogo falls back to the shared gold gradient rather than a flat
 * palette color.
 */

const PALETTE_HEXES = FRANCHISE_PALETTE.map((entry) => entry.hex);

/** `rgb(79, 136, 165)` as Chromium reports it, for a palette hex. */
function toRgbString(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r}, ${g}, ${b})`;
}

const PALETTE_RGB = PALETTE_HEXES.map(toRgbString);

test.describe("franchise branding colors reach the DOM", () => {
  test("every crest on /teams is branded", async ({ page }) => {
    await page.goto("/teams");

    const crests = page.locator("[data-branding]");
    const count = await crests.count();
    expect(count).toBeGreaterThanOrEqual(12);

    for (let i = 0; i < count; i++) {
      await expect(crests.nth(i)).toHaveAttribute("data-branding", "true");
    }
  });

  test("each crest ring paints a palette color", async ({ page }) => {
    await page.goto("/teams");

    const crests = page.locator("[data-branding='true']");
    const count = await crests.count();
    expect(count).toBeGreaterThanOrEqual(12);

    const seen = new Set<string>();
    for (let i = 0; i < count; i++) {
      const shadow = await crests
        .nth(i)
        .evaluate((el) => getComputedStyle(el).boxShadow);

      // Ring is `0 0 0 2px <color>`; the color must be one of ours.
      const match = PALETTE_RGB.find((rgb) => shadow.includes(rgb));
      expect(match, `box-shadow "${shadow}" is not a palette color`).toBeTruthy();
      if (match) seen.add(match);
    }

    // 12 franchises, 12 distinct palette entries: no team wears another's color.
    expect(seen.size).toBeGreaterThanOrEqual(12);
  });

  test("a franchise page hero crest wears that franchise's own color", async ({
    page,
  }) => {
    // Olave Garden -> olive, the assignment the plan calls out by name.
    const expectedRgb = toRgbString(
      CURATED_FRANCHISE_COLORS["710650554438709248"]
    );

    await page.goto("/teams/olave-garden");

    const crest = page.locator("[data-branding='true']").first();
    await expect(crest).toBeVisible();

    const shadow = await crest.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).toContain(expectedRgb);

    // The crest tile itself is filled with the same color, which is what makes
    // the 4.5:1 contrast requirement real: the monogram sits on this fill.
    const tile = crest.locator("div[aria-hidden='true']").first();
    const background = await tile.evaluate(
      (el) => getComputedStyle(el).backgroundColor
    );
    expect(background).toBe(expectedRgb);
  });
});
