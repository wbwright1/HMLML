import { describe, it, expect } from "vitest";
import {
  americanOdds,
  awaySpread,
  coverSide,
  formatMoney,
  formatMoneyline,
  formatSpread,
  gradePick,
  pickCovered,
  MIN_FAVORITE_ODDS,
  MIN_UNDERDOG_ODDS,
  pay,
  payoutLabel,
  priceGame,
  priceSpread,
} from "./pricing";

describe("priceSpread", () => {
  it("gives the favored home side a negative number", () => {
    expect(priceSpread(120, 100)).toBe(-20.5);
  });

  it("gives the underdog home side a positive number", () => {
    expect(priceSpread(100, 112)).toBe(12.5);
  });

  it("rounds to the nearest half-integer", () => {
    expect(priceSpread(110.3, 106.9)).toBe(-3.5);
    expect(priceSpread(100.1, 100.9)).toBe(0.5);
    expect(priceSpread(100, 102.4)).toBe(2.5);
    expect(priceSpread(100, 103.1)).toBe(3.5);
    expect(priceSpread(100, 103.9)).toBe(3.5);
    expect(priceSpread(100, 104.2)).toBe(4.5);
  });

  it("never distorts the projected margin by more than half a point", () => {
    for (let i = 0; i < 500; i++) {
      const away = 100 + i * 0.137;
      const raw = away - 100;
      if (raw === 0) continue;
      expect(Math.abs(priceSpread(100, away) - raw)).toBeLessThanOrEqual(0.5);
    }
  });

  it("never returns exactly zero, and keeps the sign of the projection", () => {
    // A dead heat has no favorite, so the half point goes to the nominal home
    // side. The barely-separated cases keep whichever side actually projects
    // ahead rather than collapsing both to the same line.
    expect(priceSpread(100, 100)).toBe(-0.5);
    expect(priceSpread(100.2, 100.1)).toBe(-0.5);
    expect(priceSpread(100.1, 100.2)).toBe(0.5);
  });

  it("always carries a hook, never a whole number", () => {
    // The bug this pins: rounding to the nearest 0.5 lands on a whole number
    // half the time (-18, +3), and a whole-number spread CAN be landed on
    // exactly, which is a push, which nothing downstream can grade.
    expect(priceSpread(120, 100)).toBe(-20.5);
    expect(priceSpread(100, 112)).toBe(12.5);
    expect(priceSpread(100, 103)).toBe(3.5);
  });

  it("hooks a whole-number margin rather than posting a tieable line", () => {
    expect(priceSpread(103, 100)).toBe(-3.5);
    expect(priceSpread(100, 103)).toBe(3.5);
  });

  it("emits a half-point spread across a wide sweep of real projections", () => {
    for (let home = 60; home <= 200; home += 0.25) {
      for (const away of [72, 99.5, 118.3, 140, 175.75]) {
        const spread = priceSpread(home, away);
        expect(Number.isInteger(spread)).toBe(false);
        expect(Number.isInteger(spread * 2)).toBe(true);
        expect(spread).not.toBe(0);
      }
    }
  });

  it("mirrors under a side swap everywhere except a dead heat", () => {
    for (let i = 0; i < 300; i++) {
      const home = 70 + i * 0.31;
      const away = 130 - i * 0.17;
      if (home === away) continue;
      expect(priceSpread(home, away)).toBe(-priceSpread(away, home));
    }
  });
});

describe("americanOdds", () => {
  it("prices a coin flip at the house minimum on both sides", () => {
    expect(americanOdds(0.5)).toBe(-110);
  });

  it("prices favorites negative and underdogs positive", () => {
    expect(americanOdds(0.7)).toBeLessThan(0);
    expect(americanOdds(0.3)).toBeGreaterThan(0);
  });

  it("never posts a favorite lighter than the floor", () => {
    for (let p = 0.5; p <= 0.99; p += 0.001) {
      const odds = americanOdds(p);
      if (odds < 0) expect(odds).toBeLessThanOrEqual(MIN_FAVORITE_ODDS);
    }
  });

  it("never posts an underdog shorter than even money", () => {
    for (let p = 0.01; p < 0.5; p += 0.001) {
      const odds = americanOdds(p);
      if (odds > 0) expect(odds).toBeGreaterThanOrEqual(MIN_UNDERDOG_ODDS);
    }
  });

  it("rounds to the nearest 5", () => {
    for (let p = 0.05; p <= 0.95; p += 0.01) {
      expect(Math.abs(americanOdds(p) % 5)).toBe(0);
    }
  });

  it("survives the extremes the win-probability model can produce", () => {
    expect(Number.isFinite(americanOdds(0.99))).toBe(true);
    expect(Number.isFinite(americanOdds(0.01))).toBe(true);
    expect(americanOdds(0.99)).toBeLessThan(0);
    expect(americanOdds(0.01)).toBeGreaterThan(0);
  });

  it("holds the board inside the house limits, so no four-digit favorite posts", () => {
    expect(americanOdds(0.999)).toBe(-1900);
    expect(americanOdds(0.001)).toBe(1900);
    for (let p = 0; p <= 1; p += 0.005) {
      expect(Math.abs(americanOdds(p))).toBeLessThanOrEqual(1900);
    }
  });

  it("takes the house cut: both sides of a game imply more than 100%", () => {
    const homeProb = 0.62;
    const mlHome = americanOdds(homeProb);
    const mlAway = americanOdds(1 - homeProb);
    const implied = (ml: number) =>
      ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100);
    expect(implied(mlHome) + implied(mlAway)).toBeGreaterThan(1);
  });
});

