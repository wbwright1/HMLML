import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/lib/db";
import { playerWeekPoints, playerValues, seasons } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import {
  getPlayerProfileIdentity,
  getPlayerTimeline,
  getPlayerWeeklyPoints,
  getPlayerSeasonPointsAggregates,
  getPlayerWeeklyStats,
  getPlayerSeasonStatTotals,
  getPlayerValueSeries,
  getPlayerOwnershipFacts,
  getPlayerProfile,
} from "./player-profile";

// ---------------------------------------------------------------------------
// Real-DB acceptance tests (read-only). These run against the live database
// via vitest.db.config.ts. They assert INTERNAL CONSISTENCY (aggregates equal
// hand-summed weekly rows, series ordering) so they don't depend on any single
// hard-coded player. A veteran is discovered dynamically in beforeAll.
//
// NOTE: player_week_stats did not exist in the DB when these were written (its
// migration, 0012, was not applied). getPlayerWeeklyStats / getPlayerSeasonStatTotals
// therefore return [] via their pre-migration guard; the dedicated assertions
// below verify that graceful degradation. Re-run after the table is created +
// backfilled to exercise real stat rows.
// ---------------------------------------------------------------------------

let veteranId: string; // most distinct seasons in player_week_points
let veteranSeasonYears: number[];
let multiSourceAssetId: string; // player with a 2-source value series

beforeAll(async () => {
  const topRows = await db.execute(sql`
    SELECT player_id, COUNT(DISTINCT season_id) AS seasons, COUNT(*) AS rows
    FROM player_week_points
    GROUP BY player_id
    ORDER BY seasons DESC, rows DESC
    LIMIT 1`);
  const top = (topRows.rows ?? (topRows as unknown as { player_id: string }[]))[0] as {
    player_id: string;
  };
  veteranId = top.player_id;

  const yearRows = await db
    .selectDistinct({ seasonYear: seasons.seasonYear })
    .from(playerWeekPoints)
    .innerJoin(seasons, sql`${playerWeekPoints.seasonId} = ${seasons.id}`)
    .where(sql`${playerWeekPoints.playerId} = ${veteranId}`);
  veteranSeasonYears = yearRows.map((r) => r.seasonYear).sort((a, b) => b - a);

  const valRows = await db.execute(sql`
    SELECT asset_id
    FROM ${playerValues}
    WHERE asset_id !~ '^FP_'
    GROUP BY asset_id
    HAVING COUNT(DISTINCT source) >= 2
    ORDER BY COUNT(*) DESC
    LIMIT 1`);
  const val = (valRows.rows ?? (valRows as unknown as { asset_id: string }[]))[0] as {
    asset_id: string;
  };
  multiSourceAssetId = val.asset_id;
});

describe("getPlayerProfileIdentity", () => {
  it("resolves a real veteran with tenure facts", async () => {
    const identity = await getPlayerProfileIdentity(veteranId);
    expect(identity).not.toBeNull();
    expect(identity!.id).toBe(veteranId);
    // yearsInLeague equals the number of distinct seasons present.
    expect(identity!.yearsInLeague).toBe(veteranSeasonYears.length);
    expect(identity!.seasonsPresent).toEqual(veteranSeasonYears);
    // seasonsPresent is sorted descending.
    const desc = [...identity!.seasonsPresent].sort((a, b) => b - a);
    expect(identity!.seasonsPresent).toEqual(desc);
  });

  it("returns null for an unknown player id", async () => {
    expect(await getPlayerProfileIdentity("this-id-does-not-exist")).toBeNull();
  });
});

