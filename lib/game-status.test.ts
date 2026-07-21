import { describe, it, expect } from "vitest";
import { classifyStarter } from "./game-status";

describe("classifyStarter", () => {
  it("pre_game: yet to play, full projection remains", () => {
    expect(classifyStarter("pre_game", 0, 14.2)).toEqual({
      yetToPlay: true,
      projRemaining: 14.2,
    });
  });

  it("pre_game with null projection: yet to play, 0 remaining", () => {
    expect(classifyStarter("pre_game", 0, null)).toEqual({
      yetToPlay: true,
      projRemaining: 0,
    });
  });

  it("complete: has played, nothing remains", () => {
    expect(classifyStarter("complete", 21.5, 18)).toEqual({
      yetToPlay: false,
      projRemaining: 0,
    });
  });

  it("complete 0.0 finisher: counts as having played (the directive case)", () => {
    expect(classifyStarter("complete", 0, 12.3)).toEqual({
      yetToPlay: false,
      projRemaining: 0,
    });
  });

  it("canceled: has played (nothing left to come), nothing remains", () => {
    expect(classifyStarter("canceled", 0, 9.9)).toEqual({
      yetToPlay: false,
      projRemaining: 0,
    });
  });

  it("in-game status: playing now, remaining is projection above current points", () => {
    expect(classifyStarter("in_game", 6, 15)).toEqual({
      yetToPlay: false,
      projRemaining: 9,
    });
  });

  it("in-game status where points exceed projection: clamps remaining at 0", () => {
    expect(classifyStarter("in_game", 20, 15)).toEqual({
      yetToPlay: false,
      projRemaining: 0,
    });
  });

  it("in-game status with null projection: nothing remains", () => {
    expect(classifyStarter("in_game", 4, null)).toEqual({
      yetToPlay: false,
      projRemaining: 0,
    });
  });

  it("null status (no game found, e.g. bye): not playing, nothing remains", () => {
    expect(classifyStarter(null, 0, 11)).toEqual({
      yetToPlay: false,
      projRemaining: 0,
    });
  });

  it("undefined status: not playing, nothing remains", () => {
    expect(classifyStarter(undefined, 0, 11)).toEqual({
      yetToPlay: false,
      projRemaining: 0,
    });
  });
});
