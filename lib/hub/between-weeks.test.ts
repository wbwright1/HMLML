import { describe, it, expect } from "vitest";
import {
  selectGameOfTheWeek,
  markTitleRematch,
  betweenWeeksHeadline,
  formatH2HLine,
  formatSlateH2H,
  stakesFromReasons,
  namedRivalryKicker,
  gotwReasons,
  gotwKickerLead,
  isRecentRematch,
  canFlipDivisionLead,
  gameOfWeekBlurb,
  genericSlateAngle,
  kickoffWeekdayName,
  GOTW_REASON_WEIGHTS,
  type GotwCandidate,
  type GotwTeam,
  type GotwReason,
  type DivisionRaceTeam,
} from "./between-weeks";
import { SIGNATURE_PHRASES, normalize } from "@/lib/content-gen/phrases";

function team(
  wins: number,
  losses: number,
  pointsFor: number,
  division: number | null,
  franchiseId?: string
): GotwTeam {
  return { wins, losses, ties: 0, pointsFor, division, franchiseId };
}

function candidate(
  matchupId: number,
  a: GotwTeam,
  b: GotwTeam,
  extra: Partial<GotwCandidate> = {}
): GotwCandidate {
  return { matchupId, teamA: a, teamB: b, ...extra };
}

const pickId = (cs: GotwCandidate[], week = 5, anyGamesPlayed?: boolean) =>
  selectGameOfTheWeek(cs, { week, anyGamesPlayed })?.matchupId ?? null;

