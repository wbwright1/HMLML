import { describe, it, expect } from "vitest";
import {
  americanOdds,
  awaySpread,
  coverSide,
  formatMoney,
  formatMoneyline,
  formatSpread,
  MIN_FAVORITE_ODDS,
  MIN_UNDERDOG_ODDS,
  pay,
  payoutLabel,
  priceGame,
  priceSpread,
} from "./pricing";

describe("priceSpread", () => {
  it("gives the favored home side a negative number", () => {
    expect(priceSpread(120, 100)).toBe(-20);
  });

  it("gives the underdog home side a positive number", () => {
    expect(priceSpread(100, 112)).toBe(12);
  });

  it("rounds to the nearest half point", () => {
    expect(priceSpread(110.3, 106.9)).toBe(-3.5);
    expect(priceSpread(100.1, 100.9)).toBe(1);
    expect(priceSpread(100, 103.24)).toBe(3);
    expect(priceSpread(100, 103.26)).toBe(3.5);
  });

  it("never returns exactly zero, so a push is impossible", () => {
    expect(priceSpread(100, 100)).toBe(-0.5);
    expect(priceSpread(100.2, 100.1)).toBe(-0.5);
    expect(priceSpread(100.1, 100.2)).toBe(-0.5);
  });

  it("always lands on a half-point multiple", () => {
    for (let i = 0; i < 200; i++) {
      const home = 60 + i * 0.37;
      const away = 95 + i * 0.11;
      const spread = priceSpread(home, away);
      expect(Number.isInteger(spread * 2)).toBe(true);
      expect(spread).not.toBe(0);
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

  it("resolves the closest possible game, because the spread is never zero", () => {
    expect(coverSide(100, 100, -0.5)).toBe("away");
    expect(coverSide(100.5, 100, -0.5)).toBe("away");
    expect(coverSide(101, 100, -0.5)).toBe("home");
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
