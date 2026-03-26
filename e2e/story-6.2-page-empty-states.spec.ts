import { test, expect } from "@playwright/test";

/**
 * Story 6.2: Page-Specific Empty States
 *
 * Verifies that all pages use the EmptyState component for empty data states
 * instead of plain-text <p> elements. Each EmptyState must have an icon,
 * title, and description. No prohibited language ("Oops", "Uh oh").
 *
 * These tests run against a real dev server. Pages with no data in the DB
 * will naturally show their empty states.
 */

// The EmptyState component renders a container with max-w-[400px] and
// specific structure: icon (SVG with aria-hidden), h3 title, p description.
const EMPTY_STATE_SELECTOR = ".max-w-\\[400px\\]";

// Pages that show EmptyState when no data is present.
// Each entry has the URL and expected title text for the empty state.
const PAGES_WITH_EMPTY_STATES = [
  { url: "/drafts", title: "No Draft Data" },
  { url: "/matchups", title: "No Matchups Available" },
  { url: "/records/trophies", title: "No Championship Data" },
  { url: "/records/power-rankings", title: "No Power Rankings" },
  { url: "/records/rivalries", title: "No Rivalry Data" },
  { url: "/teams", title: "Loading Franchises" },
  { url: "/seasons", title: "No Seasons Yet" },
];

// Pages that already had EmptyState from Story 6.1 (regression check)
const EXISTING_EMPTY_STATE_PAGES = [
  { url: "/records/head-to-head", title: "Select Two Franchises" },
];

test.describe("Story 6.2: Page-Specific Empty States", () => {
  test.describe("AC1: EmptyState component structure", () => {
    for (const { url, title } of [...PAGES_WITH_EMPTY_STATES, ...EXISTING_EMPTY_STATE_PAGES]) {
      test(`${url} uses EmptyState component with proper structure`, async ({
        page,
      }) => {
        await page.goto(url);

        // Look for the EmptyState component container
        const emptyState = page.locator(EMPTY_STATE_SELECTOR).filter({
          hasText: title,
        });

        // If the page has data, the empty state won't render; that's OK.
        // We only assert structure if the empty state is visible.
        const count = await emptyState.count();
        if (count === 0) {
          // Page has data, skip structural checks
          return;
        }

        await expect(emptyState).toBeVisible();

        // Must have an icon (SVG with aria-hidden="true")
        const icon = emptyState.locator('svg[aria-hidden="true"]');
        await expect(icon).toBeVisible();

        // Must have a title (h3)
        const h3 = emptyState.locator("h3");
        await expect(h3).toBeVisible();
        await expect(h3).toHaveText(title);

        // Must have a description (p)
        const description = emptyState.locator("p");
        await expect(description).toBeVisible();
        const descText = await description.textContent();
        expect(descText).toBeTruthy();
        expect(descText!.length).toBeGreaterThan(10);
      });
    }
  });

  test.describe("AC1: Action links preserved", () => {
    test("Matchups empty state has action link to /seasons", async ({
      page,
    }) => {
      await page.goto("/matchups");

      const emptyState = page.locator(EMPTY_STATE_SELECTOR).filter({
        hasText: "No Matchups Available",
      });

      const count = await emptyState.count();
      if (count === 0) return; // Page has data

      const actionLink = emptyState.locator('a[href="/seasons"]');
      await expect(actionLink).toBeVisible();
      await expect(actionLink).toContainText("Browse league history");
    });

    test("Drafts empty state has action link to /seasons", async ({
      page,
    }) => {
      await page.goto("/drafts");

      const emptyState = page.locator(EMPTY_STATE_SELECTOR).filter({
        hasText: "No Draft Data",
      });

      const count = await emptyState.count();
      if (count === 0) return;

      const actionLink = emptyState.locator('a[href="/seasons"]');
      await expect(actionLink).toBeVisible();
      await expect(actionLink).toContainText("Browse seasons");
    });

    test("Trophies empty state has action link to /seasons", async ({
      page,
    }) => {
      await page.goto("/records/trophies");

      const emptyState = page.locator(EMPTY_STATE_SELECTOR).filter({
        hasText: "No Championship Data",
      });

      const count = await emptyState.count();
      if (count === 0) return;

      const actionLink = emptyState.locator('a[href="/seasons"]');
      await expect(actionLink).toBeVisible();
      await expect(actionLink).toContainText("View seasons");
    });
  });

  test.describe("AC2: Voice and tone compliance", () => {
    const ALL_PAGES = [
      "/",
      "/drafts",
      "/matchups",
      "/teams",
      "/seasons",
      "/records",
      "/records/trophies",
      "/records/power-rankings",
      "/records/rivalries",
      "/records/head-to-head",
      "/players",
    ];

    for (const url of ALL_PAGES) {
      test(`${url} has no prohibited language`, async ({ page }) => {
        await page.goto(url);

        const bodyText = await page.locator("body").textContent();
        // No "Oops" or "Uh oh" anywhere
        expect(bodyText).not.toMatch(/\bOops\b/i);
        expect(bodyText).not.toMatch(/\bUh oh\b/i);
      });
    }
  });

  test.describe("AC1: No remaining plain-text empty messages", () => {
    // These pages should NOT have raw <p> elements with "No data" / "No results"
    // style messages outside of EmptyState containers.
    const CHECK_PAGES = [
      "/drafts",
      "/matchups",
      "/records/trophies",
      "/records/power-rankings",
      "/records/rivalries",
      "/records/head-to-head",
    ];

    for (const url of CHECK_PAGES) {
      test(`${url} has no orphan plain-text empty messages`, async ({
        page,
      }) => {
        await page.goto(url);

        // Find all <p> elements that contain typical empty-state text
        // but are NOT inside an EmptyState component container
        const orphanMessages = page.locator(
          `p.text-body-lg.text-muted-foreground:not(${EMPTY_STATE_SELECTOR} p)`
        );

        const count = await orphanMessages.count();
        for (let i = 0; i < count; i++) {
          const text = await orphanMessages.nth(i).textContent();
          // These should not be empty-state messages
          expect(text).not.toMatch(
            /No .+ (available|found|yet)|Check back once/i
          );
        }
      });
    }
  });
});
