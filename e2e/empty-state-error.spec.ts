import { test, expect } from "@playwright/test";

test.describe("AC2: 404 Page", () => {
  const notFoundUrl = "/this-route-does-not-exist-qa-1234";

  test("FE-T06: renders exact title copy", async ({ page }) => {
    const response = await page.goto(notFoundUrl);
    expect(response?.status()).toBe(404);

    const h1 = page.locator("h1");
    await expect(h1).toHaveText("This page doesn't exist.");
    await expect(h1).not.toHaveText(/Page not found/);
    await expect(h1).not.toHaveText(/Oops/);
  });

  test("FE-T07: displays exact snarky body copy", async ({ page }) => {
    await page.goto(notFoundUrl);

    const body = page.getByText("Maybe it was traded away.");
    await expect(body).toBeVisible();

    // No em-dash in text
    const text = await body.textContent();
    expect(text).not.toContain("\u2014");
  });

  test("FE-T08: Go to Hub link navigates to /", async ({ page }) => {
    await page.goto(notFoundUrl);

    const hubLink = page.getByRole("link", { name: "Go to Hub" });
    await expect(hubLink).toBeVisible();
    await expect(hubLink).toHaveAttribute("href", "/");

    await hubLink.click();
    await expect(page).toHaveURL("/");
  });

  test("FE-T09: Browse Teams link navigates to /teams", async ({ page }) => {
    await page.goto(notFoundUrl);

    const teamsLink = page.getByRole("link", { name: "Browse Teams" });
    await expect(teamsLink).toBeVisible();
    await expect(teamsLink).toHaveAttribute("href", "/teams");

    await teamsLink.click();
    await expect(page).toHaveURL("/teams");
  });

  test("EDGE-T01: deeply nested non-existent route shows 404", async ({
    page,
  }) => {
    await page.goto("/x/y/z/deeply/nested/nonexistent");

    const h1 = page.locator("h1");
    await expect(h1).toHaveText("This page doesn't exist.");

    const body = page.getByText("Maybe it was traded away.");
    await expect(body).toBeVisible();

    await expect(
      page.getByRole("link", { name: "Go to Hub" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Browse Teams" })
    ).toBeVisible();
  });
});

test.describe("AC3: Error Boundary", () => {
  test("FE-T11: displays exact title copy", async ({ page }) => {
    await page.goto("/test/error-trigger");

    const h1 = page.locator("h1");
    await expect(h1).toHaveText("Something went wrong");
    await expect(h1).not.toHaveText(/Oops/);
    await expect(h1).not.toHaveText(/Uh oh/);
  });

  test("FE-T12: displays primary description without em-dashes", async ({
    page,
  }) => {
    await page.goto("/test/error-trigger");

    const description = page.locator("p").first();
    await expect(description).toContainText(
      "Data is temporarily unavailable. This may be a sync issue. Try refreshing in a moment."
    );

    const text = await description.textContent();
    expect(text).not.toContain("\u2014");
    expect(text).not.toContain("If the problem persists");
  });

  test("FE-T13: displays last-data assurance line", async ({ page }) => {
    await page.goto("/test/error-trigger");

    const assurance = page.getByText(
      "We're showing the last available data."
    );
    await expect(assurance).toBeVisible();
  });

  test("FE-T14: Try again button is visible and clickable", async ({
    page,
  }) => {
    await page.goto("/test/error-trigger");

    const tryAgainBtn = page.getByRole("button", { name: "Try again" });
    await expect(tryAgainBtn).toBeVisible();

    // Click the button; since the fixture always throws, the error page re-renders
    await tryAgainBtn.click();

    // Error page should re-render with the same content
    await expect(
      page.locator("h1", { hasText: "Something went wrong" })
    ).toBeVisible();
  });

  test("FE-T15: Go home link navigates to /", async ({ page }) => {
    await page.goto("/test/error-trigger");

    const goHomeLink = page.getByRole("link", { name: "Go home" });
    await expect(goHomeLink).toBeVisible();
    await expect(goHomeLink).toHaveAttribute("href", "/");

    await goHomeLink.click();
    await expect(page).toHaveURL("/");
  });
});
