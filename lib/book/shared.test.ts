import { describe, it, expect } from "vitest";
import {
  BOOK_ERRORS,
  bookConsensusText,
  bookCtaLabel,
  bookDogPayoutLine,
  bookLineText,
  picksForBoardWeek,
  pickRejectionReason,
  type HubFooterGame,
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

// ---------------------------------------------------------------------------
// Hub line footer
// ---------------------------------------------------------------------------

const HOME_FAVORED: HubFooterGame = {
  spread: -3.5,
  status: "open",
  home: { abbreviation: "CT", name: "Coaching Tree", moneyline: -165 },
  away: { abbreviation: "WW", name: "Wild West", moneyline: 140 },
  homePicks: 5,
  awayPicks: 2,
};

const AWAY_FAVORED: HubFooterGame = {
  ...HOME_FAVORED,
  spread: 3.5,
  home: { abbreviation: "GT", name: "Gorilla Trap", moneyline: 140 },
  away: { abbreviation: "MA", name: "Mahomes Alone", moneyline: -165 },
};

describe("bookLineText", () => {
  it("leads with the favorite when home is favored", () => {
    expect(bookLineText(HOME_FAVORED)).toBe("CT -3.5 · ML -165/+140");
  });

  it("leads with the favorite when away is favored", () => {
    expect(bookLineText(AWAY_FAVORED)).toBe("MA -3.5 · ML +140/-165");
  });
});

describe("bookConsensusText", () => {
  it("suppresses consensus under the minimum pick threshold", () => {
    expect(bookConsensusText({ ...HOME_FAVORED, homePicks: 1, awayPicks: 1 })).toBeNull();
  });

  it("reports the leading side's share once enough picks exist", () => {
    // 5 of 7 on home = 71%.
    expect(bookConsensusText(HOME_FAVORED)).toBe("71% on CT");
  });

  it("reports the away side when it leads", () => {
    expect(
      bookConsensusText({ ...HOME_FAVORED, homePicks: 2, awayPicks: 5 }),
    ).toBe("71% on WW");
  });
});

describe("bookCtaLabel", () => {
  it("invites a pick while the game is open", () => {
    expect(bookCtaLabel("open")).toBe("Pick →");
  });

  it("points to The Book once a game has kicked off", () => {
    expect(bookCtaLabel("live")).toBe("The Book →");
    expect(bookCtaLabel("final")).toBe("The Book →");
  });
});

describe("bookDogPayoutLine", () => {
  it("prices a $10 friendly on the underdog", () => {
    expect(bookDogPayoutLine(HOME_FAVORED)).toBe(
      "A $10 friendly on WW +140 pays $14.00 if it lands.",
    );
  });

  it("finds the dog regardless of which side it is stored on", () => {
    expect(bookDogPayoutLine(AWAY_FAVORED)).toBe(
      "A $10 friendly on GT +140 pays $14.00 if it lands.",
    );
  });
});