describe("selectGameOfTheWeek", () => {
  it("returns null for an empty slate", () => {
    expect(selectGameOfTheWeek([], { week: 3 })).toBeNull();
  });

  it("no longer hard-filters to division games: two unbeatens beat a division mismatch", () => {
    // The old engine featured ANY division game over every cross-division
    // one, which is how a 2-0 v 0-2 division game kept winning.
    const divisionMismatch = candidate(1, team(2, 0, 331, 2), team(0, 2, 197, 2));
    const unbeatens = candidate(2, team(2, 0, 329, 1), team(2, 0, 348, 3));
    expect(pickId([divisionMismatch, unbeatens])).toBe(2);
  });

  it("a 2-0 v 0-2 division game does not beat a 2-0 v 1-1 cross-division game", () => {
    const divisionMismatch = candidate(1, team(2, 0, 331, 2), team(0, 2, 197, 2));
    const decent = candidate(2, team(2, 0, 275, 1), team(1, 1, 295, 3));
    expect(pickId([divisionMismatch, decent])).toBe(2);
  });

  it("leans on the WEAKER team: 1-1 v 1-1 beats 2-0 v 0-2 despite equal combined records", () => {
    const carried = candidate(1, team(2, 0, 400, 1), team(0, 2, 150, 2));
    const even = candidate(2, team(1, 1, 250, 1), team(1, 1, 250, 3));
    expect(pickId([carried, even])).toBe(2);
  });

  it("a division game whose winner takes the lead beats an otherwise equal cross-division game", () => {
    const cross = candidate(1, team(6, 3, 1000, 1), team(5, 4, 980, 2));
    const flip = candidate(2, team(6, 3, 1000, 3), team(5, 4, 980, 3), {
      canFlipDivisionLead: true,
    });
    expect(pickId([cross, flip])).toBe(2);
  });

  it("a named rivalry is a large bonus: it lifts a mismatch over a 2-0 v 1-1 game", () => {
    const rivalry = candidate(1, team(2, 0, 331, 2), team(0, 2, 197, 2), {
      namedRivalry: { name: "The Custody Battle", tagline: null },
    });
    const decent = candidate(2, team(2, 0, 275, 1), team(1, 1, 295, 3));
    const pick = selectGameOfTheWeek([rivalry, decent], { week: 3 });
    expect(pick?.matchupId).toBe(1);
    expect(pick?.reasons[0]).toBe("named-rivalry");
  });

  it("but a named-rivalry mismatch still loses to two unbeatens fighting for a division", () => {
    const rivalry = candidate(1, team(2, 0, 331, 2), team(0, 2, 197, 2), {
      namedRivalry: { name: "The Custody Battle", tagline: null },
    });
    const clash = candidate(2, team(2, 0, 329, 1), team(2, 0, 275, 1), {
      canFlipDivisionLead: true,
    });
    expect(pickId([rivalry, clash])).toBe(2);
  });

  it("a named rivalry between two bad teams never beats a battle of unbeatens", () => {
    // 0-2 v 0-2 (and 0-3 v 1-2 later on) with the name: quality 0 + 25. Two
    // 2-0 teams from different divisions with nothing else going for them:
    // quality 40 + unbeatens 10. The name is a tiebreaker-sized bonus between
    // comparable games, not a trump card over a real marquee game.
    const unbeatens = candidate(2, team(2, 0, 300, 1), team(2, 0, 290, 3));
    for (const [a, b] of [
      [team(0, 2, 180, 2), team(0, 2, 170, 2)],
      [team(0, 3, 250, 2), team(1, 2, 260, 1)],
      [team(1, 1, 250, 2), team(0, 2, 240, 2)],
    ] as const) {
      const rivalry = candidate(1, a, b, {
        namedRivalry: { name: "The Custody Battle", tagline: null },
        isMutualRival: true,
        playoffMeetingYears: [2024],
        h2h: { wins: 4, losses: 4, ties: 0 },
      });
      expect(pickId([rivalry, unbeatens], 3)).toBe(2);
    }
  });

  it("penalizes a franchise featured last week", () => {
    const repeat = candidate(1, team(1, 0, 150, 1), team(1, 0, 150, 2), {
      featuredLastWeek: 1,
    });
    const fresh = candidate(2, team(1, 0, 140, 3), team(1, 0, 140, 1));
    expect(pickId([repeat, fresh], 2)).toBe(2);
  });

  it("penalizes eliminated teams", () => {
    const deadRubber = candidate(
      1,
      { ...team(4, 5, 900, 1), raceTag: "eliminated" },
      { ...team(4, 5, 900, 2), raceTag: "eliminated" }
    );
    const live = candidate(2, team(3, 6, 800, 3), team(3, 6, 800, 1));
    expect(pickId([deadRubber, live], 10)).toBe(2);
  });

  it("breaks a score tie toward the better weaker team, then matchupId", () => {
    const a = candidate(3, team(5, 4, 900, 1), team(5, 4, 850, 2));
    const b = candidate(1, team(5, 4, 900, 1), team(5, 4, 880, 2));
    expect(pickId([a, b])).toBe(1);
    const t = () => team(5, 4, 900, 7);
    expect(pickId([candidate(3, t(), t()), candidate(1, t(), t())])).toBe(1);
  });

  it("ranks by projected strength when no games have been played", () => {
    const zero = () => team(0, 0, 0, null);
    const low = candidate(1, { ...zero(), projected: 90 }, { ...zero(), projected: 88 });
    const high = candidate(2, { ...zero(), projected: 120 }, { ...zero(), projected: 118 });
    expect(pickId([low, high], 1)).toBe(2);
  });

  it("before games, prefers the evenly projected pair over a lopsided one with the same total", () => {
    const zero = () => team(0, 0, 0, null);
    const lopsided = candidate(1, { ...zero(), projected: 150 }, { ...zero(), projected: 90 });
    const even = candidate(2, { ...zero(), projected: 120 }, { ...zero(), projected: 120 });
    expect(pickId([lopsided, even], 1)).toBe(2);
  });

  it("honors an explicit anyGamesPlayed override", () => {
    const a = candidate(1, { ...team(3, 0, 400, null), projected: 80 }, { ...team(0, 3, 300, null), projected: 80 });
    const b = candidate(2, { ...team(1, 2, 350, null), projected: 100 }, { ...team(2, 1, 340, null), projected: 100 });
    expect(pickId([a, b], 4, false)).toBe(2);
  });

  it("at week 1, the flagged title rematch wins outright", () => {
    const zero = () => team(0, 0, 0, null);
    const rematch = candidate(1, { ...zero(), projected: 50 }, { ...zero(), projected: 50 }, { isTitleRematch: true });
    const higher = candidate(2, { ...zero(), projected: 200 }, { ...zero(), projected: 200 });
    const pick = selectGameOfTheWeek([higher, rematch], { week: 1, anyGamesPlayed: false });
    expect(pick?.matchupId).toBe(1);
    expect(pick?.reasons[0]).toBe("title-rematch");
  });

  it("ignores the title rematch flag after week 1", () => {
    const zero = () => team(0, 0, 0, null);
    const rematch = candidate(1, { ...zero(), projected: 50 }, { ...zero(), projected: 50 }, { isTitleRematch: true });
    const higher = candidate(2, { ...zero(), projected: 200 }, { ...zero(), projected: 200 });
    expect(pickId([higher, rematch], 2, false)).toBe(2);
  });

  it("falls through to scoring if two candidates are flagged, without claiming the rematch", () => {
    const zero = () => team(0, 0, 0, null);
    const a = candidate(1, { ...zero(), projected: 50 }, { ...zero(), projected: 50 }, { isTitleRematch: true });
    const b = candidate(2, { ...zero(), projected: 200 }, { ...zero(), projected: 200 }, { isTitleRematch: true });
    const pick = selectGameOfTheWeek([a, b], { week: 1, anyGamesPlayed: false });
    expect(pick?.matchupId).toBe(2);
    expect(pick?.reasons).not.toContain("title-rematch");
  });
});

