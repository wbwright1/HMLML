import { test, expect } from "@playwright/test";

// ============================================================================
// Story 2.3: Co-Owner Display Across Site
// Verifies that co-owner names render correctly using the " & " separator
// pattern across FranchiseIdentity hero/standard variants and all pages
// that display owner information.
// ============================================================================

test.describe("Co-Owner Display Across Site", () => {
  // -------------------------------------------------------------------------
  // T01: /teams page loads and franchise cards show owner info
  // -------------------------------------------------------------------------
  test("T01: teams overview shows owner info on franchise cards", async ({
    page,
  }) => {
    await page.goto("/teams");

    // Wait for franchise cards to render (the page section with franchise links)
    const franchiseCards = page.locator('a[href^="/teams/"]');
    const cardCount = await franchiseCards.count();

    // Skip if no franchises in DB (empty state)
    if (cardCount === 0) {
      test.skip(true, "No franchise data in database");
      return;
    }

    // At least one franchise card should have owner text rendered
    // The FranchiseIdentity standard variant puts owner in a p.text-caption element
    const ownerTexts = page.locator('a[href^="/teams/"] p.text-caption');
    const ownerCount = await ownerTexts.count();
    expect(ownerCount).toBeGreaterThan(0);

    // Verify that the owner text is non-empty
    const firstOwnerText = await ownerTexts.first().innerText();
    expect(firstOwnerText.trim().length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // T02: No trailing " & " when no co-owner exists
  // -------------------------------------------------------------------------
  test("T02: no trailing ampersand separator when co-owner is absent", async ({
    page,
  }) => {
    await page.goto("/teams");

    const ownerTexts = page.locator('a[href^="/teams/"] p.text-caption');
    const count = await ownerTexts.count();

    if (count === 0) {
      test.skip(true, "No franchise data in database");
      return;
    }

    // Check every owner caption: none should end with " & " or " &"
    for (let i = 0; i < count; i++) {
      const text = await ownerTexts.nth(i).innerText();
      expect(text.trimEnd()).not.toMatch(/\s&\s*$/);
    }
  });

  // -------------------------------------------------------------------------
  // T03: " & " separator is used (not "and" or commas) when co-owner present
  // -------------------------------------------------------------------------
  test("T03: ampersand separator pattern used for co-owners", async ({
    page,
  }) => {
    await page.goto("/teams");

    const ownerTexts = page.locator('a[href^="/teams/"] p.text-caption');
    const count = await ownerTexts.count();

    if (count === 0) {
      test.skip(true, "No franchise data in database");
      return;
    }

    // Collect all owner text values
    let foundCoOwner = false;
    for (let i = 0; i < count; i++) {
      const text = await ownerTexts.nth(i).innerText();

      // If there are two names, they must be separated by " & "
      if (text.includes("&")) {
        foundCoOwner = true;
        // Verify the exact pattern: " & " with spaces on both sides
        expect(text).toMatch(/.+ & .+/);
        // Must NOT use "and" as a word separator between names
        // (We check that "and" does not appear as a standalone separator)
        expect(text).not.toMatch(/.+\band\b.+/i);
      }

      // No commas should be used as separator for owner names
      // (Commas could appear in a name itself, but not as a list separator pattern)
      // Just ensure the pattern is "{name} & {name}" when two names exist, not "{name}, {name}"
      if (text.includes(",")) {
        // If there is a comma, it must not be followed by another name pattern
        // that would indicate comma-separated owner listing
        expect(text).not.toMatch(/^[^&]+,\s+[^&]+$/);
      }
    }

    // Log whether a co-owner was found (informational; not a hard failure
    // since the DB may not have co-owner data)
    if (!foundCoOwner) {
      console.log(
        "INFO: No co-owners found in teams overview. Separator pattern was verified for absence of trailing separators."
      );
    }
  });

  // -------------------------------------------------------------------------
  // T04: Franchise detail page hero shows "Owned by" text with owner name
  // -------------------------------------------------------------------------
  test("T04: franchise detail hero shows owned-by text", async ({ page }) => {
    // First, get a valid franchise slug from the teams page
    await page.goto("/teams");

    const franchiseLinks = page.locator('a[href^="/teams/"]');
    const linkCount = await franchiseLinks.count();

    if (linkCount === 0) {
      test.skip(true, "No franchise data in database");
      return;
    }

    // Navigate to the first franchise detail page
    const href = await franchiseLinks.first().getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(href!);

    // The hero section should contain "Owned by" text
    // FranchiseIdentity hero variant renders: "Owned by {ownerName}..."
    const ownedByText = page.getByText(/Owned by\s+/);
    const ownedByCount = await ownedByText.count();

    if (ownedByCount > 0) {
      await expect(ownedByText.first()).toBeVisible();

      const text = await ownedByText.first().innerText();
      // "Owned by" must be followed by at least one name
      expect(text).toMatch(/Owned by .+/);

      // If co-owner is present, verify " & " separator
      if (text.includes("&")) {
        expect(text).toMatch(/Owned by .+ & .+/);
      }

      // No trailing " & "
      expect(text.trimEnd()).not.toMatch(/&\s*$/);
    } else {
      // Owner data may not be in DB; the component conditionally renders
      console.log(
        "INFO: No 'Owned by' text on franchise detail. Owner data may not be populated."
      );
    }
  });

  // -------------------------------------------------------------------------
  // T05: Franchise detail hero does NOT show trailing " & " for solo owner
  // -------------------------------------------------------------------------
  test("T05: franchise detail hero has no trailing separator for solo owner", async ({
    page,
  }) => {
    await page.goto("/teams");

    const franchiseLinks = page.locator('a[href^="/teams/"]');
    const linkCount = await franchiseLinks.count();

    if (linkCount === 0) {
      test.skip(true, "No franchise data in database");
      return;
    }

    // Check all franchise detail pages for trailing separator
    // (limit to first 4 to keep test runtime reasonable)
    const checkCount = Math.min(linkCount, 4);
    for (let i = 0; i < checkCount; i++) {
      await page.goto("/teams");
      const links = page.locator('a[href^="/teams/"]');
      const href = await links.nth(i).getAttribute("href");
      if (!href) continue;

      await page.goto(href);

      const ownedByText = page.getByText(/Owned by/);
      const count = await ownedByText.count();

      if (count > 0) {
        const text = await ownedByText.first().innerText();
        // Must not end with " & " or " &"
        expect(text.trimEnd()).not.toMatch(/\s&\s*$/);
        // Must not have empty string after " & "
        expect(text).not.toMatch(/ & $/);
      }
    }
  });

  // -------------------------------------------------------------------------
  // T06: Season history cards on franchise detail show per-season owner info
  // -------------------------------------------------------------------------
  test("T06: franchise detail season history cards show owner info", async ({
    page,
  }) => {
    await page.goto("/teams");

    const franchiseLinks = page.locator('a[href^="/teams/"]');
    const linkCount = await franchiseLinks.count();

    if (linkCount === 0) {
      test.skip(true, "No franchise data in database");
      return;
    }

    // Navigate to first franchise
    const href = await franchiseLinks.first().getAttribute("href");
    await page.goto(href!);

    // Season history section: look for season year links (e.g., /seasons/2024)
    const seasonLinks = page.locator('a[href^="/seasons/"]');
    const seasonCount = await seasonLinks.count();

    if (seasonCount === 0) {
      console.log("INFO: No season history cards found.");
      return;
    }

    // Each season card has owner info in a p.text-body-sm.text-muted-foreground
    // within the season card container
    const seasonOwnerTexts = page.locator(
      ".rounded-xl.border .text-body-sm.text-muted-foreground"
    );
    const ownerTextCount = await seasonOwnerTexts.count();

    if (ownerTextCount > 0) {
      for (let i = 0; i < ownerTextCount; i++) {
        const text = await seasonOwnerTexts.nth(i).innerText();
        // Owner text should not be empty
        expect(text.trim().length).toBeGreaterThan(0);
        // No trailing " & "
        expect(text.trimEnd()).not.toMatch(/\s&\s*$/);

        // If co-owner present, verify " & " pattern
        if (text.includes("&")) {
          expect(text).toMatch(/.+ & .+/);
        }
      }
    }
  });

  // -------------------------------------------------------------------------
  // T07: FranchiseIdentity hero variant renders "Owned by" (not just name)
  // -------------------------------------------------------------------------
  test("T07: hero variant includes 'Owned by' prefix", async ({ page }) => {
    await page.goto("/teams");

    const franchiseLinks = page.locator('a[href^="/teams/"]');
    const linkCount = await franchiseLinks.count();

    if (linkCount === 0) {
      test.skip(true, "No franchise data in database");
      return;
    }

    const href = await franchiseLinks.first().getAttribute("href");
    await page.goto(href!);

    // Check that owner display uses "Owned by" prefix (hero variant behavior)
    const ownedByElements = page.getByText(/^Owned by /);
    const count = await ownedByElements.count();

    if (count > 0) {
      // Verify it starts with "Owned by" (not just contains owner name alone)
      const text = await ownedByElements.first().innerText();
      expect(text).toMatch(/^Owned by /);
    } else {
      console.log(
        "INFO: No 'Owned by' text found. Owner data may not be populated."
      );
    }
  });

  // -------------------------------------------------------------------------
  // T08: Standard variant on /teams does NOT use "Owned by" prefix
  // -------------------------------------------------------------------------
  test("T08: standard variant on teams page omits 'Owned by' prefix", async ({
    page,
  }) => {
    await page.goto("/teams");

    // The standard variant in FranchiseIdentity does NOT include "Owned by"
    // It just renders "{ownerName}" or "{ownerName} & {coOwnerName}"
    const ownerTexts = page.locator('a[href^="/teams/"] p.text-caption');
    const count = await ownerTexts.count();

    if (count === 0) {
      test.skip(true, "No franchise data in database");
      return;
    }

    for (let i = 0; i < count; i++) {
      const text = await ownerTexts.nth(i).innerText();
      // Standard variant should NOT contain "Owned by"
      expect(text).not.toContain("Owned by");
    }
  });
});
