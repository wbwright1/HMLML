import { describe, it, expect } from "vitest";
import {
  BOOK_ERRORS,
  picksForBoardWeek,
  pickRejectionReason,
  type MemberBookPick,
  type PickGuardFacts,
} from "./shared";

const OPEN: PickGuardFacts = {
  weekMatchesBoard: true,
  lineExists: true,
  gameStarted: false,
  slipHasLockedPick: false,
  existingPickLocked: false,
};

describe("pickRejectionReason", () => {
  it("lets a normal pick through", () => {
    expect(pickRejectionReason(OPEN)).toBeNull();
  });

  it("refuses a pick from a board that has moved on", () => {
    expect(
      pickRejectionReason({ ...OPEN, weekMatchesBoard: false }),
    ).toBe(BOOK_ERRORS.locked);
  });

  it("refuses a game with no priced line", () => {
    expect(pickRejectionReason({ ...OPEN, lineExists: false })).toBe(
      BOOK_ERRORS.noLine,
    );
  });

  it("refuses a game that has already kicked off", () => {
    expect(pickRejectionReason({ ...OPEN, gameStarted: true })).toBe(
      BOOK_ERRORS.locked,
    );
  });

  it("refuses a pick on a game whose own row is locked", () => {
    expect(pickRejectionReason({ ...OPEN, existingPickLocked: true })).toBe(
      BOOK_ERRORS.slipLocked,
    );
  });

  it("refuses a NEW pick once any pick in the week is locked", () => {
    // The bug: lock used to be checked per row, so a game the sync priced
    // after the member locked their slip had no row, therefore no lockedAt,
    // therefore no lock. Locking is a slip-level commitment.
    expect(
      pickRejectionReason({
        ...OPEN,
        slipHasLockedPick: true,
        existingPickLocked: false,
      }),
    ).toBe(BOOK_ERRORS.slipLocked);
  });

  it("checks the week and the line before anything about locks", () => {
    // Order matters for the message the member sees: a stale board should not
    // be reported as a locked slip.
    expect(
      pickRejectionReason({
        weekMatchesBoard: false,
        lineExists: false,
        gameStarted: true,
        slipHasLockedPick: true,
        existingPickLocked: true,
      }),
    ).toBe(BOOK_ERRORS.locked);
  });
});

describe("picksForBoardWeek", () => {
  const picks: MemberBookPick[] = [
    {
      matchupId: 1,
      side: "home",
      spreadAtPick: -3.5,
      mlAtPick: -165,
      lockedAt: null,
    },
  ];

  it("returns the picks when the payload is for the board's week", () => {
    expect(picksForBoardWeek({ picks, week: 4 }, 4)).toEqual(picks);
  });

  it("discards picks from another week", () => {
    // Matchup ids repeat every week, so a week-5 payload would line up against
    // a cached week-4 board and paint the wrong picks onto it.
    expect(picksForBoardWeek({ picks, week: 5 }, 4)).toBeNull();
  });

  it("discards a payload that could not resolve a week at all", () => {
    expect(picksForBoardWeek({ picks, week: null }, 4)).toBeNull();
  });

  it("handles a missing payload", () => {
    expect(picksForBoardWeek(null, 4)).toBeNull();
    expect(picksForBoardWeek(undefined, 4)).toBeNull();
  });
});