// The real 2026 week-3 slate (live DB, 2026-09-22). Records after two weeks:
// ROG, LDL, MCC, TTT 2-0; BCH, BGS, VV, WLD 1-1; BCM, FOO, OMM, TB 0-2.
// Divisions: 1 = BGS, LDL, TB, TTT; 2 = BCM, FOO, OMM, ROG;
// 3 = BCH, MCC, VV, WLD. The old engine featured ROG v OMM (the only
// division games were ROG v OMM and BCM v FOO) and called the Division 2
// lead "at stake" although every other Division 2 team was 0-2.
describe("the real 2026 week 3 slate", () => {
  const T = {
    ROG: team(2, 0, 331.36, 2, "ROG"),
    OMM: team(0, 2, 197.02, 2, "OMM"),
    BCM: team(0, 2, 234.12, 2, "BCM"),
    FOO: team(0, 2, 208.98, 2, "FOO"),
    TTT: team(2, 0, 329.6, 1, "TTT"),
    LDL: team(2, 0, 275.92, 1, "LDL"),
    BGS: team(1, 1, 246.26, 1, "BGS"),
    TB: team(0, 2, 285.9, 1, "TB"),
    MCC: team(2, 0, 348.86, 3, "MCC"),
    BCH: team(1, 1, 229.58, 3, "BCH"),
    VV: team(1, 1, 295.2, 3, "VV"),
    WLD: team(1, 1, 272.48, 3, "WLD"),
  };
  type Id = keyof typeof T;
  const games: [number, Id, Id][] = [
    [1, "ROG", "OMM"],
    [2, "BCM", "FOO"],
    [3, "TTT", "WLD"],
    [4, "BCH", "TB"],
    [5, "MCC", "BGS"],
    [6, "LDL", "VV"],
  ];
  const opponent = new Map<string, string>();
  for (const [, a, b] of games) {
    opponent.set(a, b);
    opponent.set(b, a);
  }
  const race: DivisionRaceTeam[] = (Object.keys(T) as Id[]).map((id) => ({
    franchiseId: id,
    wins: T[id].wins,
    losses: T[id].losses,
    ties: T[id].ties,
    division: T[id].division,
    opponentId: opponent.get(id) ?? null,
  }));
  const slate = games.map(([id, a, b]) =>
    candidate(id, T[a], T[b], { canFlipDivisionLead: canFlipDivisionLead(a, b, race) })
  );

  it("ROG v OMM cannot flip the Division 2 lead", () => {
    expect(canFlipDivisionLead("ROG", "OMM", race)).toBe(false);
  });

  it("does not feature ROG v OMM (2-0 v 0-2) absent a named rivalry", () => {
    const pick = selectGameOfTheWeek(slate, { week: 3 });
    expect(pick).not.toBeNull();
    expect(pick!.matchupId).not.toBe(1);
    // One of the three 2-0 v 1-1 games.
    expect([3, 5, 6]).toContain(pick!.matchupId);
    expect(pick!.reasons).not.toContain("division-lead-flip");
    expect(stakesFromReasons(pick!.reasons)).not.toMatch(/division lead/i);
  });

  it("moves off a team featured last week to a comparable game", () => {
    const first = selectGameOfTheWeek(slate, { week: 3 })!.matchupId;
    const withRepeat = slate.map((c) =>
      c.matchupId === first ? { ...c, featuredLastWeek: 1 } : c
    );
    const second = selectGameOfTheWeek(withRepeat, { week: 3 })!.matchupId;
    expect(second).not.toBe(first);
    expect([3, 5, 6]).toContain(second);
  });

  it("can feature ROG v OMM once the league names the rivalry", () => {
    const rivalry = { name: "The Custody Battle", tagline: null };
    const named = slate.map((c) => (c.matchupId === 1 ? { ...c, namedRivalry: rivalry } : c));
    const pick = selectGameOfTheWeek(named, { week: 3 });
    expect(pick!.matchupId).toBe(1);
    expect(stakesFromReasons(pick!.reasons, { namedRivalry: rivalry })).toBe("The Custody Battle");
  });
});

