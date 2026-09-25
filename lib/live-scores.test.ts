import { describe, it, expect } from "vitest";
import {
  pickCurrentWeek,
  deriveLiveStatus,
  hasLiveScoreChanges,
  decideLiveRevalidation,
} from "./live-scores";

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

describe("decideLiveRevalidation", () => {
  const MIN = 120_000;

  it("does nothing with no change and nothing pending", () => {
    expect(
      decideLiveRevalidation({ changed: false, pending: false, now: 500_000, lastRevalidateAt: 0, minIntervalMs: MIN })
    ).toEqual({ revalidate: false, pending: false });
  });

  it("fires a change once the window has elapsed", () => {
    expect(
      decideLiveRevalidation({ changed: true, pending: false, now: 200_000, lastRevalidateAt: 0, minIntervalMs: MIN })
    ).toEqual({ revalidate: true, pending: false });
  });

  it("holds a change inside the window as pending instead of dropping it", () => {
    expect(
      decideLiveRevalidation({ changed: true, pending: false, now: 60_000, lastRevalidateAt: 0, minIntervalMs: MIN })
    ).toEqual({ revalidate: false, pending: true });
  });

  it("fires the trailing change on a later no-change poll past the window", () => {
    // Monday night: final points land 60s after the last revalidation...
    const first = decideLiveRevalidation({
      changed: true, pending: false, now: 60_000, lastRevalidateAt: 0, minIntervalMs: MIN,
    });
    expect(first.revalidate).toBe(false);
    // ...the next polls see no change (DB already updated), but still inside the window...
    const second = decideLiveRevalidation({
      changed: false, pending: first.pending, now: 90_000, lastRevalidateAt: 0, minIntervalMs: MIN,
    });
    expect(second).toEqual({ revalidate: false, pending: true });
    // ...and the first poll past the window fires it.
    const third = decideLiveRevalidation({
      changed: false, pending: second.pending, now: 125_000, lastRevalidateAt: 0, minIntervalMs: MIN,
    });
    expect(third).toEqual({ revalidate: true, pending: false });
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
