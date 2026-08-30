import { describe, it, expect } from "vitest";
import {
  chooseCeilingThreshold,
  DEFAULT_CEILING_THRESHOLD,
  findBiggestFavorite,
  formatOverUnderLine,
  formatPropLine,
  gradeCeilingWatch,
  gradeOverUnderLine,
  gradeMercyLine,
  priceCeilingWatch,
  priceLeagueTotal,
  priceMercyLine,
  probAnyoneOverThreshold,
  propSideLabels,
  toHalfInteger,
  choosePercentileThreshold,
  chooseBlowoutThreshold,
  DEFAULT_BLOWOUT_THRESHOLD,
  encodePairSubject,
  formatPropActual,
  gradeBlowout,
  gradeMatchbet,
  parsePairSubject,
  PLAYER_UNCERTAINTY_SCALE,
  priceBlowoutSpecial,
  priceMatchbet,
  pricePlayerPoints,
  priceTeamTotal,
  PROP_GROUP,
  PROP_ORDER,
  PROP_GROUP_ORDER,
  propDisplay,
  SCORE_UNCERTAINTY_SCALE,
  propLineUnit,
  selectStickySubjects,
} from "./props";

describe("toHalfInteger", () => {
  it("never returns a whole number", () => {
    for (const v of [0, 1, 2, 24, 24.4, 24.6, 100, 150.5]) {
      expect(Number.isInteger(toHalfInteger(v))).toBe(false);
    }
  });

  it("rounds to the nearest half point", () => {
    expect(toHalfInteger(24.1)).toBe(24.5);
    expect(toHalfInteger(24.6)).toBe(24.5);
    expect(toHalfInteger(24.99)).toBe(24.5);
    expect(toHalfInteger(25.5)).toBe(25.5);
  });
});

describe("priceLeagueTotal", () => {
  it("lines the combined projection and never pushes", () => {
    const totals = Array.from({ length: 12 }, (_, i) => 90 + i);
    const price = priceLeagueTotal(totals);
    expect(price.line % 1).toBe(0.5);
    expect(price.overOdds).toBe(-115);
    expect(price.underOdds).toBe(-105);

    expect(gradeOverUnderLine(price.line + 0.1, price.line)).toBe("over");
    expect(gradeOverUnderLine(price.line - 0.1, price.line)).toBe("under");
  });

  it("empty totals price a zero-ish line, not NaN", () => {
    const price = priceLeagueTotal([]);
    expect(Number.isNaN(price.line)).toBe(false);
    expect(price.line % 1).toBe(0.5);
  });
});

describe("Ceiling Watch", () => {
  it("prices a near-certain YES as a heavy favorite and NO as a heavy dog", () => {
    const totals = Array.from({ length: 12 }, () => 200);
    const price = priceCeilingWatch(totals, 150);
    expect(price.overOdds).toBeLessThan(-100);
    expect(price.underOdds).toBeGreaterThan(100);
  });

  it("prices a near-impossible YES as a heavy dog", () => {
    const totals = Array.from({ length: 12 }, () => 60);
    const price = priceCeilingWatch(totals, 150);
    expect(price.overOdds).toBeGreaterThan(100);
  });

  it("more teams in range raises P(anyone clears it)", () => {
    const one = probAnyoneOverThreshold([145], 150);
    const twelve = probAnyoneOverThreshold(Array(12).fill(145), 150);
    expect(twelve).toBeGreaterThan(one);
  });

  it("grades YES only once a score truly clears the threshold", () => {
    expect(gradeCeilingWatch(150, 150)).toBe("over");
    expect(gradeCeilingWatch(149.99, 150)).toBe("under");
    expect(gradeCeilingWatch(162.4, 150)).toBe("over");
  });

  it("falls back to the documented default without enough history", () => {
    expect(chooseCeilingThreshold([])).toBe(DEFAULT_CEILING_THRESHOLD);
    expect(chooseCeilingThreshold(Array(5).fill(120))).toBe(
      DEFAULT_CEILING_THRESHOLD,
    );
  });

  it("uses the trailing history's P95 once there is enough of it", () => {
    // 100 scores clustered around 130, with a scattering of high outliers so
    // the 95th percentile lands meaningfully above the default.
    const scores = [
      ...Array(90).fill(130),
      ...Array(10).fill(190),
    ];
    const threshold = chooseCeilingThreshold(scores);
    expect(threshold).toBeGreaterThan(100);
    expect(threshold % 10).toBe(0);
  });
});

