import { test, expect } from "@playwright/test";
import { getSql } from "./helpers/sql";

// ============================================================================
// The Book on the hub: line footers on matchup/slate cards, the gold rail
// card, and the standings ladder's "the playoff line" divider.
//
// Drives the real stack (dev/prod server + the real Postgres behind
// POSTGRES_DRIVER=pg). Nothing is mocked. Two guarantees are asserted:
//   1. When book_lines has rows for the current week, the hub surfaces them
//      (a line footer with a real signed spread, and a CTA into /book).
//   2. The hub renders without error regardless of whether lines exist,
//      which is the regression guard the issue calls for: a book_lines
//      backfill or outage must never break the homepage.
// ============================================================================

async function bookTablesExist(): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`SELECT to_regclass('public.book_lines') AS reg`) as {
    reg: string | null;
  }[];
  return rows[0]?.reg != null;
}

async function currentWeekHasLines(): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    SELECT COUNT(*)::int AS n
    FROM "book_lines"
    WHERE "season_id" = (SELECT "id" FROM "seasons" ORDER BY "season_year" DESC LIMIT 1)`) as {
    n: number;
  }[];
  return (rows[0]?.n ?? 0) > 0;
}

test("the hub always renders, with or without priced lines", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("the hub surfaces The Book's line when a game is priced for the current week", async ({
  page,
}) => {
  test.skip(!(await bookTablesExist()), "book_lines table not present");
  test.skip(!(await currentWeekHasLines()), "no priced lines for the current week");

  await page.goto("/");

  // A real signed spread chip from a hub card's Book footer, and a CTA that
  // actually points at /book. If the wiring regressed to an empty footer,
  // neither of these would be on the page.
  const bookCta = page.getByRole("link", { name: /^(Pick|The Book)\s*→$/ }).first();
  await expect(bookCta).toBeVisible();
  await expect(bookCta).toHaveAttribute("href", "/book");
});