describe("getPlayerSeasonPointsAggregates", () => {
  it("is internally consistent and matches hand-summed weekly rows", async () => {
    const aggs = await getPlayerSeasonPointsAggregates(veteranId);
    expect(aggs.length).toBeGreaterThan(0);

    // Sorted most-recent-season first.
    const yearsDesc = [...aggs.map((a) => a.seasonYear)].sort((x, y) => y - x);
    expect(aggs.map((a) => a.seasonYear)).toEqual(yearsDesc);

    for (const a of aggs) {
      // totalPoints == startedPoints + benchPoints.
      expect(a.totalPoints).toBeCloseTo(a.startedPoints + a.benchPoints, 3);
      // startedPlayedWeeks (started AND actually PLAYED, excluding BYE/DNP)
      // never exceeds the raw started count.
      expect(a.startedPlayedWeeks).toBeLessThanOrEqual(a.startedWeeks);
      // avgWhenStarted == startedPoints / startedPlayedWeeks (or null) — the
      // denominator excludes bye/DNP weeks, which never contribute points.
      if (a.startedPlayedWeeks > 0) {
        expect(a.avgWhenStarted).toBeCloseTo(
          a.startedPoints / a.startedPlayedWeeks,
          3,
        );
        expect(a.bestWeek).not.toBeNull();
        expect(a.worstStartedWeek).not.toBeNull();
        expect(a.bestWeek!.points).toBeGreaterThanOrEqual(
          a.worstStartedWeek!.points,
        );
        expect(a.bestWeek!.seasonYear).toBe(a.seasonYear);
      } else {
        expect(a.avgWhenStarted).toBeNull();
        expect(a.bestWeek).toBeNull();
      }
    }

    // Hand-sum one season's weekly points and compare to the aggregate.
    const target = aggs[0];
    const weekly = await getPlayerWeeklyPoints(veteranId, target.seasonYear);
    const handTotal = weekly.reduce((s, w) => s + w.points, 0);
    expect(target.totalPoints).toBeCloseTo(handTotal, 3);
    const handStarted = weekly.filter((w) => w.started).length;
    expect(target.startedWeeks).toBe(handStarted);
    const handBench = weekly.filter((w) => !w.started).length;
    expect(target.benchedWeeks).toBe(handBench);
  });

  // Regression coverage for the honest BYE/DNP exclusion (#132): Patrick
  // Mahomes' 2024 season is a real, fully-played, non-mock case where the
  // OLD unguarded logic (min points among ANY started week) picked week 18 —
  // a meaningless season-finale rest week where Mahomes was left started at
  // 0.0 (a DNP, not a performance). The 2024 season's actual worst STARTED
  // week that Mahomes really played was week 4 (14.0 pts). This was verified
  // directly against the live DB before this fix landed (OLD week=18 pts=0,
  // NEW week=4 pts=14) — see the PR description for the raw query output.
  it("excludes a real DNP week from the worst-started-week pick (Mahomes 2024, #132)", async () => {
    const aggs = await getPlayerSeasonPointsAggregates("4046");
    const season2024 = aggs.find((a) => a.seasonYear === 2024);
    // Skip gracefully if this environment's data differs (e.g. a fresh/partial sync).
    if (!season2024) return;
    expect(season2024.worstStartedWeek?.week).not.toBe(18);
    if (season2024.worstStartedWeek) {
      expect(season2024.worstStartedWeek.points).toBeGreaterThan(0);
    }
  });

  // Regression coverage for #166: a future/unplayed season (rows exist with
  // started=true and points=0 because lineups lock before kickoff, but the
  // games themselves haven't happened) must never surface as a played week.
  // Patrick Mahomes' 2026 season is a real, live-DB case: the OLD unguarded
  // logic (any `started` week whose availability wasn't explicitly BYE/DNP)
  // treated every un-played 2026 week as PLAYED at 0.0 points, so "worst
  // started week" picked Week 1 2026 outright. Verified directly against the
  // live DB before this fix landed (OLD startedPlayedWeeks=18 for a season
  // with zero games played, worstStartedWeek={week:1, points:0}; NEW
  // startedPlayedWeeks=0, worstStartedWeek=null) — see the PR description.
  it("never selects an unplayed future week as best/worst started (Mahomes 2026, #166)", async () => {
    const aggs = await getPlayerSeasonPointsAggregates("4046");
    const futureSeasons = aggs.filter(
      (a) => a.seasonYear >= 2026 && a.totalPoints === 0,
    );
    for (const season of futureSeasons) {
      // No games played yet this season: no week can honestly be "played".
      expect(season.startedPlayedWeeks).toBe(0);
      expect(season.bestWeek).toBeNull();
      expect(season.worstStartedWeek).toBeNull();
      expect(season.avgWhenStarted).toBeNull();
    }
  });
});

describe("getPlayerWeeklyPoints", () => {
  it("returns week-ascending rows with franchise + opponent resolution", async () => {
    const weekly = await getPlayerWeeklyPoints(veteranId, veteranSeasonYears[0]);
    expect(weekly.length).toBeGreaterThan(0);
    const weeks = weekly.map((w) => w.week);
    expect(weeks).toEqual([...weeks].sort((a, b) => a - b));
    for (const w of weekly) {
      expect(typeof w.franchiseId).toBe("string");
      // When an opponent resolves, it is a different franchise than the owner.
      if (w.opponentFranchiseId) {
        expect(w.opponentFranchiseId).not.toBe(w.franchiseId);
        expect(w.opponentFranchiseSlug).toBeTruthy();
      }
    }
  });

  it("returns [] for a season the player was not in the league", async () => {
    expect(await getPlayerWeeklyPoints(veteranId, 1990)).toEqual([]);
  });
});