describe("Mercy Line", () => {
  it("lines the favorite's projected margin and never pushes", () => {
    const price = priceMercyLine(120, 95);
    expect(price.line % 1).toBe(0.5);
    expect(price.line).toBe(25.5);
  });

  it("grades over/under off the actual margin", () => {
    const price = priceMercyLine(120, 95); // line ~24.5
    expect(gradeMercyLine(price.line + 1, price.line)).toBe("over");
    expect(gradeMercyLine(price.line - 1, price.line)).toBe("under");
  });
});

describe("findBiggestFavorite", () => {
  it("picks the widest projected margin", () => {
    const best = findBiggestFavorite([
      { matchupId: 1, rosterA: "1", rosterB: "2", projA: 100, projB: 98 },
      { matchupId: 2, rosterA: "3", rosterB: "4", projA: 140, projB: 90 },
      { matchupId: 3, rosterA: "5", rosterB: "6", projA: 80, projB: 110 },
    ]);
    expect(best).toEqual({
      matchupId: 2,
      favoriteRosterId: "3",
      dogRosterId: "4",
      favoriteProjected: 140,
      dogProjected: 90,
    });
  });

  it("identifies the favorite regardless of which side is listed first", () => {
    const best = findBiggestFavorite([
      { matchupId: 9, rosterA: "10", rosterB: "11", projA: 70, projB: 130 },
    ]);
    expect(best?.favoriteRosterId).toBe("11");
    expect(best?.dogRosterId).toBe("10");
  });

  it("returns null with no pairings", () => {
    expect(findBiggestFavorite([])).toBeNull();
  });
});

describe("presentation", () => {
  it("formats an over/under line with a thousands separator and one decimal", () => {
    expect(formatOverUnderLine(1178.5)).toBe("O/U 1,178.5");
    expect(formatOverUnderLine(24.5)).toBe("O/U 24.5");
  });

  it("labels Ceiling Watch as Yes/No and everything else as Over/Under", () => {
    expect(propSideLabels("ceiling_watch")).toEqual({ over: "Yes", under: "No" });
    expect(propSideLabels("league_total")).toEqual({ over: "Over", under: "Under" });
    expect(propSideLabels("mercy_line")).toEqual({ over: "Over", under: "Under" });
  });

  it("shows YES / NO instead of a number for Ceiling Watch", () => {
    expect(formatPropLine("ceiling_watch", 150)).toBe("YES / NO");
    expect(formatPropLine("league_total", 1178.5)).toBe("O/U 1,178.5");
  });
});

// ===========================================================================
// The expanded slate (issue #239)
// ===========================================================================

describe("pricePlayerPoints", () => {
  it("lines the projection on the half-integer grid and never pushes", () => {
    for (const projected of [4, 8.2, 12.5, 19.99, 27.4]) {
      const price = pricePlayerPoints(projected);
      expect(price.line % 1).toBe(0.5);
      expect(gradeOverUnderLine(price.line + 0.01, price.line)).toBe("over");
      expect(gradeOverUnderLine(price.line - 0.01, price.line)).toBe("under");
      // The exact line is unreachable by construction, but the boundary must
      // still resolve one way rather than throw.
      expect(gradeOverUnderLine(price.line, price.line)).toBe("under");
    }
  });

  it("prices the side the rounding favored as the shorter price", () => {
    // 12.9 rounds DOWN to a 12.5 line, so the over is the likelier side.
    const price = pricePlayerPoints(12.9);
    expect(price.line).toBe(12.5);
    expect(price.overOdds).toBeLessThan(price.underOdds);

    // 12.1 rounds UP to 12.5, so the under is the likelier side.
    const other = pricePlayerPoints(12.1);
    expect(other.line).toBe(12.5);
    expect(other.underOdds).toBeLessThan(other.overOdds);
  });

  it("stays finite on a zero projection", () => {
    const price = pricePlayerPoints(0);
    expect(Number.isFinite(price.overOdds)).toBe(true);
    expect(Number.isFinite(price.underOdds)).toBe(true);
  });
});

