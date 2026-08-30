import { describe, it, expect } from "vitest";
import {
  chooseCeilingThreshold,
  DEFAULT_CEILING_THRESHOLD,
  findBiggestFavorite,
  formatOverUnderLine,
  formatPropLine,
  gradeCeilingWatch,
  gradeLeagueTotal,
  gradeMercyLine,
  priceCeilingWatch,
  priceLeagueTotal,
  priceMercyLine,
  probAnyoneOverThreshold,
  propSideLabels,
  toHalfInteger,
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

describe("priceLeagueTotal / gradeLeagueTotal", () => {
  it("lines the combined projection and never pushes", () => {
    const totals = Array.from({ length: 12 }, (_, i) => 90 + i);
    const price = priceLeagueTotal(totals);
    expect(price.line % 1).toBe(0.5);
    expect(price.overOdds).toBe(-115);
    expect(price.underOdds).toBe(-105);

    expect(gradeLeagueTotal(price.line + 0.1, price.line)).toBe("over");
    expect(gradeLeagueTotal(price.line - 0.1, price.line)).toBe("under");
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