describe("canFlipDivisionLead", () => {
  const t = (
    id: string,
    wins: number,
    losses: number,
    opponentId: string | null = null,
    division = 1
  ): DivisionRaceTeam => ({ franchiseId: id, wins, losses, ties: 0, division, opponentId });

  it("two unbeatens in the same division: the winner leads", () => {
    const div = [t("A", 2, 0, "B"), t("B", 2, 0, "A"), t("C", 1, 1), t("D", 0, 2)];
    expect(canFlipDivisionLead("A", "B", div)).toBe(true);
  });

  it("the leader against a team one game back, nobody else close: the underdog can tie", () => {
    const div = [t("A", 2, 0, "B"), t("B", 1, 1, "A"), t("C", 0, 2), t("D", 0, 2)];
    expect(canFlipDivisionLead("A", "B", div)).toBe(true);
  });

  it("the leader against a team two games back: false", () => {
    const div = [t("A", 2, 0, "B"), t("B", 0, 2, "A"), t("C", 0, 2, "D"), t("D", 0, 2, "C")];
    expect(canFlipDivisionLead("A", "B", div)).toBe(false);
  });

  it("two division-mates playing each other cannot BOTH lose", () => {
    // X wins -> 2-1, but one of C/D (both 2-0, playing each other) goes 3-0.
    const div = [t("X", 1, 1, "Y"), t("Y", 2, 0, "X"), t("C", 2, 0, "D"), t("D", 2, 0, "C")];
    expect(canFlipDivisionLead("X", "Y", div)).toBe(false);
  });

  it("a division-mate playing outside the division may lose (best case)", () => {
    // B wins -> 2-1; C (2-0) plays outside and can drop to 2-1: a tie at the top.
    const div = [t("A", 2, 0, "B"), t("B", 1, 1, "A"), t("C", 2, 0, "Z"), t("D", 0, 2)];
    expect(canFlipDivisionLead("A", "B", div)).toBe(true);
  });

  it("false for a cross-division game or an unknown team", () => {
    const div = [t("A", 2, 0, "B", 1), t("B", 2, 0, "A", 2)];
    expect(canFlipDivisionLead("A", "B", div)).toBe(false);
    expect(canFlipDivisionLead("A", "nobody", div)).toBe(false);
  });
});

describe("gotwReasons", () => {
  it("orders reasons heaviest first", () => {
    const c = candidate(
      1,
      { ...team(3, 0, 400, 1), overallRank: 1 },
      { ...team(3, 0, 390, 1), overallRank: 2 },
      { canFlipDivisionLead: true, h2h: { wins: 2, losses: 2, ties: 0 } }
    );
    const reasons = gotwReasons(c, { week: 4, anyGamesPlayed: true });
    expect(reasons).toEqual([
      "division-lead-flip",
      "unbeatens",
      "top-of-table",
      "series-on-the-line",
    ]);
    const weights = reasons.map((r) => GOTW_REASON_WEIGHTS[r]);
    expect([...weights].sort((x, y) => y - x)).toEqual(weights);
  });

  it("claims no standings stakes before a game has been played", () => {
    const c = candidate(1, team(0, 0, 0, 1), team(0, 0, 0, 1), { canFlipDivisionLead: true });
    expect(gotwReasons(c, { week: 1, anyGamesPlayed: false })).toEqual(["season-opener"]);
  });

  it("falls back to pride, never an empty list", () => {
    const c = candidate(1, team(3, 4, 800, 1), team(1, 6, 700, 2));
    expect(gotwReasons(c, { week: 8, anyGamesPlayed: true })).toEqual(["pride"]);
  });

  it("flags a coin-flip Book line and a win-and-in team", () => {
    const c = candidate(
      1,
      team(7, 6, 1500, 1),
      { ...team(6, 7, 1400, 2), raceTag: "win-and-in" },
      { bookSpread: -2.5 }
    );
    const reasons = gotwReasons(c, { week: 14, anyGamesPlayed: true });
    expect(reasons).toContain("coin-flip-line");
    expect(reasons).toContain("playoff-clinch");
  });
});

