import { describe, it, expect } from "vitest";
import {
  BOOK_ERRORS,
  bookConsensusText,
  buildPickemsCell,
  groupPickersByDivision,
  UNDIVIDED_DIVISION_LABEL,
  bookCtaLabel,
  bookDogPayoutLine,
  bookLineText,
  copySegmentsText,
  futurePickRejectionReason,
  futurePicksForSeason,
  futuresLockNote,
  futuresRulesFor,
  picksForBoardWeek,
  pickRejectionReason,
  propPickRejectionReason,
  type HubFooterGame,
  type MemberBookPick,
  type MemberFuturePick,
  type PickerSeed,
  type PickGuardFacts,
  type PropPickGuardFacts,
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
      "A $10 friendly on WW +140 returns $24.00 total ($14.00 profit).",
    );
  });

  it("finds the dog regardless of which side it is stored on", () => {
    expect(bookDogPayoutLine(AWAY_FAVORED)).toBe(
      "A $10 friendly on GT +140 returns $24.00 total ($14.00 profit).",
    );
  });
});

const PROP_OPEN: PropPickGuardFacts = {
  weekMatchesBoard: true,
  propExists: true,
  weekLocked: false,
  existingPickLocked: false,
};

describe("propPickRejectionReason", () => {
  it("lets a normal prop pick through", () => {
    expect(propPickRejectionReason(PROP_OPEN)).toBeNull();
  });

  it("refuses a pick from a board that has moved on", () => {
    expect(
      propPickRejectionReason({ ...PROP_OPEN, weekMatchesBoard: false }),
    ).toBe(BOOK_ERRORS.locked);
  });

  it("refuses a prop that does not exist for this season/week", () => {
    expect(
      propPickRejectionReason({ ...PROP_OPEN, propExists: false }),
    ).toBe(BOOK_ERRORS.noProp);
  });

  it("refuses a pick once the week has locked (past first kickoff)", () => {
    expect(
      propPickRejectionReason({ ...PROP_OPEN, weekLocked: true }),
    ).toBe(BOOK_ERRORS.locked);
  });

  it("refuses a pick whose own row is already locked", () => {
    expect(
      propPickRejectionReason({ ...PROP_OPEN, existingPickLocked: true }),
    ).toBe(BOOK_ERRORS.locked);
  });

  it("checks the week and the prop's existence before lock state", () => {
    expect(
      propPickRejectionReason({
        weekMatchesBoard: false,
        propExists: false,
        weekLocked: true,
        existingPickLocked: true,
      }),
    ).toBe(BOOK_ERRORS.locked);
  });
});

// ---------------------------------------------------------------------------
// Futures
// ---------------------------------------------------------------------------

describe("futurePickRejectionReason", () => {
  it("lets a pick on an open market through", () => {
    expect(
      futurePickRejectionReason({ subjectExists: true, marketLocked: false }),
    ).toBeNull();
  });

  it("refuses a subject that is not priced on the board", () => {
    expect(
      futurePickRejectionReason({ subjectExists: false, marketLocked: false }),
    ).toBe(BOOK_ERRORS.noFuture);
  });

  it("refuses any pick once the market has locked", () => {
    expect(
      futurePickRejectionReason({ subjectExists: true, marketLocked: true }),
    ).toBe(BOOK_ERRORS.futureLocked);
  });

  it("checks the subject before the lock, so the message names the real problem", () => {
    expect(
      futurePickRejectionReason({ subjectExists: false, marketLocked: true }),
    ).toBe(BOOK_ERRORS.noFuture);
  });
});

describe("futurePicksForSeason", () => {
  const picks: MemberFuturePick[] = [
    { market: "champion", subjectId: "f1", oddsAtPick: 450 },
  ];

  it("returns the picks when the payload is for the season on the board", () => {
    expect(futurePicksForSeason({ picks, seasonId: 7 }, 7)).toEqual(picks);
  });

  it("discards picks from another season, which would look identical", () => {
    // Every season has a "champion" market, so a stale payload would line up
    // perfectly against this board. That is exactly what this guards.
    expect(futurePicksForSeason({ picks, seasonId: 6 }, 7)).toBeNull();
  });

  it("discards a payload that could not resolve a season at all", () => {
    expect(futurePicksForSeason({ picks, seasonId: null }, 7)).toBeNull();
  });

  it("returns null when the board itself has no season", () => {
    expect(futurePicksForSeason({ picks, seasonId: 7 }, null)).toBeNull();
  });

  it("handles a missing payload", () => {
    expect(futurePicksForSeason(null, 7)).toBeNull();
    expect(futurePicksForSeason(undefined, 7)).toBeNull();
  });
});

describe("futuresRulesFor", () => {
  it("prints the real MVP window rather than a hardcoded guess", () => {
    expect(copySegmentsText(futuresRulesFor("mvp", 13))).toContain("weeks 1 to 13");
    expect(copySegmentsText(futuresRulesFor("mvp", 15))).toContain("weeks 1 to 15");
  });

  it("hands every numeral over as a mono segment, never inside the prose", () => {
    const segments = futuresRulesFor("mvp", 14);
    const monoText = segments.filter((s) => s.mono).map((s) => s.text);
    expect(monoText).toEqual(["1", "14"]);
    // And no digit is smuggled into a prose run, which would render in Geist.
    for (const segment of segments.filter((s) => !s.mono)) {
      expect(segment.text).not.toMatch(/\d/);
    }
  });

  it("says the toilet bowl is won by losing", () => {
    expect(copySegmentsText(futuresRulesFor("toilet_bowl", 14))).toContain(
      "the loser wins",
    );
  });

  it("states a grading rule for every market", () => {
    for (const market of ["champion", "toilet_bowl", "mvp", "roty"] as const) {
      expect(copySegmentsText(futuresRulesFor(market, 14)).length).toBeGreaterThan(
        20,
      );
    }
  });
});