describe("priceGame", () => {
  it("makes the higher-projected side the favorite on both spread and moneyline", () => {
    const price = priceGame(124.5, 101.2);
    expect(price.spread).toBeLessThan(0);
    expect(price.mlHome).toBeLessThan(0);
    expect(price.mlAway).toBeGreaterThan(0);
    expect(price.homeWinProb).toBeGreaterThan(0.5);
  });

  it("mirrors when the sides swap", () => {
    const a = priceGame(101.2, 124.5);
    const b = priceGame(124.5, 101.2);
    expect(a.spread).toBe(-b.spread);
    expect(a.mlHome).toBe(b.mlAway);
    expect(a.mlAway).toBe(b.mlHome);
  });

  it("prices two identical projections as a near coin flip with no push", () => {
    const price = priceGame(112.4, 112.4);
    expect(price.spread).toBe(-0.5);
    expect(price.mlHome).toBe(-110);
    expect(price.mlAway).toBe(-110);
  });
});

describe("pay", () => {
  it("matches the design's favorite math", () => {
    expect(pay(-110, 10)).toBeCloseTo(9.0909, 4);
    expect(pay(-165, 10)).toBeCloseTo(6.0606, 4);
    expect(pay(-650, 10)).toBeCloseTo(1.5385, 4);
  });

  it("matches the design's underdog math", () => {
    expect(pay(140, 10)).toBeCloseTo(14, 6);
    expect(pay(430, 10)).toBeCloseTo(43, 6);
    expect(pay(118, 25)).toBeCloseTo(29.5, 6);
  });

  it("scales linearly with the stake", () => {
    expect(pay(-135, 20)).toBeCloseTo(pay(-135, 10) * 2, 10);
  });
});

describe("coverSide", () => {
  it("covers home when the margin beats the spread it gives up", () => {
    expect(coverSide(120, 110, -3.5)).toBe("home");
    expect(coverSide(120, 118, -3.5)).toBe("away");
  });

  it("covers home when the underdog home side loses inside the number", () => {
    expect(coverSide(100, 102, 3.5)).toBe("home");
    expect(coverSide(100, 106, 3.5)).toBe("away");
  });

  it("resolves the closest possible game", () => {
    expect(coverSide(100, 100, -0.5)).toBe("away");
    expect(coverSide(101, 100, -0.5)).toBe("home");
  });

  it("reports a push instead of miscrediting a cover", () => {
    // The hook kills the common push (a whole-number margin against a
    // whole-number line) but not every one: fantasy scores are decimal, so a
    // margin of exactly 0.5 against a -0.5 line lands on zero. Reachable, so it
    // is graded honestly rather than handed to the away side.
    expect(coverSide(100.5, 100, -0.5)).toBe("push");
    expect(coverSide(113.5, 110, -3.5)).toBe("push");
    expect(coverSide(110, 107, -3)).toBe("push");
  });

  it("kills the whole-number push the hook exists to prevent", () => {
    // Every whole-number margin against a priced line resolves, which is what
    // the half-integer spread buys. Only exact half-point margins can still tie.
    for (const away of [95, 118.5, 133, 141.25]) {
      const spread = priceSpread(112, away);
      for (let margin = -40; margin <= 40; margin += 1) {
        expect(coverSide(110 + margin, 110, spread)).not.toBe("push");
      }
    }
  });
});

describe("gradePick", () => {
  const pick = { side: "home" as const, spreadAtPick: -3.5 };

  it("grades against the pick's own snapshotted line", () => {
    expect(gradePick(120, 110, pick)).toBe("home");
    expect(gradePick(113, 110, pick)).toBe("away");
  });

  it("ignores where the line moved to after the pick was booked", () => {
    // The bug this pins: the board's cover was computed from the CURRENT line
    // and reused as the member's result, so an hourly reprice could flip
    // somebody's already-booked pick from a win to a loss. Here the game's
    // line drifted from -3.5 to -9.5; the pick still grades on -3.5.
    const gameLineNow = -12.5;
    expect(coverSide(120, 110, gameLineNow)).toBe("away");
    expect(gradePick(120, 110, pick)).toBe("home");
  });

  it("grades an away pick on the mirrored number", () => {
    const away = { side: "away" as const, spreadAtPick: -3.5 };
    expect(gradePick(113, 110, away)).toBe("away");
    expect(gradePick(120, 110, away)).toBe("home");
  });

  it("pickCovered is true only when the pick's own side came in", () => {
    expect(pickCovered(120, 110, pick)).toBe(true);
    expect(pickCovered(113, 110, pick)).toBe(false);
  });
});

describe("formatting", () => {
  it("signs spreads on both sides and never renders a bare number", () => {
    expect(formatSpread(-3.5)).toBe("-3.5");
    expect(formatSpread(3.5)).toBe("+3.5");
    expect(formatSpread(-0.5)).toBe("-0.5");
    expect(formatSpread(7)).toBe("+7");
    expect(formatSpread(-7)).toBe("-7");
  });

  it("mirrors the spread for the away side", () => {
    expect(awaySpread(-3.5)).toBe(3.5);
    expect(formatSpread(awaySpread(-3.5))).toBe("+3.5");
  });

  it("signs moneylines", () => {
    expect(formatMoneyline(-165)).toBe("-165");
    expect(formatMoneyline(140)).toBe("+140");
  });

  it("renders money to the cent", () => {
    expect(formatMoney(9.0909)).toBe("$9.09");
    expect(formatMoney(14)).toBe("$14.00");
  });

  it("builds the payout label the board shows", () => {
    expect(payoutLabel(-110, 10)).toBe("$10 wins $9.09");
    expect(payoutLabel(140, 10)).toBe("$10 wins $14.00");
  });
});
