import { describe, it, expect } from "vitest";
import { classifyStarter, decideWeekDisplay } from "./game-status";

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

describe("decideWeekDisplay", () => {
  it("not started (pre_game): shows the projection, flagged", () => {
    expect(decideWeekDisplay("pre_game", 0, 12.4)).toEqual({
      value: 12.4,
      isProjected: true,
    });
  });

  it("in progress: shows actual points (not the projection)", () => {
    expect(decideWeekDisplay("in_game", 8.6, 15)).toEqual({
      value: 8.6,
      isProjected: false,
    });
  });

  it("final: shows actual points", () => {
    expect(decideWeekDisplay("complete", 21.5, 18)).toEqual({
      value: 21.5,
      isProjected: false,
    });
  });

  it("final 0.0: shows 0.0 actual, never the projection", () => {
    expect(decideWeekDisplay("complete", 0, 14.2)).toEqual({
      value: 0,
      isProjected: false,
    });
  });

  it("canceled: treated as played, shows actual points", () => {
    expect(decideWeekDisplay("canceled", 0, 9.9)).toEqual({
      value: 0,
      isProjected: false,
    });
  });

  it("no schedule rows (null status): shows the projection, flagged", () => {
    expect(decideWeekDisplay(null, 0, 11.1)).toEqual({
      value: 11.1,
      isProjected: true,
    });
  });

  it("null status with no projection: falls back to actual points", () => {
    expect(decideWeekDisplay(null, 4.5, null)).toEqual({
      value: 4.5,
      isProjected: false,
    });
  });

  it("played but no actual points recorded: falls back to projection", () => {
    expect(decideWeekDisplay("complete", null, 13.3)).toEqual({
      value: 13.3,
      isProjected: true,
    });
  });

  it("both values null: returns null (cell renders a dash)", () => {
    expect(decideWeekDisplay("pre_game", null, null)).toBeNull();
    expect(decideWeekDisplay("complete", null, null)).toBeNull();
    expect(decideWeekDisplay(null, null, null)).toBeNull();
  });
});
