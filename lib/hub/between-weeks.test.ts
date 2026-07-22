import { describe, it, expect } from "vitest";
import {
  selectGameOfTheWeek,
  betweenWeeksHeadline,
  formatH2HLine,
  formatSlateH2H,
  stakesClause,
  genericSlateAngle,
  type GotwCandidate,
  type GotwTeam,
} from "./between-weeks";

function team(
  wins: number,
  losses: number,
  pointsFor: number,
  division: number | null
): GotwTeam {
  return { wins, losses, ties: 0, pointsFor, division };
}

function candidate(
  matchupId: number,
  a: GotwTeam,
  b: GotwTeam
): GotwCandidate {
  return { matchupId, teamA: a, teamB: b };
}

describe("selectGameOfTheWeek", () => {
  it("returns null for an empty slate", () => {
    expect(selectGameOfTheWeek([])).toBeNull();
  });

  it("prefers a division game over a higher-record cross-division game", () => {
    const crossHighRecord = candidate(
      1,
      team(9, 0, 1200, 1),
      team(8, 1, 1150, 2) // different divisions
    );
    const divisionGame = candidate(
      2,
      team(6, 3, 1000, 3),
      team(5, 4, 980, 3) // same division
    );
    // The cross-division pairing has the better combined record, but a division
    // rematch is preferred.
    expect(selectGameOfTheWeek([crossHighRecord, divisionGame])).toBe(2);
  });

  it("among division games, picks the best combined record", () => {
    const weak = candidate(1, team(2, 7, 800, 1), team(3, 6, 850, 1));
    const strong = candidate(2, team(8, 1, 1100, 2), team(7, 2, 1080, 2));
    expect(selectGameOfTheWeek([weak, strong])).toBe(2);
  });

  it("breaks a combined-record tie by closeness, then points-for", () => {
    // Both candidates have combined record 12-6 (0.667), same total games.
    // A: teams 6-3 vs 6-3 (closeness 0). B: teams 9-0 vs 3-6 (closeness large).
    const even = candidate(1, team(6, 3, 900, 5), team(6, 3, 900, 5));
    const lopsided = candidate(2, team(9, 0, 1000, 5), team(3, 6, 1000, 5));
    expect(selectGameOfTheWeek([even, lopsided])).toBe(1);
  });

  it("falls back to the whole slate when no division game exists", () => {
    const a = candidate(1, team(3, 6, 800, 1), team(2, 7, 750, 2));
    const b = candidate(2, team(8, 1, 1100, 3), team(7, 2, 1090, 4));
    expect(selectGameOfTheWeek([a, b])).toBe(2);
  });

  it("is deterministic on a full tie via matchupId", () => {
    const t = () => team(5, 4, 900, 7);
    const first = candidate(3, t(), t());
    const second = candidate(1, t(), t());
    expect(selectGameOfTheWeek([first, second])).toBe(1);
  });
});

describe("betweenWeeksHeadline", () => {
  const now = new Date("2025-11-11T12:00:00Z"); // a Tuesday

  it("says two days when kickoff is ~2 days out", () => {
    const kickoff = new Date("2025-11-13T20:15:00Z");
    expect(betweenWeeksHeadline(kickoff, now)).toBe(
      "Two days until it matters again."
    );
  });

  it("uses the singular for one day", () => {
    const kickoff = new Date("2025-11-12T20:15:00Z");
    expect(betweenWeeksHeadline(kickoff, now)).toBe(
      "One day until it matters again."
    );
  });

  it("says kickoff is today when under a day out", () => {
    const kickoff = new Date("2025-11-11T20:15:00Z");
    expect(betweenWeeksHeadline(kickoff, now)).toBe("Kickoff is today.");
  });

  it("degrades to a static line when kickoff is unknown", () => {
    expect(betweenWeeksHeadline(null, now)).toBe("The slate is set.");
  });

  it("degrades to a static line when kickoff is already past", () => {
    const kickoff = new Date("2025-11-10T20:15:00Z");
    expect(betweenWeeksHeadline(kickoff, now)).toBe("The slate is set.");
  });
});

describe("formatH2HLine", () => {
  it("names the leader from team A's perspective", () => {
    expect(formatH2HLine({ wins: 14, losses: 9, ties: 0 }, "GW", "HS")).toBe(
      "All-time GW leads 14-9"
    );
  });

  it("names team B as leader when B is ahead", () => {
    expect(formatH2HLine({ wins: 9, losses: 14, ties: 0 }, "GW", "HS")).toBe(
      "All-time HS leads 14-9"
    );
  });

  it("reports an even series", () => {
    expect(formatH2HLine({ wins: 5, losses: 5, ties: 0 }, "GW", "HS")).toBe(
      "All-time series even 5-5"
    );
  });

  it("reports a first-ever meeting", () => {
    expect(formatH2HLine({ wins: 0, losses: 0, ties: 0 }, "GW", "HS")).toBe(
      "First-ever meeting"
    );
  });
});

describe("formatSlateH2H", () => {
  it("formats a plain W-L record", () => {
    expect(formatSlateH2H({ wins: 6, losses: 0, ties: 0 })).toBe("6-0");
  });

  it("appends ties only when present", () => {
    expect(formatSlateH2H({ wins: 4, losses: 4, ties: 2 })).toBe("4-4-2");
  });

  it("shows '1st mtg' when the two teams have never met", () => {
    expect(formatSlateH2H({ wins: 0, losses: 0, ties: 0 })).toBe("1st mtg");
  });
});

describe("stakesClause and genericSlateAngle", () => {
  it("promises first place when a team leads its division", () => {
    expect(stakesClause(true, false)).toBe("First place on the line");
    expect(stakesClause(false, false)).toBe("Bragging rights on the line");
  });

  it("builds a truthful records-based angle", () => {
    expect(genericSlateAngle("6-3", "5-4")).toBe(
      "6-3 against 5-4. Somebody's number moves Thursday."
    );
  });
});
