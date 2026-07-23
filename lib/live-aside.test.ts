import { describe, it, expect } from "vitest";
import { deriveLiveAside, LIVE_ASIDES } from "@/lib/live-aside";

describe("deriveLiveAside", () => {
  it("returns null when nothing interesting is happening (early, close, full rosters)", () => {
    expect(
      deriveLiveAside({
        homeScore: 40,
        awayScore: 38,
        winProbHome: 0.55,
        playersLeft: { home: 6, away: 6 },
      })
    ).toBeNull();
  });

  it("flags a mercy-rule watch: big margin, trailer nearly out of players", () => {
    expect(
      deriveLiveAside({
        homeScore: 120,
        awayScore: 80,
        winProbHome: 0.99,
        playersLeft: { home: 1, away: 1 },
      })
    ).toBe(LIVE_ASIDES.MERCY_WATCH);
  });

  it("flags a dead man walking: trailer out of players and no chance", () => {
    expect(
      deriveLiveAside({
        homeScore: 95,
        awayScore: 88,
        winProbHome: 0.97,
        playersLeft: { home: 2, away: 0 },
      })
    ).toBe(LIVE_ASIDES.DEAD_MAN);
  });

  it("does NOT call it dead man walking while the trailer still has a puncher's chance", () => {
    // Trailer out of players but prob above the longshot floor.
    expect(
      deriveLiveAside({
        homeScore: 90,
        awayScore: 89,
        winProbHome: 0.85,
        playersLeft: { home: 3, away: 0 },
      })
    ).toBeNull();
  });

  it("flags a comeback brewing: trailer down but projects back with leader nearly done", () => {
    expect(
      deriveLiveAside({
        homeScore: 70,
        awayScore: 55, // away trails by 15
        winProbHome: 0.4, // away (trailer) favored at 0.6
        playersLeft: { home: 0, away: 4 },
      })
    ).toBe(LIVE_ASIDES.COMEBACK);
  });

  it("prefers the comeback line over mercy watch when both structurally overlap", () => {
    // Comeback is checked first because it is the more specific, live story.
    expect(
      deriveLiveAside({
        homeScore: 100,
        awayScore: 68, // 32-point margin would satisfy mercy margin
        winProbHome: 0.35, // but away is projected back
        playersLeft: { home: 1, away: 5 },
      })
    ).toBe(LIVE_ASIDES.COMEBACK);
  });

  it("flags a late coin flip: near 50/50 with little left", () => {
    expect(
      deriveLiveAside({
        homeScore: 110,
        awayScore: 108,
        winProbHome: 0.52,
        playersLeft: { home: 1, away: 1 },
      })
    ).toBe(LIVE_ASIDES.COIN_FLIP);
  });

  it("does not call a coin flip when plenty of football remains", () => {
    expect(
      deriveLiveAside({
        homeScore: 40,
        awayScore: 39,
        winProbHome: 0.5,
        playersLeft: { home: 5, away: 5 },
      })
    ).toBeNull();
  });

  it("is deterministic and symmetric regardless of which side leads", () => {
    const homeBlowout = deriveLiveAside({
      homeScore: 130,
      awayScore: 90,
      winProbHome: 0.99,
      playersLeft: { home: 0, away: 2 },
    });
    const awayBlowout = deriveLiveAside({
      homeScore: 90,
      awayScore: 130,
      winProbHome: 0.01,
      playersLeft: { home: 2, away: 0 },
    });
    expect(homeBlowout).toBe(LIVE_ASIDES.MERCY_WATCH);
    expect(awayBlowout).toBe(LIVE_ASIDES.MERCY_WATCH);
  });
});