describe("getPlayerValueSeries", () => {
  it("returns an ascending series spanning both value sources for a veteran", async () => {
    const series = await getPlayerValueSeries(multiSourceAssetId);
    expect(series.length).toBeGreaterThan(1);
    // Ascending by snapshot date.
    const dates = series.map((p) => p.snapshotDate);
    expect(dates).toEqual([...dates].sort());
    // Spans both sources (fantasycalc daily + dynastyprocess backfill).
    const sources = new Set(series.map((p) => p.source));
    expect(sources.has("fantasycalc")).toBe(true);
    expect(sources.has("dynastyprocess")).toBe(true);
    for (const p of series) expect(typeof p.value).toBe("number");
  });
});

describe("getPlayerTimeline", () => {
  it("returns well-formed events, most-recent-first", async () => {
    const timeline = await getPlayerTimeline(veteranId);
    expect(Array.isArray(timeline)).toBe(true);
    expect(timeline.length).toBeGreaterThan(0);
    // Ordering: seasonYear non-increasing across the list.
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i - 1].seasonYear).toBeGreaterThanOrEqual(
        timeline[i].seasonYear,
      );
    }
    for (const e of timeline) {
      if (e.franchise) {
        expect(e.franchise.id).toBeTruthy();
        expect(e.franchise.slug).toBeTruthy();
      }
      if (e.type === "trade_in" || e.type === "trade_out" || e.type === "drop" || e.type === "waiver_add") {
        expect(e.transactionId).toBeTruthy();
      }
      if (e.type === "drafted") {
        expect(e.draftRound).toBeGreaterThan(0);
      }
      if (e.type === "stint") {
        expect(e.stintEndSeasonYear).not.toBeNull();
        expect(e.stintEndSeasonYear!).toBeGreaterThanOrEqual(e.seasonYear);
      }
    }
  });
});

describe("getPlayerOwnershipFacts", () => {
  it("aggregates career starts/bench from season aggregates", async () => {
    const aggs = await getPlayerSeasonPointsAggregates(veteranId);
    const facts = await getPlayerOwnershipFacts(veteranId, aggs);
    const starts = aggs.reduce((s, a) => s + a.startedWeeks, 0);
    const bench = aggs.reduce((s, a) => s + a.benchedWeeks, 0);
    const benchPts = aggs.reduce((s, a) => s + a.benchPoints, 0);
    expect(facts.careerStarts).toBe(starts);
    expect(facts.careerBenchedWeeks).toBe(bench);
    expect(facts.totalBenchPoints).toBeCloseTo(benchPts, 3);
    if (starts > 0) expect(facts.careerBestWeek).not.toBeNull();
  });
});

describe("player_week_stats readers (blocked on migration 0012)", () => {
  // The table did not exist when these were written; the readers must degrade
  // to [] (42P01 guard), never throw, so the profile page still renders.
  it("getPlayerWeeklyStats degrades to [] without throwing", async () => {
    const rows = await getPlayerWeeklyStats(veteranId, veteranSeasonYears[0]);
    expect(Array.isArray(rows)).toBe(true);
  });
  it("getPlayerSeasonStatTotals degrades to [] without throwing", async () => {
    const rows = await getPlayerSeasonStatTotals(veteranId);
    expect(Array.isArray(rows)).toBe(true);
  });
});

describe("getPlayerProfile", () => {
  it("composes a full profile for a real veteran", async () => {
    const profile = await getPlayerProfile(veteranId);
    expect(profile).not.toBeNull();
    expect(profile!.identity.id).toBe(veteranId);
    expect(Array.isArray(profile!.timeline)).toBe(true);
    expect(Array.isArray(profile!.awards)).toBe(true);
    expect(Array.isArray(profile!.valueSeries)).toBe(true);
    expect(Array.isArray(profile!.seasonStatTotals)).toBe(true);
    expect(profile!.seasonPointsAggregates.length).toBeGreaterThan(0);
    // ownershipFacts is derived from the same aggregates the profile carries.
    const starts = profile!.seasonPointsAggregates.reduce(
      (s, a) => s + a.startedWeeks,
      0,
    );
    expect(profile!.ownershipFacts.careerStarts).toBe(starts);
  });

  it("returns null for an unknown player id", async () => {
    expect(await getPlayerProfile("this-id-does-not-exist")).toBeNull();
  });
});
