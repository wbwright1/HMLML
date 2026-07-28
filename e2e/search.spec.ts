import { test, expect } from "@playwright/test";

// A common surname — a seeded players table (full Sleeper set) will match several.
const QUERY = "smith";

test.describe("Site search — API contract", () => {
  test("rejects a 1-character query with the standard error shape", async ({
    request,
  }) => {
    const res = await request.get("/api/search?q=a");
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("message");
    expect(body.error.code).toBe("INVALID_QUERY");
  });

  test("returns the documented shape for a valid query", async ({ request }) => {
    const res = await request.get(`/api/search?q=${QUERY}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("syncedAt");
    expect(Array.isArray(body.data.franchises)).toBe(true);
    expect(Array.isArray(body.data.players)).toBe(true);
    expect(body.data.franchises.length).toBeLessThanOrEqual(8);
    expect(body.data.players.length).toBeLessThanOrEqual(8);
  });
});

test.describe("Site search — desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  const desktopInput = (page: import("@playwright/test").Page) =>
    page.getByRole("combobox", { name: "Search league" });

  test("Cmd/Ctrl+K focuses the topbar search field", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("ControlOrMeta+k");
    await expect(desktopInput(page)).toBeFocused();
  });

  test("typing >= 2 chars opens a grouped results listbox", async ({ page }) => {
    await page.goto("/");
    const input = desktopInput(page);
    await input.click();
    await input.fill(QUERY);

    const listbox = page.getByRole("listbox", { name: "Search results" });
    await expect(listbox).toBeVisible();
    // Either grouped options or the snarky empty state.
    const options = listbox.getByRole("option");
    const optionCount = await options.count();
    if (optionCount > 0) {
      await expect(listbox.getByRole("group").first()).toBeVisible();
    } else {
      await expect(
        listbox.getByText("Maybe they were traded away.")
      ).toBeVisible();
    }
  });

  test("ArrowDown then Enter navigates to the active option", async ({
    page,
  }) => {
    await page.goto("/");
    const input = desktopInput(page);
    await input.click();
    await input.fill(QUERY);

    const listbox = page.getByRole("listbox", { name: "Search results" });
    await expect(listbox).toBeVisible();
    const options = listbox.getByRole("option");
    expect(await options.count()).toBeGreaterThan(0);

    await input.press("ArrowDown");
    const activeId = await input.getAttribute("aria-activedescendant");
    expect(activeId).toBeTruthy();

    const activeOption = page.locator(`[id="${activeId}"]`);
    const href = await activeOption.getAttribute("href");
    expect(href).toBeTruthy();

    await input.press("Enter");
    await page.waitForURL((url) => (url.pathname + url.search).includes(href!.split("?")[0]));
  });

  test("option hrefs target team and player routes", async ({ page }) => {
    await page.goto("/");
    const input = desktopInput(page);
    await input.click();
    await input.fill(QUERY);

    const listbox = page.getByRole("listbox", { name: "Search results" });
    await expect(listbox).toBeVisible();
    const options = listbox.getByRole("option");
    const count = await options.count();
    for (let i = 0; i < count; i++) {
      const href = await options.nth(i).getAttribute("href");
      expect(href).toBeTruthy();
      expect(
        href!.startsWith("/teams/") || href!.startsWith("/players")
      ).toBe(true);
    }
  });

  test("result rows carry imagery: player headshots and franchise logos", async ({
    page,
  }) => {
    await page.goto("/");
    const input = desktopInput(page);
    await input.click();
    await input.fill(QUERY);

    const listbox = page.getByRole("listbox", { name: "Search results" });
    await expect(listbox).toBeVisible();

    // Player rows lead with a headshot: either the loaded <img> or the
    // synchronous initials monogram ([role="img"]), wrapped aria-hidden so
    // the option's accessible name stays text-only.
    const playersGroup = listbox.getByRole("group", { name: "Players" });
    const firstPlayer = playersGroup.getByRole("option").first();
    await expect(firstPlayer).toBeVisible();
    await expect(
      firstPlayer.locator('img, [role="img"]').first()
    ).toBeVisible();

    // Franchise rows render the FranchiseLogo box (image or monogram) if any
    // team matches the query; tolerate zero team matches for a player query.
    const teamsGroup = listbox.getByRole("group", { name: "Teams" });
    if ((await teamsGroup.count()) > 0) {
      const firstTeam = teamsGroup.getByRole("option").first();
      const logoBox = firstTeam.locator("span, img").first();
      await expect(logoBox).toBeVisible();
    }
  });

  test("Escape closes the results listbox", async ({ page }) => {
    await page.goto("/");
    const input = desktopInput(page);
    await input.click();
    await input.fill(QUERY);
    await expect(
      page.getByRole("listbox", { name: "Search results" })
    ).toBeVisible();

    await input.press("Escape");
    await expect(
      page.getByRole("listbox", { name: "Search results" })
    ).toHaveCount(0);
  });
});

test.describe("Site search — mobile sheet", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("header search icon opens a full-screen sheet and returns focus on close", async ({
    page,
  }) => {
    await page.goto("/");

    const trigger = page.getByRole("button", {
      name: "Search teams, players, records",
    });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Search" });
    await expect(dialog).toBeVisible();

    // Input inside the sheet is autofocused.
    const input = dialog.getByRole("combobox", { name: "Search league" });
    await expect(input).toBeFocused();

    // Close returns focus to the dock trigger.
    await page.getByRole("button", { name: "Close search" }).click();
    await expect(page.getByRole("dialog", { name: "Search" })).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("a query in the mobile sheet navigates to a result", async ({
    page,
  }) => {
    await page.goto("/");
    const trigger = page.getByRole("button", {
      name: "Search teams, players, records",
    });
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Search" });
    await expect(dialog).toBeVisible();

    const input = dialog.getByRole("combobox", { name: "Search league" });
    await input.fill(QUERY);

    const listbox = page.getByRole("listbox", { name: "Search results" });
    const options = listbox.getByRole("option");
    await expect(options.first()).toBeVisible();
    const href = await options.first().getAttribute("href");
    expect(href).toBeTruthy();

    await options.first().click();
    await page.waitForURL((url) =>
      (url.pathname + url.search).includes(href!.split("?")[0])
    );
    await expect(page.getByRole("dialog", { name: "Search" })).toHaveCount(0);
  });

  test("Escape closes the mobile sheet", async ({ page }) => {
    await page.goto("/");
    const trigger = page.getByRole("button", {
      name: "Search teams, players, records",
    });
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Search" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("combobox", { name: "Search league" }).press("Escape");
    await expect(page.getByRole("dialog", { name: "Search" })).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});
