import { describe, it, expect } from "vitest";
import {
  shouldGenerateOffseason,
  selectLastOffseasonGenerationAt,
  DEFAULT_ACTIVITY_THRESHOLD,
  type GenerationLogRow,
} from "./activity-gate";

describe("shouldGenerateOffseason", () => {
  it("always generates on the first run (no existing content), even with zero activity", () => {
    const result = shouldGenerateOffseason({
      newTransactionCount: 0,
      hasExistingContent: false,
    });
    expect(result).toEqual({ generate: true, reason: "no-existing-content" });
  });

  it("generates when new activity meets the default threshold", () => {
    const result = shouldGenerateOffseason({
      newTransactionCount: DEFAULT_ACTIVITY_THRESHOLD,
      hasExistingContent: true,
    });
    expect(result).toEqual({ generate: true, reason: "activity" });
  });

  it("generates when new activity exceeds the default threshold", () => {
    const result = shouldGenerateOffseason({
      newTransactionCount: DEFAULT_ACTIVITY_THRESHOLD + 5,
      hasExistingContent: true,
    });
    expect(result.generate).toBe(true);
    expect(result.reason).toBe("activity");
  });

  it("skips a quiet week: existing content and too few new transactions", () => {
    const result = shouldGenerateOffseason({
      newTransactionCount: DEFAULT_ACTIVITY_THRESHOLD - 1,
      hasExistingContent: true,
    });
    expect(result).toEqual({ generate: false, reason: "quiet" });
  });

  it("skips when there is existing content and zero new transactions", () => {
    const result = shouldGenerateOffseason({
      newTransactionCount: 0,
      hasExistingContent: true,
    });
    expect(result).toEqual({ generate: false, reason: "quiet" });
  });

  it("honors a custom threshold", () => {
    // With threshold 5, four new transactions is still quiet.
    expect(
      shouldGenerateOffseason({
        newTransactionCount: 4,
        hasExistingContent: true,
        threshold: 5,
      }),
    ).toEqual({ generate: false, reason: "quiet" });
    // Five clears it.
    expect(
      shouldGenerateOffseason({
        newTransactionCount: 5,
        hasExistingContent: true,
        threshold: 5,
      }).generate,
    ).toBe(true);
  });
});

describe("selectLastOffseasonGenerationAt", () => {
  const D = (iso: string) => new Date(iso);

  it("returns null when the season has never had an offseason generation", () => {
    const rows: GenerationLogRow[] = [
      { seasonType: "pre", seasonId: 1, at: D("2026-08-01T00:00:00Z") },
      { seasonType: "regular", seasonId: 1, at: D("2026-10-01T00:00:00Z") },
    ];
    expect(selectLastOffseasonGenerationAt(rows, 1)).toBeNull();
  });

  it("ignores preseason season-scoped runs even though they share content kinds", () => {
    // The bug this fixes: a preseason generation (also week-null, also writes
    // hero_dek/smack_post/offseason_receipt) must NOT count as the offseason
    // watermark. Here the preseason run is newer than the offseason one, and
    // the offseason timestamp must still win.
    const offAt = D("2026-06-15T12:00:00Z");
    const rows: GenerationLogRow[] = [
      { seasonType: "pre", seasonId: 1, at: D("2026-08-20T12:00:00Z") },
      { seasonType: "off", seasonId: 1, at: offAt },
      { seasonType: "regular", seasonId: 1, at: D("2026-11-01T12:00:00Z") },
    ];
    expect(selectLastOffseasonGenerationAt(rows, 1)).toEqual(offAt);
  });

  it("picks the most recent offseason generation regardless of input order", () => {
    const rows: GenerationLogRow[] = [
      { seasonType: "off", seasonId: 1, at: D("2026-06-01T00:00:00Z") },
      { seasonType: "off", seasonId: 1, at: D("2026-07-01T00:00:00Z") },
      { seasonType: "off", seasonId: 1, at: D("2026-06-20T00:00:00Z") },
    ];
    expect(selectLastOffseasonGenerationAt(rows, 1)).toEqual(D("2026-07-01T00:00:00Z"));
  });

  it("excludes quiet-skip runs (skipped set) so they never advance the watermark", () => {
    const realAt = D("2026-06-01T00:00:00Z");
    const rows: GenerationLogRow[] = [
      { seasonType: "off", seasonId: 1, at: realAt },
      {
        seasonType: "off",
        seasonId: 1,
        skipped: "quiet-offseason-kept-previous",
        at: D("2026-07-01T00:00:00Z"),
      },
    ];
    expect(selectLastOffseasonGenerationAt(rows, 1)).toEqual(realAt);
  });

  it("scopes to the requested season", () => {
    const rows: GenerationLogRow[] = [
      { seasonType: "off", seasonId: 2, at: D("2026-07-01T00:00:00Z") },
      { seasonType: "off", seasonId: 1, at: D("2026-06-01T00:00:00Z") },
    ];
    expect(selectLastOffseasonGenerationAt(rows, 1)).toEqual(D("2026-06-01T00:00:00Z"));
  });

  it("matches seasonId even when logged as a JSON string", () => {
    // jsonb ->> yields text; the DB mapper may hand us a string seasonId.
    const rows: GenerationLogRow[] = [
      { seasonType: "off", seasonId: "1", at: D("2026-06-01T00:00:00Z") },
    ];
    expect(selectLastOffseasonGenerationAt(rows, 1)).toEqual(D("2026-06-01T00:00:00Z"));
  });
});