describe("stakesFromReasons (the kicker's second clause)", () => {
  const all = Object.keys(GOTW_REASON_WEIGHTS) as GotwReason[];

  it("says Division lead on the line ONLY for division-lead-flip", () => {
    for (const r of all) {
      const clause = stakesFromReasons([r], {
        namedRivalry: { name: "The Custody Battle", tagline: null },
        h2h: { wins: 4, losses: 4, ties: 0 },
        playoffMeetingYears: [2025],
      });
      if (r === "division-lead-flip") expect(clause).toBe("Division lead on the line");
      else expect(clause, r).not.toMatch(/division lead/i);
    }
  });

  it("maps each reason to its clause", () => {
    expect(stakesFromReasons(["unbeatens"])).toBe("Battle of unbeatens");
    expect(stakesFromReasons(["playoff-clinch"])).toBe("Playoff spot at stake");
    expect(
      stakesFromReasons(["series-on-the-line"], { h2h: { wins: 4, losses: 4, ties: 0 } })
    ).toBe("Series tied 4-4");
    expect(
      stakesFromReasons(["series-on-the-line"], { h2h: { wins: 4, losses: 3, ties: 0 } })
    ).toBe("One game apart all time");
    expect(stakesFromReasons(["playoff-history"], { playoffMeetingYears: [2025, 2023] })).toBe(
      "Met in the 2025 playoffs"
    );
    expect(stakesFromReasons(["season-opener"])).toBe("Season openers");
    expect(stakesFromReasons(["pride"])).toBe("Pride at stake");
  });

  it("skips the title rematch (the kicker lead says it) to the next reason", () => {
    expect(stakesFromReasons(["title-rematch", "season-opener"])).toBe("Season openers");
  });

  it("skips a named-rivalry reason with no rivalry fact rather than printing nothing", () => {
    expect(stakesFromReasons(["named-rivalry", "unbeatens"])).toBe("Battle of unbeatens");
  });
});

describe("gotwKickerLead + isRecentRematch", () => {
  it("says Rematch only when the pair met this season or last", () => {
    expect(isRecentRematch({ seasonYear: 2025 }, 2026)).toBe(true);
    expect(isRecentRematch({ seasonYear: 2026 }, 2026)).toBe(true);
    expect(isRecentRematch({ seasonYear: 2023 }, 2026)).toBe(false);
    expect(isRecentRematch(null, 2026)).toBe(false);
    const base = { isTitleRematch: false, bowlName: null, divisionName: "Division 2" };
    expect(gotwKickerLead({ ...base, isRecentRematch: true })).toBe("Division 2 Rematch");
    expect(gotwKickerLead({ ...base, isRecentRematch: false })).toBe("Division 2 Game");
    expect(gotwKickerLead({ ...base, divisionName: null, isRecentRematch: true })).toBe(
      "Cross-Division"
    );
  });

  it("names the bowl for the week-1 title rematch", () => {
    expect(
      gotwKickerLead({
        isTitleRematch: true,
        bowlName: "HMLML Bowl V",
        divisionName: null,
        isRecentRematch: true,
      })
    ).toBe("HMLML Bowl V Rematch");
    expect(
      gotwKickerLead({ isTitleRematch: true, bowlName: null, divisionName: null, isRecentRematch: true })
    ).toBe("Title Game Rematch");
  });
});

describe("namedRivalryKicker", () => {
  const facts = { anyGamesPlayed: true, recordA: "2-0", recordB: "0-2", gameType: "Division 2 Game" };

  it("leads with the name, then the records when no real standings stake applies", () => {
    expect(
      namedRivalryKicker("The Custody Battle", ["named-rivalry", "playoff-history", "mutual-rival"], facts)
    ).toBe("The Custody Battle · 2-0 meets 0-2");
  });

  it("uses a real standings stake over the records when the pick carries one", () => {
    expect(
      namedRivalryKicker("The Split Decision", ["named-rivalry", "division-lead-flip", "unbeatens"], {
        ...facts,
        recordB: "2-0",
      })
    ).toBe("The Split Decision · Division lead on the line");
    expect(
      namedRivalryKicker("The Split Decision", ["named-rivalry", "unbeatens"], { ...facts, recordB: "2-0" })
    ).toBe("The Split Decision · Battle of unbeatens");
  });

  it("before any game is played it names the game type, never a 0-0 record", () => {
    const text = namedRivalryKicker("The Custody Battle", ["named-rivalry", "season-opener"], {
      ...facts,
      anyGamesPlayed: false,
      recordA: "0-0",
      recordB: "0-0",
    });
    expect(text).toBe("The Custody Battle · Division 2 Game");
  });
});