describe("priceTeamTotal", () => {
  it("lines a roster's projection on the half-integer grid", () => {
    const price = priceTeamTotal(118.3);
    expect(price.line).toBe(118.5);
    expect(gradeOverUnderLine(118.6, price.line)).toBe("over");
    expect(gradeOverUnderLine(118.4, price.line)).toBe("under");
  });

  it("is less confident than a player prop at the same rounding distance", () => {
    // A whole lineup carries more absolute uncertainty than one player, so the
    // same 0.4-point rounding edge moves the price less.
    const team = priceTeamTotal(118.1);
    const player = pricePlayerPoints(18.1);
    expect(Math.abs(team.overOdds - team.underOdds)).toBeLessThan(
      Math.abs(player.overOdds - player.underOdds),
    );
  });
});

describe("priceMatchbet / gradeMatchbet", () => {
  it("prices two identical projections as a coin flip", () => {
    const price = priceMatchbet(15, 15, PLAYER_UNCERTAINTY_SCALE);
    expect(price.overOdds).toBe(price.underOdds);
  });

  it("makes the higher projection the favorite", () => {
    const price = priceMatchbet(22, 11, PLAYER_UNCERTAINTY_SCALE);
    expect(price.overOdds).toBeLessThan(price.underOdds);
  });

  it("pushes on exact equality and only on exact equality", () => {
    expect(gradeMatchbet(18.4, 18.4)).toBe("push");
    expect(gradeMatchbet(18.41, 18.4)).toBe("over");
    expect(gradeMatchbet(18.4, 18.41)).toBe("under");
    expect(gradeMatchbet(0, 0)).toBe("push");
  });
});

describe("Blowout Special", () => {
  it("falls back to the documented default without enough history", () => {
    expect(chooseBlowoutThreshold([])).toBe(DEFAULT_BLOWOUT_THRESHOLD);
    expect(chooseBlowoutThreshold(Array(5).fill(30))).toBe(
      DEFAULT_BLOWOUT_THRESHOLD,
    );
  });

  it("takes the trailing P90 rounded to a five, then onto the half grid", () => {
    // 85 margins at 20, 15 at 60: the P90 (index 89 of 100) sits in the top
    // band. At exactly 90/10 it would land on the last 20, which is correct
    // and is why the split here is deliberate rather than round.
    const margins = [...Array(85).fill(20), ...Array(15).fill(60)];
    const threshold = chooseBlowoutThreshold(margins);
    expect(threshold % 1).toBe(0.5);
    expect(threshold).toBe(60.5);
  });

  it("is likelier with more matchups on the slate", () => {
    const one = priceBlowoutSpecial(
      [{ matchupId: 1, rosterA: "1", rosterB: "2", projA: 120, projB: 90 }],
      40.5,
    );
    const six = priceBlowoutSpecial(
      Array.from({ length: 6 }, (_, i) => ({
        matchupId: i,
        rosterA: `${i}a`,
        rosterB: `${i}b`,
        projA: 120,
        projB: 90,
      })),
      40.5,
    );
    // Shorter (more negative / less positive) odds mean a likelier YES.
    expect(six.overOdds).toBeLessThan(one.overOdds);
  });

  it("never pushes: the threshold is a half-integer", () => {
    expect(gradeBlowout(40.6, 40.5)).toBe("over");
    expect(gradeBlowout(40.4, 40.5)).toBe("under");
  });
});

