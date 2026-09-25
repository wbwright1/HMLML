import { describe, it, expect } from "vitest";
import { pickCurrentWeek, deriveLiveStatus, hasLiveScoreChanges } from "./live-scores";

describe("pickCurrentWeek", () => {
  it("uses the NFL week over the highest synced week when the seasons match (#312)", () => {
    expect(
      pickCurrentWeek({ nflState: { season: "2026", week: 3 }, seasonYear: 2026, maxSyncedWeek: 14 })
    ).toBe(3);
  });

  it("falls back to the highest synced week when NFL state is unavailable", () => {
    expect(pickCurrentWeek({ nflState: null, seasonYear: 2026, maxSyncedWeek: 14 })).toBe(14);
  });

  it("falls back to the highest synced week when NFL state is for another season", () => {
    expect(
      pickCurrentWeek({ nflState: { season: "2027", week: 1 }, seasonYear: 2026, maxSyncedWeek: 17 })
    ).toBe(17);
  });

  it("falls back to week 1 when nothing is synced", () => {
    expect(pickCurrentWeek({ nflState: null, seasonYear: 2026, maxSyncedWeek: null })).toBe(1);
  });
});

describe("deriveLiveStatus", () => {
  it("is in_progress once points land, scheduled at zero", () => {
    expect(deriveLiveStatus(19.48)).toBe("in_progress");
    expect(deriveLiveStatus(0)).toBe("scheduled");
  });
});

describe("hasLiveScoreChanges", () => {
  const base = [
    { rosterId: "1", points: 0, status: "scheduled" },
    { rosterId: "8", points: 19.48, status: "in_progress" },
  ];

  it("is false when nothing moved", () => {
    expect(hasLiveScoreChanges(base, base.map((r) => ({ ...r })))).toBe(false);
  });

  it("is true on a points delta", () => {
    expect(
      hasLiveScoreChanges(base, [base[0], { rosterId: "8", points: 21.1, status: "in_progress" }])
    ).toBe(true);
  });

  it("is true on a status delta", () => {
    expect(
      hasLiveScoreChanges(base, [{ rosterId: "1", points: 0, status: "in_progress" }, base[1]])
    ).toBe(true);
  });

  it("is true for a roster with no stored row", () => {
    expect(hasLiveScoreChanges(base, [{ rosterId: "5", points: 0, status: "scheduled" }])).toBe(true);
  });

  it("ignores rows already complete, since the upsert never touches them", () => {
    const done = [{ rosterId: "8", points: 120, status: "complete" }];
    expect(hasLiveScoreChanges(done, [{ rosterId: "8", points: 0, status: "scheduled" }])).toBe(false);
  });
});
