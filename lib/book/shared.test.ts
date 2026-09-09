import { describe, it, expect } from "vitest";
import { deriveAbbreviation } from "@/lib/franchise-abbreviations";
import {
  BOOK_ERRORS,
  bookConsensusText,
  atsWinPct,
  bucketRailPickers,
  buildDivisionRace,
  buildPickemsCell,
  gradeGamePick,
  orderAtsLeaderboard,
  divisionNumber,
  divisionRailLabel,
  divisionTagLabel,
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
  unlockRejectionReason,
  type HubFooterGame,
  type MemberBookPick,
  type MemberFuturePick,
  type AtsLeaderboardRow,
  type PickemsCell,
  type PickemsDivisionGroup,
  type PickemsRow,
  type PickOutcome,
  type PickerSeed,
  type PickGuardFacts,
  type PropPickGuardFacts,
} from "./shared";

const OPEN: PickGuardFacts = {
  weekMatchesBoard: true,
  lineExists: true,
  gameStarted: false,
  slipHasStandingLock: false,
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
        slipHasStandingLock: true,
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
        slipHasStandingLock: true,
        existingPickLocked: true,
      }),
    ).toBe(BOOK_ERRORS.locked);
  });

  it("lets a pick through once every locked game has kicked off", () => {
    // The lock was a commitment over games that had not happened yet. With all
    // of those underway it holds nothing shut, so a game the sync priced
    // afterwards is pickable rather than collateral damage.
    expect(
      pickRejectionReason({ ...OPEN, slipHasStandingLock: false }),
    ).toBeNull();
  });
});

describe("unlockRejectionReason", () => {
  it("lets an unlock through while a locked game is still to kick off", () => {
    expect(
      unlockRejectionReason({ weekMatchesBoard: true, hasStandingLock: true }),
    ).toBeNull();
  });

  it("refuses an unlock from a board that has moved on", () => {
    expect(
      unlockRejectionReason({ weekMatchesBoard: false, hasStandingLock: true }),
    ).toBe(BOOK_ERRORS.locked);
  });

  it("refuses an unlock with nothing left in the future to give back", () => {
    expect(
      unlockRejectionReason({ weekMatchesBoard: true, hasStandingLock: false }),
    ).toBe(BOOK_ERRORS.nothingToUnlock);
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
    // The real seeds come from lib/franchise-abbreviations.ts's ladder, so the
    // fixture uses it too rather than baking in a naive truncation the app
    // never produces.
    abbreviation: deriveAbbreviation(overrides.franchiseName),
    color: null,
    avatarUrl: null,
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

  it("carries avatarUrl through to the column, null included", () => {
    const [division] = groupPickersByDivision([
      seed({
        memberId: 1,
        franchiseName: "Aces",
        divisionName: "West",
        avatarUrl: "https://sleepercdn.com/avatars/aces",
      }),
      seed({ memberId: 2, franchiseName: "Bandits", divisionName: "West" }),
    ]);
    // The picker header draws its crest from this field; dropping it here
    // would silently send every column back to the monogram fallback.
    expect(division.pickers.map((p) => p.avatarUrl)).toEqual([
      "https://sleepercdn.com/avatars/aces",
      null,
    ]);
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
    ).toEqual({
      revealed: false,
      side: null,
      abbreviation: null,
      hasPicked: true,
      outcome: null,
    });
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
    ).toEqual({
      revealed: true,
      side: "home",
      abbreviation: "HOM",
      hasPicked: true,
      outcome: null,
    });
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
    ).toEqual({
      revealed: true,
      side: "away",
      abbreviation: "AWY",
      hasPicked: true,
      outcome: "win",
    });
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
    ).toEqual({
      revealed: true,
      side: null,
      abbreviation: null,
      hasPicked: false,
      outcome: null,
    });
  });

  it("reports that an open pick EXISTS without reporting which side it took", () => {
    const cell = buildPickemsCell({
      status: "open",
      pick: { side: "away", spreadAtPick: -3 },
      ...abbreviations,
      homePoints: 0,
      awayPoints: 0,
    });

    // The whole anti-tailing rule in three assertions: a count is shippable,
    // a side is not.
    expect(cell.hasPicked).toBe(true);
    expect(cell.side).toBeNull();
    expect(cell.abbreviation).toBeNull();
  });

  it("says a member with no pick has not picked, on every status", () => {
    for (const status of ["open", "live", "final"] as const) {
      expect(
        buildPickemsCell({
          status,
          pick: null,
          ...abbreviations,
          homePoints: 100,
          awayPoints: 98,
        }).hasPicked,
      ).toBe(false);
    }
  });

  it("carries the side the rail buckets on even when both codes collide", () => {
    // Two franchises resolving to the same three-letter code (#243) is exactly
    // the case that makes `abbreviation` useless for bucketing.
    const cell = buildPickemsCell({
      status: "live",
      pick: { side: "away", spreadAtPick: 3 },
      homeAbbreviation: "BGS",
      awayAbbreviation: "BGS",
      homePoints: 0,
      awayPoints: 0,
    });

    expect(cell.side).toBe("away");
    expect(cell.abbreviation).toBe("BGS");
  });
});