describe("gameOfWeekBlurb", () => {
  const base = {
    teamA: { name: "The Tokyo Thunderbirds", record: "2-0" },
    teamB: { name: "Latter Day Lamb Special", record: "2-0" },
    divisionName: "Division 1",
    h2h: { wins: 3, losses: 5, ties: 0 },
    lastMeeting: null,
    playoffMeetingYears: [2024],
    namedRivalry: { name: "The Split Decision", tagline: "They always split." },
    bowlName: "HMLML Bowl V",
  };
  const all = Object.keys(GOTW_REASON_WEIGHTS) as GotwReason[];

  it("never uses a stock idiom, a hard-coded weekday or a first-place claim, for any reason", () => {
    for (const r of all) {
      const text = gameOfWeekBlurb({
        ...base,
        reasons: [r],
        teamA: { ...base.teamA, raceTag: "win-and-in" },
      });
      const norm = normalize(text);
      for (const phrase of SIGNATURE_PHRASES) expect(norm, r).not.toContain(phrase);
      expect(text, r).not.toMatch(/first place|thursday|wednesday|sunday/i);
      expect(text, r).not.toMatch(/[—–]/);
      expect(text.length, r).toBeLessThanOrEqual(400);
    }
  });

  it("claims a division outcome only for division-lead-flip", () => {
    for (const r of all) {
      const text = gameOfWeekBlurb({ ...base, reasons: [r] });
      if (r === "division-lead-flip") expect(text).toContain("on top of it or tied for it");
      else expect(text, r).not.toMatch(/on top of it/);
    }
  });

  it("states the series from the right side", () => {
    const text = gameOfWeekBlurb({ ...base, reasons: ["unbeatens"] });
    expect(text).toBe(
      "The Tokyo Thunderbirds (2-0) and Latter Day Lamb Special (2-0) are both unbeaten, and by Monday night one of them will not be. Latter Day Lamb Special leads the all-time series 5-3."
    );
  });

  it("the named-rivalry blurb names the rivalry and this meeting's facts, not the tagline", () => {
    const text = gameOfWeekBlurb({ ...base, reasons: ["named-rivalry", "playoff-history"] });
    expect(text).toBe(
      "The Tokyo Thunderbirds (2-0) against Latter Day Lamb Special (2-0), the latest chapter of The Split Decision. Latter Day Lamb Special leads the all-time series 5-3. They met in the 2024 playoffs too."
    );
    // The card prints the tagline as its own aside; the blurb must not echo it.
    expect(text).not.toContain("They always split.");
  });

  it("says a first meeting plainly", () => {
    const text = gameOfWeekBlurb({ ...base, h2h: null, reasons: ["pride"] });
    expect(text).toMatch(/They have never played each other\.$/);
  });
});

describe("markTitleRematch", () => {
  it("flags the candidate whose two franchises are exactly {champion, runnerUp}", () => {
    const rematch = candidate(
      1,
      team(0, 0, 0, null, "champ-id"),
      team(0, 0, 0, null, "runner-id")
    );
    const other = candidate(
      2,
      team(0, 0, 0, null, "other-a"),
      team(0, 0, 0, null, "other-b")
    );
    const marked = markTitleRematch([rematch, other], {
      championFranchiseId: "champ-id",
      runnerUpFranchiseId: "runner-id",
    });
    expect(marked.find((c) => c.matchupId === 1)?.isTitleRematch).toBe(true);
    expect(marked.find((c) => c.matchupId === 2)?.isTitleRematch).toBeUndefined();
  });

  it("matches order-insensitively (runner-up as teamA, champion as teamB)", () => {
    const rematch = candidate(
      1,
      team(0, 0, 0, null, "runner-id"),
      team(0, 0, 0, null, "champ-id")
    );
    const marked = markTitleRematch([rematch], {
      championFranchiseId: "champ-id",
      runnerUpFranchiseId: "runner-id",
    });
    expect(marked[0].isTitleRematch).toBe(true);
  });

  it("is a no-op when titlePair is null", () => {
    const a = candidate(1, team(0, 0, 0, null, "x"), team(0, 0, 0, null, "y"));
    const marked = markTitleRematch([a], null);
    expect(marked[0].isTitleRematch).toBeUndefined();
  });

  it("does not flag a matchup with only one of the two title-game franchises", () => {
    const a = candidate(
      1,
      team(0, 0, 0, null, "champ-id"),
      team(0, 0, 0, null, "someone-else")
    );
    const marked = markTitleRematch([a], {
      championFranchiseId: "champ-id",
      runnerUpFranchiseId: "runner-id",
    });
    expect(marked[0].isTitleRematch).toBeUndefined();
  });
});

