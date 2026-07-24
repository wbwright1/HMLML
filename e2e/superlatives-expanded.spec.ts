import { test, expect, type Locator } from "@playwright/test";

// ============================================================================
// Issue #14: More superlatives
// Covers the new records-page "The Superlatives" section (season awards +
// optimal-lineup awards) and the hub's weekly Coaching Malpractice card.
// Follows story-3.2-superlatives.spec.ts conventions: chromium-only,
// test.skip() when the section is absent (no synthetic data seeding), assert
// rendered label text and tabular-nums on stat values, no mocks.
// ============================================================================

test.describe("Records: The Superlatives section", () => {
  test("R01: section renders with a heading when season data exists", async ({ page }) => {
    await page.goto("/records");

    const heading = page.getByRole("heading", { name: "The Superlatives", level: 2 });
    const count = await heading.count();
    if (count === 0) {
      // No franchise_seasons rows for the latest season yet; the section is
      // conditionally hidden. Acceptable graceful-absence behavior.
      test.skip();
      return;
    }

    await expect(heading).toBeVisible();
  });

  test("R02: award cards render with text labels and tabular-nums stats", async ({ page }) => {
    await page.goto("/records");

    const heading = page.getByRole("heading", { name: "The Superlatives", level: 2 });
    if ((await heading.count()) === 0) {
      test.skip();
      return;
    }

    const section = page.locator("section", { has: heading });
    const grid = section.locator("div.grid").first();
    await expect(grid).toBeVisible();

    // Every award card (the canonical SuperlativeCard) links to a franchise
    // page and carries a franchise name; assert at least one is present.
    const cards = grid.locator("a[href^='/teams/']");
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(1);

    // Every award card must carry a MEANINGFUL, non-zero stat. A card whose
    // stat parses to 0 (e.g. "0.0 PF") is the pre-data bug these superlatives
    // are gated against; it must never render, so assert > 0 here.
    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i);
      const statText = await card.innerText();
      expect(statText.trim().length).toBeGreaterThan(0);

      const match = statText.match(/(\d+(?:\.\d+)?)/);
      expect(match, `card ${i} should contain a numeric stat: ${statText}`).not.toBeNull();
      const value = parseFloat(match![1]);
      expect(value, `card ${i} stat must be non-zero: ${statText}`).toBeGreaterThan(0);
    }
  });

  test("R08: at most 6 cards, one per franchise, uniform height", async ({ page }) => {
    await page.goto("/records");

    const heading = page.getByRole("heading", { name: "The Superlatives", level: 2 });
    if ((await heading.count()) === 0) {
      test.skip();
      return;
    }

    const section = page.locator("section", { has: heading });
    const grid = section.locator("div.grid").first();
    const cards = grid.locator("a[href^='/teams/']");
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(1);
    expect(cardCount).toBeLessThanOrEqual(6);

    // One card per franchise: hrefs must be unique.
    const hrefs = await cards.evaluateAll((els) =>
      els.map((e) => e.getAttribute("href")),
    );
    expect(new Set(hrefs).size).toBe(hrefs.length);

    // Uniform card height (within 1px).
    const heights: number[] = [];
    for (let i = 0; i < cardCount; i++) {
      const box = await cards.nth(i).boundingBox();
      expect(box, `card ${i} should be visible`).not.toBeNull();
      heights.push(box!.height);
    }
    const min = Math.min(...heights);
    const max = Math.max(...heights);
    expect(max - min, `card heights should be uniform: ${heights.join(", ")}`).toBeLessThanOrEqual(1);

    // Every card carries a distinct label: each award is used at most once
    // per view, so a repeated label means the backfill pass double-assigned.
    const labels = await cards.evaluateAll((els) =>
      els.map((e) => e.querySelector("p")?.textContent ?? ""),
    );
    expect(new Set(labels).size, `card labels should be unique: ${labels.join(", ")}`).toBe(labels.length);
  });

  test("R09: season tab sync", async ({ page }) => {
    await page.goto("/records");

    const tabs = page.getByRole("tab");
    const tabCount = await tabs.count();
    if (tabCount <= 1) {
      // Only "All-Time" (or no season tabs at all): nothing to switch to.
      test.skip();
      return;
    }

    // Find a season tab (a numeric year label) that is not already selected.
    let target: Locator | null = null;
    let targetYear = "";
    for (let i = 0; i < tabCount; i++) {
      const tab = tabs.nth(i);
      const label = (await tab.innerText()).trim();
      const isSelected = (await tab.getAttribute("aria-selected")) === "true";
      if (!isSelected && /^\d{4}$/.test(label)) {
        target = tab;
        targetYear = label;
        break;
      }
    }
    if (!target) {
      test.skip();
      return;
    }

    await target.click();

    const label = page.getByText(`Season Awards · ${targetYear}`);
    if ((await label.count()) === 0) {
      // That season produced no superlative cards; acceptable graceful absence.
      test.skip();
      return;
    }
    await expect(label.first()).toBeVisible();

    // "Title Drought" (LONGEST_DROUGHT) is retired league-wide (issue #102) and
    // must never appear on any superlative surface, season-scoped or all-time.
    const heading = page.getByRole("heading", { name: "The Superlatives", level: 2 });
    const section = page.locator("section", { has: heading });
    const sectionText = await section.innerText();
    expect(sectionText).not.toContain("Title Drought");
  });

  test("R10: all-time superlatives", async ({ page }) => {
    await page.goto("/records");

    const allTimeTab = page.getByRole("tab", { name: "All-Time", exact: true });
    if ((await allTimeTab.count()) === 0) {
      test.skip();
      return;
    }
    await allTimeTab.click();

    const kicker = page.getByText("All-Time Awards");
    if ((await kicker.count()) === 0) {
      test.skip();
      return;
    }
    await expect(kicker.first()).toBeVisible();

    const heading = page.getByRole("heading", { name: "The Superlatives", level: 2 });
    const section = page.locator("section", { has: heading });

    // "Title Drought" is retired (issue #102); it must not appear in the
    // all-time coverage pool either.
    expect(await section.innerText()).not.toContain("Title Drought");

    const grid = section.locator("div.grid").first();
    const cards = grid.locator("a[href^='/teams/']");
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(1);
    expect(cardCount).toBeLessThanOrEqual(6);

    // One card per franchise: hrefs must be unique.
    const hrefs = await cards.evaluateAll((els) =>
      els.map((e) => e.getAttribute("href")),
    );
    expect(new Set(hrefs).size).toBe(hrefs.length);

    // Every card carries a distinct label.
    const labels = await cards.evaluateAll((els) =>
      els.map((e) => e.querySelector("p")?.textContent ?? ""),
    );
    expect(new Set(labels).size, `card labels should be unique: ${labels.join(", ")}`).toBe(labels.length);

    // Every card must carry a numeric stat.
    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i);
      const statText = await card.innerText();
      const match = statText.match(/(\d+(?:\.\d+)?)/);
      expect(match, `card ${i} should contain a numeric stat: ${statText}`).not.toBeNull();
    }
  });

  // R03-R06: the four new labels, each independently optional (depends on
  // what the latest season's data actually produces: e.g. Rock Bottom needs
  // a losing streak to exist; the lineup awards need player_week_points).
  for (const label of [
    "Rock Bottom",
    "Paper Tiger",
    "Coaching Malpractice",
    "What Could've Been",
  ]) {
    test(`R: "${label}" card renders with label text and tabular-nums stat, when present`, async ({
      page,
    }) => {
      await page.goto("/records");

      const heading = page.getByRole("heading", { name: "The Superlatives", level: 2 });
      if ((await heading.count()) === 0) {
        test.skip();
        return;
      }

      const section = page.locator("section", { has: heading });
      const labelNode = section.getByText(label, { exact: true });
      const labelCount = await labelNode.count();
      if (labelCount === 0) {
        // This particular superlative did not compute for the latest season
        // (e.g. no losing streak, or a legacy season with no lineup data).
        test.skip();
        return;
      }

      await expect(labelNode.first()).toBeVisible();

      // Walk up to the card anchor and confirm a tabular-nums stat renders.
      const card = labelNode.first().locator("xpath=ancestor::a[1]");
      await expect(card).toHaveAttribute("href", /^\/teams\//);

      const statNode = card.locator("p").filter({ hasText: /[0-9]/ }).first();
      await expect(statNode).toBeVisible();

      const fontVariantNumeric = await statNode.evaluate(
        (el) => window.getComputedStyle(el).fontVariantNumeric
      );
      expect(fontVariantNumeric).toContain("tabular-nums");

      // The stat must be a MEANINGFUL non-zero value. "0.0" here would mean the
      // award rendered against a season with no real data (the shipped bug).
      const statText = await statNode.innerText();
      const match = statText.match(/(\d+(?:\.\d+)?)/);
      expect(match, `"${label}" stat should be numeric: ${statText}`).not.toBeNull();
      expect(
        parseFloat(match![1]),
        `"${label}" stat must be non-zero: ${statText}`
      ).toBeGreaterThan(0);
    });
  }

  test("R07: no em-dashes in the superlatives section text", async ({ page }) => {
    await page.goto("/records");

    const heading = page.getByRole("heading", { name: "The Superlatives", level: 2 });
    if ((await heading.count()) === 0) {
      test.skip();
      return;
    }

    const section = page.locator("section", { has: heading });
    const text = await section.innerText();
    expect(text).not.toContain("—");
    expect(text).not.toContain("–");
  });
});