describe("division labels", () => {
  it("pulls the number out of a numbered division", () => {
    expect(divisionNumber("Division 2")).toBe(2);
    expect(divisionRailLabel("Division 2")).toBe("Div 2");
    expect(divisionTagLabel("Division 2")).toBe("D2");
  });

  it("leaves a named division alone rather than inventing an abbreviation", () => {
    expect(divisionNumber("League")).toBeNull();
    expect(divisionRailLabel("League")).toBe("League");
    expect(divisionTagLabel("The Meat Grinder")).toBe("The Meat Grinder");
  });
});

describe("buildDivisionRace", () => {
  const group: PickemsDivisionGroup = {
    name: "Division 1",
    pickers: [
      seed({ memberId: 1, franchiseName: "Aces" }),
      seed({ memberId: 2, franchiseName: "Bears" }),
      seed({ memberId: 3, franchiseName: "Cubs" }),
    ],
  };
  const wins: PickOutcome[] = ["win", "win"];
  const losses: PickOutcome[] = ["loss"];

  it("combines only ranked members and states its own denominator", () => {
    const race = buildDivisionRace(group, {
      outcomesByMember: new Map([
        [1, wins],
        [2, losses],
      ]),
      // Member 3 has nothing graded, so the leaderboard gave them no rank.
      rankByMemberId: new Map([
        [1, 4],
        [2, 2],
      ]),
    });

    expect(race.record).toBe("2-1");
    expect(race.rankedCount).toBe(2);
    expect(race.memberCount).toBe(3);
    // The leader is the best RANK, not the most wins in the bucket.
    expect(race.leader?.memberId).toBe(2);
    expect(race.units).toBeCloseTo(2 * 9.09 - 10, 2);
  });

  it("computes the single undivided League bucket like any other division", () => {
    // A legacy season carries no divisions at all, so every member lands in
    // one "League" bucket. The strip is hidden at that point, but the figures
    // must still be real rather than a special case that returns nulls.
    const league: PickemsDivisionGroup = {
      name: UNDIVIDED_DIVISION_LABEL,
      pickers: group.pickers,
    };
    const race = buildDivisionRace(league, {
      outcomesByMember: new Map([
        [1, wins],
        [2, losses],
        [3, ["push"]],
      ]),
      rankByMemberId: new Map([
        [1, 1],
        [2, 2],
        [3, 3],
      ]),
    });

    expect(race.name).toBe("League");
    expect(race.record).toBe("2-1-1");
    expect(race.rankedCount).toBe(3);
    expect(race.memberCount).toBe(3);
    expect(race.leader?.memberId).toBe(1);
  });

  it("keeps three divisions' figures independent of each other", () => {
    // This league runs three divisions of four, not two of six.
    const outcomesByMember = new Map<number, PickOutcome[]>([
      [1, wins],
      [2, losses],
      [3, wins],
    ]);
    const rankByMemberId = new Map([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
    const races = [
      { name: "Division 1", pickers: [group.pickers[0]] },
      { name: "Division 2", pickers: [group.pickers[1]] },
      { name: "Division 3", pickers: [group.pickers[2]] },
    ].map((g) => buildDivisionRace(g, { outcomesByMember, rankByMemberId }));

    expect(races.map((r) => r.record)).toEqual(["2-0", "0-1", "2-0"]);
    expect(races.map((r) => r.leader?.memberId)).toEqual([1, 2, 3]);
    expect(races.map((r) => r.memberCount)).toEqual([1, 1, 1]);
    expect(races[1].units!).toBeLessThan(0);
  });

  it("refuses to fabricate a figure for a division nobody has graded in", () => {
    const race = buildDivisionRace(group, {
      outcomesByMember: new Map(),
      rankByMemberId: new Map(),
    });

    expect(race.record).toBeNull();
    expect(race.units).toBeNull();
    expect(race.leader).toBeNull();
    expect(race.rankedCount).toBe(0);
    expect(race.memberCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// The picker rail
// ---------------------------------------------------------------------------

function railRow(
  cells: Record<string, Partial<PickemsCell>>,
  overrides: Partial<PickemsRow> = {},
): PickemsRow {
  const filled: Record<string, PickemsCell> = {};
  for (const [memberId, cell] of Object.entries(cells)) {
    filled[memberId] = {
      revealed: true,
      side: null,
      abbreviation: null,
      hasPicked: false,
      outcome: null,
      ...cell,
    };
  }
  return {
    matchupId: 1,
    label: "BGS/BGS",
    homeAbbreviation: "BGS",
    awayAbbreviation: "BGS",
    spreadLabel: "-3.5",
    status: "final",
    cells: filled,
    ...overrides,
  };
}

describe("bucketRailPickers", () => {
  const divisions: PickemsDivisionGroup[] = [
    {
      name: "Division 1",
      pickers: [
        seed({ memberId: 1, franchiseName: "Aces" }),
        seed({ memberId: 2, franchiseName: "Bears" }),
      ],
    },
    {
      name: "Division 2",
      pickers: [seed({ memberId: 3, franchiseName: "Cubs" })],
    },
  ];

  it("buckets on the side, not on the code, when both teams share one code", () => {
    // The whole reason `side` exists: two franchises resolving to the same
    // three-letter code (#243). Bucketing on `abbreviation` would put all
    // three of these on the same rail, or on both.
    const buckets = bucketRailPickers(
      railRow({
        1: { side: "home", abbreviation: "BGS", hasPicked: true },
        2: { side: "away", abbreviation: "BGS", hasPicked: true },
        3: { side: "home", abbreviation: "BGS", hasPicked: true },
      }),
      divisions,
    );

    expect(buckets.homeCount).toBe(2);
    expect(buckets.awayCount).toBe(1);
    expect(buckets.home.map((b) => b.takers.map((p) => p.memberId))).toEqual([
      [1],
      [3],
    ]);
    expect(buckets.away.map((b) => b.takers.map((p) => p.memberId))).toEqual([
      [2],
      [],
    ]);
  });

  it("puts a member with an unrevealed pick in neither bucket", () => {
    // An open row ships hasPicked: true with side: null for everybody who
    // picked. That boolean is a count and never a side, and this is the
    // assertion that stops the rail from ever treating it as one.
    const buckets = bucketRailPickers(
      railRow(
        {
          1: { revealed: false, hasPicked: true },
          2: { revealed: false, hasPicked: true },
          3: { revealed: false, hasPicked: false },
        },
        { status: "open" },
      ),
      divisions,
    );

    expect(buckets.homeCount).toBe(0);
    expect(buckets.awayCount).toBe(0);
    expect(buckets.home.every((b) => b.takers.length === 0)).toBe(true);
    expect(buckets.away.every((b) => b.takers.length === 0)).toBe(true);
  });

  it("keeps a division with nobody on this side, so the rail can say nobody", () => {
    const buckets = bucketRailPickers(
      railRow({ 1: { side: "home", hasPicked: true } }),
      divisions,
    );

    expect(buckets.away.map((b) => b.name)).toEqual(["Division 1", "Division 2"]);
    expect(buckets.away.map((b) => b.takers.length)).toEqual([0, 0]);
  });

  it("treats a member with no cell at all as having taken no side", () => {
    const buckets = bucketRailPickers(railRow({}), divisions);
    expect(buckets.homeCount + buckets.awayCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Grading a member's own pick
// ---------------------------------------------------------------------------

describe("gradeGamePick", () => {
  const game = { home: { points: 100 }, away: { points: 90 } };

  it("grades a cover, a miss and a push against the pick's own spread", () => {
    expect(gradeGamePick(game, { side: "home", spreadAtPick: -3 })).toBe("home");
    expect(gradeGamePick(game, { side: "home", spreadAtPick: -14 })).toBe("away");
    expect(gradeGamePick(game, { side: "away", spreadAtPick: -10 })).toBe("push");
  });

  it("can disagree with the game's current line, which is the point", () => {
    // Home won by 10. A member who took home at -3 covered; the line has since
    // moved to -14, so BookGame.coveringSide says away. Both are correct: the
    // chip grades the pick, the row tag grades the game, and nothing here
    // reconciles them.
    const currentLineSaysAway = gradeGamePick(game, {
      side: "home",
      spreadAtPick: -14,
    });
    const pickSaysHome = gradeGamePick(game, {
      side: "home",
      spreadAtPick: -3,
    });

    expect(currentLineSaysAway).toBe("away");
    expect(pickSaysHome).toBe("home");
  });
});

// ---------------------------------------------------------------------------
// Ledger ordering
// ---------------------------------------------------------------------------

type LedgerSeed = Omit<AtsLeaderboardRow, "rank" | "isLeader" | "isLast">;

function ledgerSeed(
  memberId: number,
  franchiseName: string,
  record: string | null,
  units: number | null,
): LedgerSeed {
  return {
    memberId,
    displayName: franchiseName,
    franchiseSlug: franchiseName.toLowerCase(),
    franchiseName,
    franchiseAbbreviation: null,
    franchiseColor: null,
    franchiseAvatarUrl: null,
    divisionTag: null,
    record,
    streakLabel: null,
    streakType: null,
    units,
  };
}

describe("orderAtsLeaderboard", () => {
  it("ranks by win pct, breaks ties on units, and numbers 1..N straight", () => {
    const ordered = orderAtsLeaderboard([
      ledgerSeed(1, "Middle", "10-10-0", 4),
      ledgerSeed(2, "Best", "15-5-0", -99),
      ledgerSeed(3, "Tied", "10-10-0", 9),
    ]);

    expect(ordered.map((r) => [r.franchiseName, r.rank])).toEqual([
      ["Best", 1],
      ["Tied", 2],
      ["Middle", 3],
    ]);
    expect(ordered[0].isLeader).toBe(true);
    expect(ordered[2].isLast).toBe(true);
    expect(ordered[1].isLast).toBe(false);
  });

  it("puts every member with nothing graded last, alphabetically, unranked", () => {
    const ordered = orderAtsLeaderboard([
      ledgerSeed(1, "Zebras", null, null),
      ledgerSeed(2, "Ranked", "1-0-0", 0.91),
      ledgerSeed(3, "Aces", null, null),
    ]);

    expect(ordered.map((r) => r.franchiseName)).toEqual([
      "Ranked",
      "Aces",
      "Zebras",
    ]);
    expect(ordered.slice(1).map((r) => r.rank)).toEqual([null, null]);
    // isLast marks the last RANKED member, never somebody with no record.
    expect(ordered[0].isLast).toBe(false);
    expect(ordered.at(-1)!.isLast).toBe(false);
    // Nothing is invented for them on the way through.
    expect(ordered[1].record).toBeNull();
    expect(ordered[1].units).toBeNull();
  });

  it("does not mark a lone ranked member as both first and last", () => {
    const ordered = orderAtsLeaderboard([
      ledgerSeed(1, "Only", "1-0-0", 0.91),
      ledgerSeed(2, "Nobody", null, null),
    ]);

    expect(ordered[0].isLeader).toBe(true);
    expect(ordered[0].isLast).toBe(false);
  });

  it("reads a win pct off a formatted record, pushes excluded", () => {
    expect(atsWinPct("3-1-0")).toBeCloseTo(0.75, 5);
    expect(atsWinPct("3-1-4")).toBeCloseTo(0.75, 5);
    expect(atsWinPct("0-0-2")).toBe(0);
  });
});
