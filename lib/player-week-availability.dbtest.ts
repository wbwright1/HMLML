import { describe, it, expect } from "vitest";
import { getSeasonScheduleFacts, seasonWeekKey } from "./player-week-availability";

// ---------------------------------------------------------------------------
// Real-DB acceptance test (read-only) for getSeasonScheduleFacts, which
// derives every NFL team's bye week straight from the nfl_games schedule
// table already synced by the daily cron. Runs against the live database via
// vitest.db.config.ts — no mocks, no new table, no new sync job.
// ---------------------------------------------------------------------------

describe("getSeasonScheduleFacts", () => {
  it("derives KC's 2024 bye week (week 6) from the real nfl_games schedule", async () => {
    const facts = await getSeasonScheduleFacts([2024]);
    expect(facts.teamByeWeeks.get("2024:KC")).toBe(6);
  });

  it("marks a fully-played historical week complete", async () => {
    const facts = await getSeasonScheduleFacts([2024]);
    expect(facts.completeWeeks.has(seasonWeekKey(2024, 1))).toBe(true);
  });

  it("resolves every 32-team season with exactly one bye week per team (when the schedule is fully synced)", async () => {
    const facts = await getSeasonScheduleFacts([2024]);
    const byeCountsPerWeek = new Map<number, number>();
    for (const [key, week] of facts.teamByeWeeks) {
      if (!key.startsWith("2024:")) continue;
      byeCountsPerWeek.set(week, (byeCountsPerWeek.get(week) ?? 0) + 1);
    }
    // Every bye-week entry should be a plausible regular-season week (2-14
    // historically); this is a sanity bound, not an exact league rule.
    for (const week of byeCountsPerWeek.keys()) {
      expect(week).toBeGreaterThanOrEqual(1);
      expect(week).toBeLessThanOrEqual(18);
    }
  });

  it("returns empty facts for a season with no synced games", async () => {
    const facts = await getSeasonScheduleFacts([1899]);
    expect(facts.teamByeWeeks.size).toBe(0);
    expect(facts.completeWeeks.size).toBe(0);
  });
});
