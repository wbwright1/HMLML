import { describe, it, expect } from "vitest";
import { buildRosterSlotRows } from "./roster-slots";

describe("buildRosterSlotRows", () => {
  it("assigns starter, bench, ir and taxi from a full Sleeper roster", () => {
    const rows = buildRosterSlotRows({
      starters: ["1", "2"],
      players: ["1", "2", "3", "4", "5"],
      reserve: ["4"],
      taxi: ["5"],
    });

    expect(rows).toEqual([
      { playerId: "1", slot: "starter" },
      { playerId: "2", slot: "starter" },
      { playerId: "3", slot: "bench" },
      { playerId: "4", slot: "ir" },
      { playerId: "5", slot: "taxi" },
    ]);
  });

  it("gives starters precedence over the bench pass", () => {
    const rows = buildRosterSlotRows({
      starters: ["1"],
      players: ["1"],
    });
    expect(rows).toEqual([{ playerId: "1", slot: "starter" }]);
  });

  it("keeps ir and taxi off the bench even though players lists them", () => {
    const rows = buildRosterSlotRows({
      starters: [],
      players: ["7", "8"],
      reserve: ["7"],
      taxi: ["8"],
    });
    expect(rows.filter((r) => r.slot === "bench")).toEqual([]);
    expect(rows).toEqual([
      { playerId: "7", slot: "ir" },
      { playerId: "8", slot: "taxi" },
    ]);
  });

  it("handles null and missing arrays", () => {
    expect(buildRosterSlotRows({})).toEqual([]);
    expect(
      buildRosterSlotRows({
        starters: null,
        players: ["9"],
        reserve: null,
        taxi: null,
      })
    ).toEqual([{ playerId: "9", slot: "bench" }]);
  });

  it('drops Sleeper\'s "0" empty-slot placeholder from every array', () => {
    const rows = buildRosterSlotRows({
      starters: ["1", "0", "2"],
      players: ["1", "2", "0", "3"],
      reserve: ["0"],
      taxi: ["0"],
    });
    expect(rows.map((r) => r.playerId)).toEqual(["1", "2", "3"]);
    expect(rows.some((r) => r.playerId === "0")).toBe(false);
  });

  it("emits one row per roster slot with no duplicates", () => {
    const rows = buildRosterSlotRows({
      starters: ["a", "b"],
      players: ["a", "b", "c", "d"],
      reserve: ["c"],
      taxi: ["d"],
    });
    expect(new Set(rows.map((r) => r.playerId)).size).toBe(rows.length);
  });
});