describe("choosePercentileThreshold", () => {
  it("returns the fallback under the history minimum", () => {
    expect(choosePercentileThreshold([], 0.9, 5, 40.5)).toBe(40.5);
    expect(choosePercentileThreshold(Array(19).fill(30), 0.9, 5, 40.5)).toBe(40.5);
  });

  it("rounds the percentile to the requested multiple", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(choosePercentileThreshold(values, 0.9, 10, 0) % 10).toBe(0);
    expect(choosePercentileThreshold(values, 0.95, 5, 0) % 5).toBe(0);
  });

  it("backs both thresholds, so the two cannot define history differently", () => {
    const scores = Array(100).fill(130);
    expect(chooseCeilingThreshold(scores)).toBe(
      choosePercentileThreshold(scores, 0.95, 10, DEFAULT_CEILING_THRESHOLD),
    );
  });
});

describe("Upset Special", () => {
  it("prices the dog as the dog", () => {
    const price = priceMatchbet(95, 130, SCORE_UNCERTAINTY_SCALE);
    expect(price.overOdds).toBeGreaterThan(0);
    expect(price.underOdds).toBeLessThan(0);
  });

  it("grades the dog winning as YES, and a tie as a push", () => {
    expect(gradeMatchbet(101, 100)).toBe("over");
    expect(gradeMatchbet(99, 100)).toBe("under");
    expect(gradeMatchbet(100, 100)).toBe("push");
  });

  it("names the same matchup the Mercy Line does", () => {
    const pairings = [
      { matchupId: 1, rosterA: "1", rosterB: "2", projA: 100, projB: 98 },
      { matchupId: 2, rosterA: "3", rosterB: "4", projA: 140, projB: 90 },
    ];
    // The dog is the biggest favorite's opponent by construction, which is why
    // the Upset Special reads its subject straight off findBiggestFavorite.
    expect(findBiggestFavorite(pairings)?.dogRosterId).toBe("4");
    expect(findBiggestFavorite(pairings)?.matchupId).toBe(2);
  });
});

describe("composite subject ids", () => {
  it("round-trips a pair", () => {
    expect(parsePairSubject(encodePairSubject("4046", "6794"))).toEqual([
      "4046",
      "6794",
    ]);
    expect(parsePairSubject(encodePairSubject("cold-takes", "war-wagon"))).toEqual([
      "cold-takes",
      "war-wagon",
    ]);
  });

  it("returns null on anything malformed rather than throwing", () => {
    expect(parsePairSubject(null)).toBeNull();
    expect(parsePairSubject("")).toBeNull();
    expect(parsePairSubject("abc")).toBeNull();
    expect(parsePairSubject("a~b~c")).toBeNull();
    expect(parsePairSubject("~b")).toBeNull();
    expect(parsePairSubject("a~")).toBeNull();
  });
});

