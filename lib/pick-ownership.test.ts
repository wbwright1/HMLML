import { describe, expect, it } from "vitest";
import { ownerOf, pickKey, resolvePickOwners, type PickMove } from "@/lib/pick-ownership";

const move = (round: number, rosterId: number, ownerId: number, at: number, season = "2027"): PickMove => ({
  season,
  round,
  rosterId,
  ownerId,
  at,
});

describe("resolvePickOwners", () => {
  it("keeps untraded picks with their original roster", () => {
    const owners = resolvePickOwners([], 2027);
    expect(ownerOf(owners, 1, 4)).toBe(4);
  });

  it("follows a pick through several trades, oldest first", () => {
    // Roster 11's 2nd-rounder: 11 -> 1, then 1 -> 5 (given out of order).
    const owners = resolvePickOwners([move(2, 11, 5, 300), move(2, 11, 1, 100)], "2027");
    expect(ownerOf(owners, 2, 11)).toBe(5);
  });

  it("only reads the requested draft season", () => {
    const owners = resolvePickOwners(
      [move(1, 4, 3, 100, "2028"), move(1, 12, 3, 200, "2027")],
      2027,
    );
    expect(ownerOf(owners, 1, 4)).toBe(4);
    expect(ownerOf(owners, 1, 12)).toBe(3);
  });

  it("keeps rounds separate for the same original roster", () => {
    const owners = resolvePickOwners([move(1, 1, 2, 100), move(3, 1, 6, 200)], 2027);
    expect(ownerOf(owners, 1, 1)).toBe(2);
    expect(ownerOf(owners, 2, 1)).toBe(1);
    expect(ownerOf(owners, 3, 1)).toBe(6);
  });

  it("returns a pick traded back home to its original roster", () => {
    const owners = resolvePickOwners([move(1, 7, 9, 100), move(1, 7, 7, 200)], 2027);
    expect(owners.get(pickKey(1, 7))).toBe(7);
    expect(ownerOf(owners, 1, 7)).toBe(7);
  });
});
