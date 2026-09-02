import { describe, expect, it } from "vitest";
import { buildPowerPreview } from "@/lib/queries/power-preview";
import type { PowerRankingEntry } from "@/lib/queries/records";
import type { PreseasonPowerEntry } from "@/lib/queries/preseason-power";
import type { PowerRankingsView } from "@/lib/queries/preseason-power";

function regularEntry(overrides: Partial<PowerRankingEntry>): PowerRankingEntry {
  return {
    rank: 1,
    id: "f1",
    slug: "f1",
    name: "Franchise 1",
    abbreviation: "F1",
    brandingColor: "#123456",
    avatarUrl: null,
    wins: 4,
    losses: 2,
    ties: 0,
    pointsScored: 500,
    pointsAgainst: 400,
    championships: 0,
    powerScore: 0.5,
    formDelta: 0,
    standingsRank: 1,
    windowGames: 4,
    injuryCount: 0,
    ...overrides,
  };
}

function preseasonEntry(
  overrides: Partial<PreseasonPowerEntry>
): PreseasonPowerEntry {
  return {
    rank: 1,
    id: "f1",
    slug: "f1",
    name: "Franchise 1",
    abbreviation: "F1",
    brandingColor: "#123456",
    avatarUrl: null,
    championships: 0,
    powerScore: 0.5,
    historyScore: 0.5,
    rosterScore: 0.5,
    rosterProjPoints: 1000,
    lastSeasonYear: 2025,
    lastSeasonWins: 8,
    lastSeasonLosses: 6,
    lastSeasonTies: 0,
    lastStandingsFinish: 3,
    lastPlayoffResult: "made_playoffs",
    ...overrides,
  };
}

function makeRegularEntries(n: number): PowerRankingEntry[] {
  return Array.from({ length: n }, (_, i) =>
    regularEntry({
      rank: i + 1,
      id: `f${i + 1}`,
      slug: `f${i + 1}`,
      name: `Franchise ${i + 1}`,
      standingsRank: i + 1,
      formDelta: 0,
    })
  );
}

describe("buildPowerPreview", () => {
  it("regular mode returns exactly topN rows in rank order with formatted records", () => {
    const entries = makeRegularEntries(8).map((e, i) =>
      i === 0 ? { ...e, wins: 6, losses: 2, ties: 0 } : e
    );
    const view: PowerRankingsView = { mode: "regular", entries };
    const preview = buildPowerPreview(view, 4);

    expect(preview).not.toBeNull();
    expect(preview!.top).toHaveLength(4);
    expect(preview!.top.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(preview!.top[0].record).toBe("6-2");
  });

  it("riser is the max positive formDelta and faller the max negative, correct franchises picked", () => {
    const entries = makeRegularEntries(6);
    entries[0].formDelta = 1; // f1
    entries[1].formDelta = 3; // f2, biggest riser
    entries[2].formDelta = -1; // f3
    entries[3].formDelta = -4; // f4, biggest faller
    entries[4].formDelta = 0;

    const view: PowerRankingsView = { mode: "regular", entries };
    const preview = buildPowerPreview(view, 4);

    expect(preview).not.toBeNull();
    expect(preview!.riser?.slug).toBe("f2");
    expect(preview!.riser?.delta).toBe(3);
    expect(preview!.faller?.slug).toBe("f4");
    expect(preview!.faller?.delta).toBe(4);
  });

  it("all formDelta === 0 leaves both movers null while top rows still return", () => {
    const entries = makeRegularEntries(5);
    const view: PowerRankingsView = { mode: "regular", entries };
    const preview = buildPowerPreview(view, 4);

    expect(preview).not.toBeNull();
    expect(preview!.riser).toBeNull();
    expect(preview!.faller).toBeNull();
    expect(preview!.top).toHaveLength(4);
  });

  it("ties on formDelta resolve to the better (lower) power rank", () => {
    const entries = makeRegularEntries(6);
    // f3 (rank 3) and f5 (rank 5) tie at +2; f3 should win as riser.
    entries[2].formDelta = 2;
    entries[4].formDelta = 2;
    // f4 (rank 4) and f6 (rank 6) tie at -2; f4 should win as faller.
    entries[3].formDelta = -2;
    entries[5].formDelta = -2;

    const view: PowerRankingsView = { mode: "regular", entries };
    const preview = buildPowerPreview(view, 4);

    expect(preview).not.toBeNull();
    expect(preview!.riser?.slug).toBe("f3");
    expect(preview!.faller?.slug).toBe("f4");
  });

  it("preseason mode populates powerIndex and nulls record/formDelta/movers", () => {
    const entries = [
      preseasonEntry({ rank: 1, id: "f1", slug: "f1", powerScore: 0.812 }),
      preseasonEntry({ rank: 2, id: "f2", slug: "f2", powerScore: 0.7 }),
      preseasonEntry({ rank: 3, id: "f3", slug: "f3", powerScore: 0.5 }),
    ];
    const view: PowerRankingsView = { mode: "preseason", entries };
    const preview = buildPowerPreview(view, 4);

    expect(preview).not.toBeNull();
    expect(preview!.mode).toBe("preseason");
    expect(preview!.top[0].powerIndex).toBe("81.2");
    expect(preview!.top[0].record).toBeNull();
    expect(preview!.top[0].formDelta).toBeNull();
    expect(preview!.riser).toBeNull();
    expect(preview!.faller).toBeNull();
  });

  it("returns null for two entries, and for all-zero windowGames in regular mode", () => {
    const twoEntries: PowerRankingsView = {
      mode: "regular",
      entries: makeRegularEntries(2),
    };
    expect(buildPowerPreview(twoEntries)).toBeNull();

    const allZeroWindow: PowerRankingsView = {
      mode: "regular",
      entries: makeRegularEntries(5).map((e) => ({ ...e, windowGames: 0 })),
    };
    expect(buildPowerPreview(allZeroWindow)).toBeNull();
  });
});