describe("selectStickySubjects", () => {
  it("keeps a posted subject that fell out of the ranking entirely", () => {
    const chosen = selectStickySubjects(["old"], ["new1", "new2", "new3"], 3);
    expect(chosen[0]).toBe("old");
    expect(chosen).toContain("new1");
    expect(chosen).toHaveLength(3);
  });

  it("only fills up to the target", () => {
    expect(selectStickySubjects(["a", "b", "c"], ["d", "e"], 3)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(selectStickySubjects([], ["d", "e", "f", "g"], 2)).toEqual(["d", "e"]);
  });

  it("is stable across repeated calls once the board is full", () => {
    const first = selectStickySubjects([], ["p1", "p2", "p3", "p4"], 3);
    const second = selectStickySubjects(first, ["p9", "p8", "p7", "p1"], 3);
    const third = selectStickySubjects(second, ["z1", "z2"], 3);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it("never duplicates a subject, even when it is also a candidate", () => {
    const chosen = selectStickySubjects(["a", "a"], ["a", "b"], 3);
    expect(chosen).toEqual(["a", "b"]);
  });

  it("keeps every posted subject even past the target, because picks ride on them", () => {
    const chosen = selectStickySubjects(["a", "b", "c", "d"], ["e"], 2);
    expect(chosen).toEqual(["a", "b", "c", "d"]);
  });
});

describe("expanded presentation", () => {
  it("labels the specials Yes/No and the matchbets by name at read time", () => {
    expect(propSideLabels("upset_special")).toEqual({ over: "Yes", under: "No" });
    expect(propSideLabels("blowout_special")).toEqual({ over: "Yes", under: "No" });
    expect(propSideLabels("player_matchbet")).toEqual({
      over: "Over",
      under: "Under",
    });
  });

  it("prints a matchbet as head to head and a blowout as its threshold", () => {
    expect(formatPropLine("player_matchbet", 0)).toBe("HEAD TO HEAD");
    expect(formatPropLine("franchise_matchbet", 0)).toBe("HEAD TO HEAD");
    expect(formatPropLine("blowout_special", 40.5)).toBe("40.5+");
    expect(formatPropLine("upset_special", 0)).toBe("YES / NO");
    expect(formatPropLine("player_points", 18.5)).toBe("O/U 18.5");
  });

  it("gives every point-based kind a unit and the rest none", () => {
    expect(propLineUnit("player_points")).toBe("PTS");
    expect(propLineUnit("team_total")).toBe("PTS");
    expect(propLineUnit("blowout_special")).toBe("MARGIN");
    expect(propLineUnit("upset_special")).toBeNull();
    expect(propLineUnit("player_matchbet")).toBeNull();
  });

  it("says what actually happened, per kind", () => {
    expect(formatPropActual("league_total", 1204.7, "over")).toBe("Landed 1,204.7");
    expect(formatPropActual("player_points", 18.42, "over")).toBe("Scored 18.4");
    expect(formatPropActual("blowout_special", 51.2, "over")).toBe(
      "Biggest margin 51.2",
    );
    expect(formatPropActual("player_matchbet", -12.4, "under")).toBe(
      "Decided by 12.4",
    );
    expect(formatPropActual("franchise_matchbet", 0, "push")).toBe("Dead even");
    expect(formatPropActual("upset_special", 0, "push")).toBe("Dead even");
  });

  it("derives the section order from the kind registry, every group once", () => {
    expect(PROP_GROUP_ORDER).toEqual(["specials", "players", "teams", "h2h"]);
    expect(new Set(PROP_GROUP_ORDER).size).toBe(PROP_GROUP_ORDER.length);
    // Every kind's group has a section to land in, or its cards vanish.
    for (const kind of Object.keys(PROP_ORDER) as (keyof typeof PROP_ORDER)[]) {
      expect(PROP_GROUP_ORDER).toContain(PROP_GROUP[kind]);
    }
  });

  it("gives the marquee to the League Total and only to it", () => {
    expect(propDisplay("league_total")).toBe("marquee");
    for (const kind of Object.keys(PROP_ORDER) as (keyof typeof PROP_ORDER)[]) {
      if (kind === "league_total") continue;
      expect(propDisplay(kind)).toBe("card");
    }
  });

  it("groups and orders every kind exactly once", () => {
    const kinds = Object.keys(PROP_ORDER) as (keyof typeof PROP_ORDER)[];
    expect(new Set(Object.values(PROP_ORDER)).size).toBe(kinds.length);
    for (const kind of kinds) expect(PROP_GROUP[kind]).toBeTruthy();
    expect(PROP_GROUP.player_points).toBe("players");
    expect(PROP_GROUP.team_total).toBe("teams");
    expect(PROP_GROUP.franchise_matchbet).toBe("h2h");
    expect(PROP_GROUP.upset_special).toBe("specials");
  });
});
