import { describe, it, expect } from "vitest";
import {
  selectGameOfTheWeek,
  markTitleRematch,
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
  formSentence,
  teamFormFrom,
  type WeekFinalLike,
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

  it("weighs a named rivalry between top-of-table and a division-lead flip", () => {
    const w = GOTW_REASON_WEIGHTS;
    expect(w["named-rivalry"]).toBe(12);
    expect(w["named-rivalry"]).toBeGreaterThan(w["top-of-table"]);
    expect(w["named-rivalry"]).toBeLessThan(w["division-lead-flip"]);
  });

  it("a named rivalry no longer carries a mismatch: a 2-0 v 1-1 game beats a 2-0 v 0-2 rivalry", () => {
    const rivalry = candidate(1, team(2, 0, 331, 2), team(0, 2, 197, 2), {
      namedRivalry: { name: "The Custody Battle", tagline: null },
    });
    const decent = candidate(2, team(2, 0, 275, 1), team(1, 1, 295, 3));
    expect(pickId([rivalry, decent], 3)).toBe(2);
  });

  it("a named rivalry between two 2-0 teams still beats two 2-0 non-rivals", () => {
    const rivalry = candidate(1, team(2, 0, 300, 1), team(2, 0, 290, 3), {
      namedRivalry: { name: "The Split Decision", tagline: null },
    });
    const plain = candidate(2, team(2, 0, 340, 2), team(2, 0, 330, 1));
    const pick = selectGameOfTheWeek([plain, rivalry], { week: 3 });
    expect(pick?.matchupId).toBe(1);
    expect(pick?.reasons[0]).toBe("named-rivalry");
  });

  it("a named rivalry still lifts an even game over a better but lopsided one", () => {
    // 1-1 v 1-1 with the name (20 + 12) over a 2-0 v 1-1 non-rival (27).
    const rivalry = candidate(1, team(1, 1, 250, 2), team(1, 1, 240, 3), {
      namedRivalry: { name: "The Custody Battle", tagline: null },
    });
    const decent = candidate(2, team(2, 0, 275, 1), team(1, 1, 295, 3));
    expect(pickId([rivalry, decent], 3)).toBe(1);
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
    // 0-2 v 0-2 (and 0-3 v 1-2 later on) with the name: quality 0 + 12. Two
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

  it("keeps ROG v OMM off the Game of the Week even once the league names the rivalry", () => {
    // At weight 25 the name carried this 2-0 v 0-2 mismatch to the top card;
    // at 12 it scores 26 against the 2-0 v 1-1 games' 27, so it stays a
    // slate card (which still prints the rivalry's name and tagline).
    const rivalry = { name: "The Custody Battle", tagline: null };
    const named = slate.map((c) => (c.matchupId === 1 ? { ...c, namedRivalry: rivalry } : c));
    const pick = selectGameOfTheWeek(named, { week: 3 });
    expect(pick!.matchupId).not.toBe(1);
    expect([3, 5, 6]).toContain(pick!.matchupId);
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

  it("a division-mate playing outside the division is assumed to win (worst case)", () => {
    // B wins -> 2-1; C (2-0) plays outside and may go 3-0: B is not on top.
    const div = [t("A", 2, 0, "B"), t("B", 1, 1, "A"), t("C", 2, 0, "Z"), t("D", 0, 2)];
    expect(canFlipDivisionLead("A", "B", div)).toBe(false);
  });

  it("week-5 shape: 1-1 v 1-1 while a 2-0 division-mate plays outside: false", () => {
    // The live 2026 week-5 slate: VV 1-1 v BCH 1-1 in the division while MCC
    // (2-0) plays outside it. The winner goes 2-1, MCC can go 3-0, so the
    // "Division lead on the line" claim would not be true.
    const div = [
      t("VV", 1, 1, "BCH"),
      t("BCH", 1, 1, "VV"),
      t("MCC", 2, 0, "OUT"),
      t("D", 0, 2, "OUT2"),
    ];
    expect(canFlipDivisionLead("VV", "BCH", div)).toBe(false);
  });

  it("a division-mate with no known opponent is assumed to win", () => {
    const div = [t("A", 2, 0, "B"), t("B", 2, 0, "A"), t("C", 2, 0), t("D", 0, 2)];
    // Winner 3-0; C at best 3-0: a share of the lead, still guaranteed.
    expect(canFlipDivisionLead("A", "B", div)).toBe(true);
    const ahead = [t("A", 1, 1, "B"), t("B", 1, 1, "A"), t("C", 2, 0), t("D", 0, 2)];
    expect(canFlipDivisionLead("A", "B", ahead)).toBe(false);
  });

  it("two division-mates playing each other: EVERY outcome must leave the winner on top", () => {
    // A/B winner -> 3-0. C 2-0 v D 2-0: the C/D winner also goes 3-0, a tie at
    // most, in both outcomes: true.
    const tied = [t("A", 2, 0, "B"), t("B", 2, 0, "A"), t("C", 2, 0, "D"), t("D", 2, 0, "C")];
    expect(canFlipDivisionLead("A", "B", tied)).toBe(true);
    // A/B winner -> 2-1. C 2-0 v D 1-1: C winning goes 3-0; one bad outcome is enough.
    const oneBad = [t("A", 1, 1, "B"), t("B", 1, 1, "A"), t("C", 2, 0, "D"), t("D", 1, 1, "C")];
    expect(canFlipDivisionLead("A", "B", oneBad)).toBe(false);
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
      if (r === "division-lead-flip") expect(text).toContain("whoever wins walks out on top of it or tied for it");
      else expect(text, r).not.toMatch(/on top of it/);
    }
  });

  it("the double win-and-in blurb never claims the loser misses out this week", () => {
    // win-and-in means a win clinches; the loser can still clinch on other
    // results, so "only one of them does it this week" was not provable.
    const text = gameOfWeekBlurb({
      ...base,
      reasons: ["playoff-clinch"],
      teamA: { ...base.teamA, raceTag: "win-and-in" },
      teamB: { ...base.teamB, raceTag: "win-and-in" },
    });
    expect(text).toContain("only one of them gets the win");
    expect(text).not.toMatch(/does it this week/);
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

  // Blake: lead with each team's last week. The live week-2 finals for the
  // two sides of The Custody Battle: ROG beat BCM 152.1-127.4, OMM lost to
  // MCC 163.9-114.54 and is 0-2.
  describe("with last week's form", () => {
    const rog = {
      name: "Real Olave Garden",
      record: "2-0",
      lastWeek: { points: 152.1, opponentName: "Better call Myballs", margin: 24.7, won: true },
    };
    const omm = {
      name: "Of Mice and Mendoza",
      record: "0-2",
      winless: true,
      lastWeek: { points: 114.54, opponentName: "McCarthyism", margin: 49.4, won: false },
    };
    const custody = {
      ...base,
      teamA: rog,
      teamB: omm,
      divisionName: "Division 2",
      h2h: { wins: 3, losses: 1, ties: 0 },
      playoffMeetingYears: [],
      namedRivalry: { name: "The Custody Battle", tagline: "They used to share a team." },
    };

    it("opens with the sharper result, then the rivalry's chapter, then the series", () => {
      const text = gameOfWeekBlurb({ ...custody, reasons: ["named-rivalry"] });
      expect(text).toBe(
        "Of Mice and Mendoza lost by 49.4 and is still looking for a first win. " +
          "Real Olave Garden beat Better call Myballs by 24.7 last week. " +
          "Now The Custody Battle, chapter five. " +
          "Real Olave Garden leads the all-time series 3-1."
      );
    });

    it("keeps team A first when the two results are equally sharp", () => {
      const text = gameOfWeekBlurb({
        ...custody,
        teamB: { ...omm, winless: false, lastWeek: { ...omm.lastWeek, margin: 20.1 } },
        reasons: ["pride"],
      });
      expect(text.startsWith("Real Olave Garden beat Better call Myballs by 24.7 last week. ")).toBe(true);
      expect(text).toContain("Of Mice and Mendoza lost to McCarthyism by 20.1.");
    });

    it("drops the repeated names and records from the reason sentence", () => {
      const text = gameOfWeekBlurb({ ...custody, reasons: ["division-lead-flip"] });
      expect(text).toContain(
        "Now they meet inside Division 2, and whoever wins walks out on top of it or tied for it."
      );
      expect(text).not.toContain("(2-0)");
    });

    it("says the next chapter when there is no series on file", () => {
      const text = gameOfWeekBlurb({ ...custody, h2h: null, reasons: ["named-rivalry"] });
      expect(text).toContain("Now the next chapter of The Custody Battle.");
    });

    it("one side with no result still leads with the other side's form", () => {
      const text = gameOfWeekBlurb({ ...custody, teamA: { ...rog, lastWeek: null }, reasons: ["pride"] });
      expect(text.startsWith("Of Mice and Mendoza lost by 49.4")).toBe(true);
    });

    it("never uses a stock idiom or an em-dash, for any reason, and stays under 400", () => {
      for (const r of all) {
        const text = gameOfWeekBlurb({
          ...custody,
          reasons: [r],
          teamA: { ...rog, raceTag: "win-and-in" },
        });
        const norm = normalize(text);
        for (const phrase of SIGNATURE_PHRASES) expect(norm, r).not.toContain(phrase);
        expect(text, r).not.toMatch(/[—–]|first place|thursday/i);
        expect(text.length, r).toBeLessThanOrEqual(400);
      }
    });
  });
});

describe("formSentence: skips the hub hero's claim", () => {
  // The live week-3 hero: "Taking Boutte lost by 64.2. It was not that close."
  const blowout = { kind: "blowout" as const, franchiseIds: ["TB", "TTT"], numbers: ["64.2"] };
  const ttt = {
    franchiseId: "TTT",
    name: "The Tokyo Thunderbirds",
    record: "2-0",
    lastWeek: { points: 204.94, opponentName: "Taking Boutte", margin: 64.2, won: true },
  };
  const tb = {
    franchiseId: "TB",
    name: "Taking Boutte",
    record: "0-2",
    winless: true,
    lastWeek: { points: 140.78, opponentName: "The Tokyo Thunderbirds", margin: 64.2, won: false },
  };

  it("the winner of the claimed blowout gets its score instead of the margin", () => {
    expect(formSentence(ttt, blowout)).toEqual({
      text: "The Tokyo Thunderbirds just hung 204.9 on Taking Boutte.",
      sharpness: 3,
    });
  });

  it("the loser of the claimed blowout gets its score, still winless, no margin", () => {
    const s = formSentence(tb, blowout)!.text;
    expect(s).toBe(
      "Taking Boutte scored 140.8 in a loss to The Tokyo Thunderbirds and is still looking for a first win."
    );
    expect(s).not.toContain("64.2");
  });

  it("a monster-score claim on the team keeps the margin and drops the score", () => {
    const monster = { kind: "monster-score" as const, franchiseIds: ["TTT"], numbers: ["204.9"] };
    expect(formSentence(ttt, monster)!.text).toBe(
      "The Tokyo Thunderbirds just ran Taking Boutte off the field by 64.2."
    );
    // With the margin also printed by the hero, only the name is left.
    const both = { ...monster, numbers: ["204.9", "64.2"] };
    expect(formSentence(ttt, both)!.text).toBe(
      "The Tokyo Thunderbirds beat Taking Boutte last week."
    );
  });

  it("the number backstop works without a franchise id", () => {
    const { franchiseId: _id, ...anon } = ttt;
    void _id;
    expect(formSentence(anon, blowout)!.text).toBe(
      "The Tokyo Thunderbirds just hung 204.9 on Taking Boutte."
    );
  });

  it("a claim about other teams changes nothing", () => {
    const other = { kind: "blowout" as const, franchiseIds: ["OMM", "MCC"], numbers: ["49.4"] };
    expect(formSentence(ttt, other)).toEqual(formSentence(ttt));
  });
});

describe("formSentence", () => {
  const f = (points: number, margin: number, won: boolean, winless = false) =>
    formSentence({
      name: "TTT",
      record: "2-0",
      winless,
      lastWeek: { points, opponentName: "TB", margin, won },
    })!.text;

  it("ranks each result by how much it says", () => {
    expect(f(204.94, 64.2, true)).toBe("TTT just ran TB off the field by 64.2.");
    expect(f(176.3, 20, true)).toBe("TTT just hung 176.3 on TB.");
    expect(f(120.8, 0.8, true)).toBe("TTT just escaped TB by 0.8.");
    expect(f(130, 20, true)).toBe("TTT beat TB by 20.0 last week.");
    expect(f(140.78, 64.2, false)).toBe("TTT lost by 64.2.");
    expect(f(82.48, 30, false)).toBe("TTT managed 82.5 in a loss to TB.");
    expect(f(120, 1.2, false, true)).toBe("TTT lost to TB by 1.2 and is still looking for a first win.");
    expect(f(120, 0, false)).toBe("TTT tied TB at 120.0 last week.");
  });

  it("is null without a result", () => {
    expect(formSentence({ name: "TTT", record: "0-0" })).toBeNull();
  });
});

describe("teamFormFrom", () => {
  const finals: WeekFinalLike[] = [
    {
      winner: { franchiseId: "TTT", name: "The Tokyo Thunderbirds", points: 204.94 },
      loser: { franchiseId: "TB", name: "Taking Boutte", points: 140.78 },
      margin: 64.2,
    },
    {
      winner: { franchiseId: "A", name: "A", points: 100 },
      loser: { franchiseId: "B", name: "B", points: 100 },
      margin: 0,
    },
  ];
  it("reads each side from its own perspective", () => {
    expect(teamFormFrom(finals, "TTT")).toEqual({
      points: 204.94,
      opponentName: "Taking Boutte",
      margin: 64.2,
      won: true,
    });
    expect(teamFormFrom(finals, "TB")).toEqual({
      points: 140.78,
      opponentName: "The Tokyo Thunderbirds",
      margin: 64.2,
      won: false,
    });
  });
  it("a tie is nobody's win, and a team with no final has no form", () => {
    expect(teamFormFrom(finals, "A")?.won).toBe(false);
    expect(teamFormFrom(finals, "B")?.won).toBe(false);
    expect(teamFormFrom(finals, "ZZZ")).toBeNull();
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