test.describe("Hub: weekly Coaching Malpractice card", () => {
  test("H01: renders in This Week's Damage section when a bench gap exists", async ({ page }) => {
    await page.goto("/");

    const heading = page.getByRole("heading", { name: "Superlatives", level: 2 });
    const headingCount = await heading.count();
    if (headingCount === 0) {
      // Preseason/playoffs/offseason hub variant, or no weekly data yet.
      test.skip();
      return;
    }

    const malpracticeLabel = page.getByText("Coaching Malpractice", { exact: true });
    if ((await malpracticeLabel.count()) === 0) {
      // No weekly bench-gap award computed for the completed week (e.g. no
      // player_week_points rows backfilled yet, or every roster started
      // their optimal lineup). Acceptable graceful absence.
      test.skip();
      return;
    }

    await expect(malpracticeLabel.first()).toBeVisible();

    // The card's stat line ("N.N pts left on bench") renders via .text-stat,
    // which carries font-mono + tabular-nums.
    const card = malpracticeLabel.first().locator("xpath=ancestor::a[1]");
    const statNode = card.locator("p.text-stat");
    await expect(statNode).toBeVisible();

    const fontVariantNumeric = await statNode.evaluate(
      (el) => window.getComputedStyle(el).fontVariantNumeric
    );
    expect(fontVariantNumeric).toContain("tabular-nums");

    // The weekly award only surfaces when a real bench gap exists, so the
    // "N.N pts left on bench" value must parse to a non-zero number.
    const statText = await statNode.innerText();
    expect(statText).not.toContain("—");
    const match = statText.match(/(\d+(?:\.\d+)?)/);
    expect(match, `weekly malpractice stat should be numeric: ${statText}`).not.toBeNull();
    expect(
      parseFloat(match![1]),
      `weekly malpractice stat must be non-zero: ${statText}`
    ).toBeGreaterThan(0);
  });
});
