import { test, expect } from "@playwright/test";
import { getSql } from "./helpers/sql";

// ============================================================================
// /api/live-scores polls the week the hub shows (#312)
//
// The route used to take "current week" as max(matchups.week). The hourly sync
// pre-writes the whole regular-season schedule, so that max is the LAST week
// (14) all season: the poller refreshed week 14 through week 3, returned
// week-14 pairings to every island, and the matchup-detail island saw a week
// mismatch and stopped polling. Both now resolve through resolveCurrentWeek.
//
// Runs under the "hub-in-season" project (NFL_STATE_OVERRIDE=regular:next:force),
// so the NFL week is the earliest all-scheduled week of the live season: a week
// strictly below the max synced week while the season is under way. That is
// exactly the gap the old max(week) code fell into.
// ============================================================================

interface LiveScore {
  matchupId: number;
  homeTeamId: string;
  awayTeamId: string;
}

test.describe("/api/live-scores current week (#312)", () => {
  test("polls the same week the hub renders, not the highest synced week", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    const kicker = (await page.getByTestId("hero-kicker").innerText()).trim();
    const hubWeek = Number(/WEEK (\d+)/i.exec(kicker)?.[1]);
    expect(hubWeek).toBeGreaterThan(0);

    const res = await request.get("/api/live-scores");
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as {
      data: { week: number; seasonYear: number; scores: LiveScore[] };
    };
    expect(body.data.week).toBe(hubWeek);

    // The exact regression: the resolved week is not simply max(week).
    const sql = getSql();
    const [{ max_week }] = (await sql`
      SELECT max(m.week)::int AS max_week
      FROM matchups m JOIN seasons s ON s.id = m.season_id
      WHERE s.season_year = ${body.data.seasonYear}
    `) as { max_week: number }[];
    expect(body.data.week).toBeLessThan(max_week);

    // Every pairing returned is that week's pairing in the DB, and none are missing.
    const rows = (await sql`
      SELECT m.matchup_id, m.franchise_id
      FROM matchups m JOIN seasons s ON s.id = m.season_id
      WHERE s.season_year = ${body.data.seasonYear} AND m.week = ${body.data.week}
    `) as { matchup_id: number; franchise_id: string }[];
    const dbPairs = new Map<number, string[]>();
    for (const r of rows) {
      dbPairs.set(r.matchup_id, [...(dbPairs.get(r.matchup_id) ?? []), r.franchise_id]);
    }
    const expected = [...dbPairs.entries()]
      .filter(([, ids]) => ids.length === 2)
      .map(([id, ids]) => `${id}:${[...ids].sort().join("|")}`)
      .sort();
    const actual = body.data.scores
      .map((s) => `${s.matchupId}:${[s.homeTeamId, s.awayTeamId].sort().join("|")}`)
      .sort();
    expect(actual.length).toBeGreaterThan(0);
    expect(actual).toEqual(expected);
  });
});
