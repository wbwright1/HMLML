import { test, expect } from "@playwright/test";

// The league ran a full startup redraft between the 2022 and 2023 seasons.
// Trade 1092 (league year 2022) included a 2023 Round 1 pick that never
// conveyed because the redraft reset the board; it must render VOIDED, never
// a resolved "became" player. Trade 58 (league year 2023, made DURING the
// 2023 startup draft) is real and must render its resolved picks normally.

test.describe("Voided redraft picks", () => {
  test("trade 1092 (2022) shows the VOIDED badge and never claims a became player", async ({
    page,
  }) => {
    await page.goto("/trades?season=2022");
    const card = page.locator("#trade-1092");
    await expect(card).toBeVisible();

    await expect(card.getByText("Voided", { exact: true })).toBeVisible();
    await expect(
      card.getByText("Never conveyed. The 2023 redraft reset the board.")
    ).toBeVisible();

    // The phantom "became Lamar Jackson" resolution must not appear anywhere
    // on this card: this is the confirmed live bug the fix closes.
    await expect(card).not.toContainText("became Lamar Jackson");
    await expect(card.getByText("became", { exact: true })).toHaveCount(0);
  });

  test("trade 58 (2023 in-draft) shows a normal resolved pick with no VOIDED badge", async ({
    page,
  }) => {
    await page.goto("/trades?season=2023");
    const card = page.locator("#trade-58");
    await expect(card).toBeVisible();

    // Real, in-draft trade: no voided treatment anywhere on this card.
    await expect(card.getByText("Voided", { exact: true })).toHaveCount(0);
    await expect(card).not.toContainText("Never conveyed");

    // At least one of its picks resolves normally to a "became" player.
    await expect(card.getByText("became", { exact: true }).first()).toBeVisible();
  });
});
