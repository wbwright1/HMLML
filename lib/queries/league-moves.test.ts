import { describe, it, expect } from "vitest";
import {
  selectLeagueMoves,
  formatMoveAge,
  type MoveFranchise,
  type MovePlayer,
  type TransactionRow,
} from "./league-moves";

const NOW = Date.UTC(2026, 8, 1, 12, 0, 0);
const HOUR = 3_600_000;

function franchise(id: string, name: string): MoveFranchise {
  return {
    id,
    name,
    slug: id,
    abbreviation: id.toUpperCase(),
    brandingColor: "#E2B858",
    avatarUrl: null,
  };
}

const franchiseByRoster = new Map<string, MoveFranchise>([
  ["1", franchise("mccarthyism", "McCarthyism")],
  ["2", franchise("vanilla-vick", "Vanilla Vick")],
]);

function player(id: string, name: string, position: string, nflTeam: string): MovePlayer {
  return { id, name, position, nflTeam };
}

const playerById = new Map<string, MovePlayer>([
  ["p1", player("p1", "Ja'Marr Chase", "WR", "CIN")],
  ["p2", player("p2", "Bijan Robinson", "RB", "ATL")],
  ["p3", player("p3", "Puka Nacua", "WR", "LAR")],
]);

function txn(overrides: Partial<TransactionRow> & Pick<TransactionRow, "transactionId">): TransactionRow {
  return {
    type: "free_agent",
    status: "complete",
    adds: null,
    drops: null,
    rosterIds: null,
    createdAtSleeper: NOW - HOUR,
    ...overrides,
  };
}

function select(rows: TransactionRow[], limit = 4) {
  return selectLeagueMoves(rows, franchiseByRoster, playerById, { limit, now: NOW });
}

describe("selectLeagueMoves", () => {
  it("returns [] with no rows", () => {
    expect(select([])).toEqual([]);
  });

  it("labels an add and names the adding franchise, headlining the added player", () => {
    const [move] = select([txn({ transactionId: "t1", adds: { p1: 1 } })]);
    expect(move.kind).toBe("ADD");
    expect(move.franchises.map((f) => f.name)).toEqual(["McCarthyism"]);
    expect(move.headline).toEqual(player("p1", "Ja'Marr Chase", "WR", "CIN"));
    expect(move.support).toBe("");
    expect(move.age).toBe("1h ago");
  });

  it("folds a same-transaction drop into the support line", () => {
    const [move] = select([
      txn({ transactionId: "t1", adds: { p1: 1 }, drops: { p2: 1 } }),
    ]);
    expect(move.kind).toBe("ADD");
    expect(move.headline.name).toBe("Ja'Marr Chase");
    expect(move.support).toBe("Dropped Bijan Robinson");
  });

  it("labels a drop-only transaction DROP and headlines the dropped player", () => {
    const [move] = select([txn({ transactionId: "t1", drops: { p3: 2 } })]);
    expect(move.kind).toBe("DROP");
    expect(move.franchises.map((f) => f.name)).toEqual(["Vanilla Vick"]);
    expect(move.headline.name).toBe("Puka Nacua");
    expect(move.support).toBe("");
  });

  it("names both sides of a trade and headlines the first acquired player", () => {
    const [move] = select([
      txn({
        transactionId: "t1",
        type: "trade",
        rosterIds: [1, 2],
        adds: { p1: 2, p2: 1 },
      }),
    ]);
    expect(move.kind).toBe("TRADE");
    expect(move.franchises.map((f) => f.name)).toEqual([
      "McCarthyism",
      "Vanilla Vick",
    ]);
    expect(move.headline.name).toBe("Ja'Marr Chase");
    expect(move.support).toBe("Bijan Robinson");
  });

  it("says so when a trade moved only picks, with a null-id headline", () => {
    const [move] = select([
      txn({ transactionId: "t1", type: "trade", rosterIds: [1, 2] }),
    ]);
    expect(move.headline).toEqual({
      id: null,
      name: "a player",
      position: null,
      nflTeam: null,
    });
    expect(move.support).toBe("Draft picks only");
  });

  it("drops a failed waiver claim", () => {
    const moves = select([
      txn({ transactionId: "t1", status: "failed", adds: { p1: 1 } }),
      txn({ transactionId: "t2", adds: { p2: 1 } }),
    ]);
    expect(moves.map((m) => m.transactionId)).toEqual(["t2"]);
  });

  it("drops a row whose roster maps to no franchise", () => {
    expect(select([txn({ transactionId: "t1", adds: { p1: 99 } })])).toEqual([]);
  });

  it("drops a row that names no players at all", () => {
    expect(
      select([txn({ transactionId: "t1", type: "commissioner", rosterIds: [1] })])
    ).toEqual([]);
  });

  it("collapses more than two support names onto one line", () => {
    const [move] = select([
      txn({ transactionId: "t1", adds: { p1: 1, p2: 1, p3: 1 } }),
    ]);
    expect(move.headline.name).toBe("Ja'Marr Chase");
    expect(move.support).toBe("Bijan Robinson, Puka Nacua");
  });

  it("falls back to a null-id headline for an unsynced player id", () => {
    const [move] = select([txn({ transactionId: "t1", adds: { unknown: 1 } })]);
    expect(move.headline).toEqual({
      id: null,
      name: "a player",
      position: null,
      nflTeam: null,
    });
  });

  it("honors the limit and keeps the newest-first order it was given", () => {
    const moves = select(
      [
        txn({ transactionId: "t1", adds: { p1: 1 } }),
        txn({ transactionId: "t2", adds: { p2: 1 } }),
        txn({ transactionId: "t3", adds: { p3: 1 } }),
      ],
      2
    );
    expect(moves.map((m) => m.transactionId)).toEqual(["t1", "t2"]);
  });
});

describe("formatMoveAge", () => {
  it("prints days", () => {
    expect(formatMoveAge(NOW - 2 * 24 * HOUR, NOW)).toBe("2d ago");
  });

  it("prints minutes", () => {
    expect(formatMoveAge(NOW - 40 * 60_000, NOW)).toBe("40m ago");
  });

  it("prints 'just now' inside the first minute", () => {
    expect(formatMoveAge(NOW - 5_000, NOW)).toBe("just now");
  });

  it("prints nothing without a timestamp", () => {
    expect(formatMoveAge(null, NOW)).toBe("");
  });
});