describe("futuresLockNote", () => {
  it("names the week the market actually locks, in mono", () => {
    expect(copySegmentsText(futuresLockNote(8))).toBe(
      "Locks at the week 8 kickoff.",
    );
    expect(futuresLockNote(8).filter((s) => s.mono).map((s) => s.text)).toEqual([
      "8",
    ]);
  });

  it("follows the board's own lock week, so a moved playoff start moves it", () => {
    expect(copySegmentsText(futuresLockNote(15))).toContain("week 15");
  });
});

// ---------------------------------------------------------------------------
// Pick'ems grid: division grouping and cell semantics
// ---------------------------------------------------------------------------

function seed(
  overrides: Partial<PickerSeed> & { memberId: number; franchiseName: string },
): PickerSeed {
  return {
    displayName: `member-${overrides.memberId}`,
    franchiseSlug: overrides.franchiseName.toLowerCase().replace(/\s+/g, "-"),
    abbreviation: overrides.franchiseName.slice(0, 3).toUpperCase(),
    color: null,
    record: "",
    divisionName: null,
    ...overrides,
  };
}

describe("groupPickersByDivision", () => {
  it("clusters columns under their division, alphabetically", () => {
    const grouped = groupPickersByDivision([
      seed({ memberId: 1, franchiseName: "Zebras", divisionName: "North" }),
      seed({ memberId: 2, franchiseName: "Apes", divisionName: "South" }),
      seed({ memberId: 3, franchiseName: "Bears", divisionName: "North" }),
    ]);

    expect(grouped.map((d) => d.name)).toEqual(["North", "South"]);
    expect(grouped[0].pickers.map((p) => p.franchiseName)).toEqual([
      "Bears",
      "Zebras",
    ]);
    expect(grouped[1].pickers.map((p) => p.franchiseName)).toEqual(["Apes"]);
  });

  it("buckets a franchise with no division into League, always last", () => {
    const grouped = groupPickersByDivision([
      seed({ memberId: 1, franchiseName: "Nomads" }),
      seed({ memberId: 2, franchiseName: "Aces", divisionName: "West" }),
    ]);

    expect(grouped.map((d) => d.name)).toEqual(["West", UNDIVIDED_DIVISION_LABEL]);
    expect(grouped[1].pickers[0].franchiseName).toBe("Nomads");
  });

  it("drops the divisionName from the column it ships to the client", () => {
    const [division] = groupPickersByDivision([
      seed({ memberId: 1, franchiseName: "Aces", divisionName: "West" }),
    ]);
    expect(division.pickers[0]).not.toHaveProperty("divisionName");
  });
});

describe("buildPickemsCell", () => {
  const abbreviations = { homeAbbreviation: "HOM", awayAbbreviation: "AWY" };
  const homePick = { side: "home" as const, spreadAtPick: -3 };

  it("reveals nothing at all before kickoff, even to a picker who picked", () => {
    expect(
      buildPickemsCell({
        status: "open",
        pick: homePick,
        ...abbreviations,
        homePoints: 0,
        awayPoints: 0,
      }),
    ).toEqual({ revealed: false, abbreviation: null, outcome: null });
  });

  it("reveals the side at kickoff but never grades a live game", () => {
    // Home is up 20 and would be covering -3; the cell still says nothing.
    expect(
      buildPickemsCell({
        status: "live",
        pick: homePick,
        ...abbreviations,
        homePoints: 100,
        awayPoints: 80,
      }),
    ).toEqual({ revealed: true, abbreviation: "HOM", outcome: null });
  });

  it("grades a final game against the pick's own snapshotted spread", () => {
    expect(
      buildPickemsCell({
        status: "final",
        pick: homePick,
        ...abbreviations,
        homePoints: 100,
        awayPoints: 90,
      }).outcome,
    ).toBe("win");

    expect(
      buildPickemsCell({
        status: "final",
        pick: homePick,
        ...abbreviations,
        homePoints: 100,
        awayPoints: 98,
      }).outcome,
    ).toBe("loss");

    expect(
      buildPickemsCell({
        status: "final",
        pick: homePick,
        ...abbreviations,
        homePoints: 100,
        awayPoints: 97,
      }).outcome,
    ).toBe("push");
  });

  it("shows the away abbreviation for an away pick", () => {
    expect(
      buildPickemsCell({
        status: "final",
        pick: { side: "away", spreadAtPick: -3 },
        ...abbreviations,
        homePoints: 100,
        awayPoints: 98,
      }),
    ).toEqual({ revealed: true, abbreviation: "AWY", outcome: "win" });
  });

  it("marks a revealed no-pick as revealed-but-empty, not hidden", () => {
    expect(
      buildPickemsCell({
        status: "final",
        pick: null,
        ...abbreviations,
        homePoints: 100,
        awayPoints: 98,
      }),
    ).toEqual({ revealed: true, abbreviation: null, outcome: null });
  });
});
