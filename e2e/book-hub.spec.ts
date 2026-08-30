import { test, expect } from "@playwright/test";
import { getSql } from "./helpers/sql";

// ============================================================================
// The Book on the hub: line footers on matchup/slate cards, the gold rail
// card, and the standings ladder's "the playoff line" divider.
//
// Drives the real stack (dev server pinned to NFL_STATE_OVERRIDE=regular:1:force
// via the "hub-in-season" Playwright project, plus the real Postgres behind
// POSTGRES_DRIVER=pg). Nothing is mocked. Two guarantees are asserted:
//   1. When book_lines has rows for the hub's own current week, the hub
//      surfaces them (a line footer with a real signed spread, and a CTA into
//      /book). "The hub's own current week" is read off the rendered page
//      itself, not guessed independently, so this agrees with #244's fix: the
//      hub and the query must use the same week.
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

test("the hub always renders, with or without priced lines", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("the hub surfaces The Book's line when a game is priced for the hub's current week", async ({
  page,
}) => {
  test.skip(!(await bookTablesExist()), "book_lines table not present");

  await page.goto("/");

  // Read the hub's own notion of "current week" off the hero itself, which is
  // exactly what AC1 asks the underlying query to agree with, rather than
  // independently guessing a week. The regular-season game-window hero uses
  // "Week N." as its h1; the between-weeks hero (the state NFL_STATE_OVERRIDE
  // =regular:1:force actually lands on pre-kickoff, since no game has started)
  // states the week in its kicker instead ("... Week N ... The Slate Is Set").
  const heroText = await page.locator("main section").first().innerText();
  const weekMatch = /Week\s+(\d+)/i.exec(heroText);
  expect(weekMatch, `could not parse a week number out of hero text "${heroText}"`).not.toBeNull();
  const week = Number(weekMatch![1]);

  const sql = getSql();
  const rows = (await sql`
    SELECT COUNT(*)::int AS n
    FROM "book_lines"
    WHERE "season_id" = (SELECT "id" FROM "seasons" ORDER BY "season_year" DESC LIMIT 1)
      AND "week" = ${week}`) as { n: number }[];
  const n = rows[0]?.n ?? 0;

  test.skip(n === 0, `no priced lines for week ${week}`);

  // A real signed spread chip from a hub card's Book footer, and a CTA that
  // actually points at /book. If the wiring regressed to an empty footer,
  // neither of these would be on the page.
  const bookCta = page.getByRole("link", { name: /^(Pick|The Book)\s*→$/ }).first();
  await expect(bookCta).toBeVisible();
  await expect(bookCta).toHaveAttribute("href", "/book");

  const spreadChips = page.locator("span.font-mono").filter({ hasText: /[+-]\d+(\.\d+)?/ });
  expect(await spreadChips.count()).toBeGreaterThan(0);
});
