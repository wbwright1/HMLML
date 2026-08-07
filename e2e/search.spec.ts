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

  const FANTASY_POSITIONS = ["QB", "RB", "WR", "TE", "K"];

  test("a full multi-word name matches, spaceless search_full_name style", async ({
    request,
  }) => {
    // Headline regression: this query returns nothing on prod today because the
    // old normalizer kept the space while search_full_name has none.
    const res = await request.get("/api/search?q=Darius%20Cooper");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(
      body.data.players.some((p: { name: string }) => p.name === "Darius Cooper")
    ).toBe(true);
  });

  test("a common single-word surname surfaces fantasy-relevant players ahead of the OL/IDP tail, within the 8-result cap", async ({
    request,
  }) => {
    const res = await request.get("/api/search?q=cooper");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const players: { name: string; position: string | null }[] =
      body.data.players;

    expect(players.some((p) => p.name === "Darius Cooper")).toBe(true);

    // No regression on the case that already worked: a single-word query
    // still surfaces the well-known rostered player.
    expect(players.some((p) => p.name === "Cooper Kupp")).toBe(true);

    // Fantasy-relevant positions should lead; non-fantasy positions (OL/IDP)
    // should not appear ahead of fantasy ones unless the list is shorter
    // than 8 (asserted structurally, not as one exact permutation, so a
    // future stats sync doesn't turn this into a flake).
    const firstNonFantasyIndex = players.findIndex(
      (p) => !p.position || !FANTASY_POSITIONS.includes(p.position)
    );
    if (firstNonFantasyIndex !== -1) {
      const lastFantasyIndex = players
        .map((p, i) => ({ i, isFantasy: !!p.position && FANTASY_POSITIONS.includes(p.position) }))
        .filter((x) => x.isFantasy)
        .map((x) => x.i)
        .pop();
      if (lastFantasyIndex !== undefined) {
        expect(lastFantasyIndex).toBeLessThan(
          players.length === 8 ? firstNonFantasyIndex + 1 : Infinity
        );
      }
    }
  });

  test("a real multi-word franchise name still matches", async ({
    request,
  }) => {
    // "call" matches two real seeded franchises by name: "Better call Hall"
    // and "Better call Myballs".
    const res = await request.get("/api/search?q=call");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data.franchises.length).toBeGreaterThan(0);
    expect(
      body.data.franchises.some((f: { name: string }) =>
        f.name.toLowerCase().includes("call")
      )
    ).toBe(true);
  });

  // Real franchise abbreviations, populated by the daily sync from the
  // word-initial acronym rule. These are exact, unique values: each query must
  // resolve to exactly one team.
  const ABBREVIATION_CASES: [string, string][] = [
    ["TTT", "the-tokyo-thunderbirds"],
    ["OMM", "of-mice-and-mendoza"],
    ["PTP", "pay-the-price"],
    ["LDL", "latter-day-lamb-special"],
    ["BGS", "bucky-s-general-store"],
    ["OG", "olave-garden"],
  ];

  test("every franchise carries a well-formed abbreviation", async ({
    request,
  }) => {
    // Search by a substring every team name shares is impossible, so probe the
    // abbreviations themselves: each must come back non-null and 2-3 chars.
    for (const [abbr, slug] of ABBREVIATION_CASES) {
      const res = await request.get(`/api/search?q=${abbr}`);
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      const match = body.data.franchises.find(
        (f: { slug: string }) => f.slug === slug
      );
      expect(match, `expected ${abbr} to match ${slug}`).toBeTruthy();
      expect(match.abbreviation).toBe(abbr);
      expect(match.abbreviation).toMatch(/^[A-Z0-9]{2,3}$/);
    }
  });

  test("abbreviation search is case-insensitive", async ({ request }) => {
    for (const [abbr, slug] of ABBREVIATION_CASES) {
      const res = await request.get(`/api/search?q=${abbr.toLowerCase()}`);
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(
        body.data.franchises.some((f: { slug: string }) => f.slug === slug)
      ).toBe(true);
    }
  });

  test("a symbol-only query returns an empty player list, not a 500", async ({
    request,
  }) => {
    const res = await request.get("/api/search?q=%21%21%21");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data.players).toEqual([]);
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

  test("typing a franchise abbreviation finds the team and navigates to it", async ({
    page,
  }) => {
    // This is the case that could not pass before abbreviations were
    // populated: "OMM" appears nowhere in "Of Mice and Mendoza".
    await page.goto("/");
    const input = desktopInput(page);
    await input.click();
    await input.fill("OMM");

    const listbox = page.getByRole("listbox", { name: "Search results" });
    await expect(listbox).toBeVisible();

    const teamOption = listbox
      .getByRole("group", { name: "Teams" })
      .getByRole("option")
      .first();
    await expect(teamOption).toBeVisible();
    await expect(teamOption).toContainText("Of Mice and Mendoza");
    expect(await teamOption.getAttribute("href")).toBe(
      "/teams/of-mice-and-mendoza"
    );

    await teamOption.click();
    await page.waitForURL("**/teams/of-mice-and-mendoza");
    await expect(
      page.getByRole("heading", { name: /Of Mice and Mendoza/i }).first()
    ).toBeVisible();
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