describe("betweenWeeksHeadline", () => {
  const now = new Date("2025-11-11T18:00:00Z"); // Tuesday, noon in Chicago

  it("never says 'until it matters again'", () => {
    for (let week = 1; week <= 18; week++) {
      for (const k of ["2025-11-11T23:00:00Z", "2025-11-12T23:00:00Z", "2025-11-14T01:15:00Z"]) {
        expect(betweenWeeksHeadline(new Date(k), now, week)).not.toMatch(/matters again/);
      }
    }
  });

  it("two days out: every variant states the true count or the true weekday", () => {
    const kickoff = new Date("2025-11-14T01:15:00Z"); // Thursday 7:15pm Chicago
    const seen = new Set<string>();
    for (let week = 1; week <= 6; week++) seen.add(betweenWeeksHeadline(kickoff, now, week));
    expect([...seen].sort()).toEqual(
      ["Kickoff is Thursday.", "Two days to kickoff.", "Two days until Thursday kickoff."].sort()
    );
  });

  it("varies by week, so consecutive weeks do not read identically", () => {
    const kickoff = new Date("2025-11-14T01:15:00Z");
    expect(betweenWeeksHeadline(kickoff, now, 3)).not.toBe(betweenWeeksHeadline(kickoff, now, 4));
  });

  it("one day out says tomorrow or one day, and names the right weekday", () => {
    const kickoff = new Date("2025-11-13T01:15:00Z"); // Wednesday 7:15pm Chicago
    const seen = new Set<string>();
    for (let week = 1; week <= 6; week++) seen.add(betweenWeeksHeadline(kickoff, now, week));
    expect([...seen].sort()).toEqual(
      ["Kickoff is tomorrow.", "One day to kickoff.", "Wednesday kickoff, one day out."].sort()
    );
  });

  it("same calendar day says today", () => {
    const kickoff = new Date("2025-11-11T23:00:00Z");
    for (let week = 1; week <= 4; week++) {
      expect(betweenWeeksHeadline(kickoff, now, week)).toMatch(/today/);
    }
  });

  it("does not name a bare weekday a week or more out", () => {
    const kickoff = new Date("2025-11-19T01:15:00Z"); // eight days
    for (let week = 1; week <= 6; week++) {
      expect(betweenWeeksHeadline(kickoff, now, week)).not.toMatch(/^Kickoff is/);
    }
  });

  it("degrades to a static line when kickoff is unknown or past", () => {
    expect(betweenWeeksHeadline(null, now)).toBe("The slate is set.");
    expect(betweenWeeksHeadline(new Date("2025-11-10T20:15:00Z"), now)).toBe("The slate is set.");
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

describe("genericSlateAngle", () => {
  it("builds a records line whose tail is true of every game", () => {
    expect(genericSlateAngle("6-3", "5-4")).toBe(
      "6-3 against 5-4. Both records move by Monday night."
    );
  });
});

describe("kickoffWeekdayName", () => {
  it("names the weekday of a kickoff instant in the league's home timezone", () => {
    // Chicago is UTC-5 (CDT) in September; 05:00 UTC on 2026-09-09 is
    // midnight Chicago local time on that same date, a Wednesday (the 2026
    // week-1 slate opens that day).
    expect(kickoffWeekdayName(new Date("2026-09-09T05:00:00Z"))).toBe("Wednesday");
  });

  it("falls back gracefully when there is no kickoff date", () => {
    expect(kickoffWeekdayName(null)).toBe("kickoff");
  });
});
