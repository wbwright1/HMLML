import { describe, it, expect } from "vitest";
import {
  buildOffseasonMoves,
  type DraftPickRow,
  type FranchiseRef,
} from "./offseason-moves";
import type { Trade } from "@/lib/queries/trades";

const FRANCHISES: FranchiseRef[] = [
  { id: "f1", slug: "foopus", name: "Foopus" },
  { id: "f2", slug: "olave-garden", name: "Olave Garden" },
  { id: "f3", slug: "team-c", name: "Team C" },
];

function draftRow(
  franchiseId: string,
  playerId: string,
  playerName: string,
  position: string,
  round: number,
  pickNumber: number,
): DraftPickRow {
  return { franchiseId, playerId, playerName, position, round, pickNumber };
}

describe("buildOffseasonMoves", () => {
  it("groups drafted players per franchise sorted by pickNumber ascending", () => {
    const rows = [
      draftRow("f1", "p3", "Late Round Guy", "TE", 3, 30),
      draftRow("f1", "p1", "First Pick Guy", "QB", 1, 1),
      draftRow("f1", "p2", "Second Pick Guy", "RB", 2, 13),
    ];
    const moves = buildOffseasonMoves(rows, [], new Map(), FRANCHISES);
    const f1 = moves.find((m) => m.slug === "foopus")!;
    expect(f1.draftedPlayers.map((p) => p.pickNumber)).toEqual([1, 13, 30]);
    expect(f1.draftedPlayers[0].playerName).toBe("First Pick Guy");
    expect(f1.draftedPlayers[0].position).toBe("QB");
  });

  it("joins projections by playerId, gated on the caller-supplied projByPlayerId map", () => {
    const rows = [draftRow("f1", "p1", "Guy One", "QB", 1, 1)];
    const proj = new Map([["p1", 305.4]]);
    const moves = buildOffseasonMoves(rows, [], proj, FRANCHISES);
    const f1 = moves.find((m) => m.slug === "foopus")!;
    expect(f1.draftedPlayers[0].projectedPoints).toBe(305.4);
  });

  it("leaves projectedPoints null when no projection exists for the player", () => {
    const rows = [draftRow("f1", "p1", "Guy One", "QB", 1, 1)];
    const moves = buildOffseasonMoves(rows, [], new Map(), FRANCHISES);
    expect(moves.find((m) => m.slug === "foopus")!.draftedPlayers[0].projectedPoints).toBeNull();
  });

  it("ignores draft rows with no franchiseId", () => {
    const rows = [draftRow("", "p1", "Guy One", "QB", 1, 1)];
    rows[0].franchiseId = null;
    const moves = buildOffseasonMoves(rows, [], new Map(), FRANCHISES);
    expect(moves.every((m) => m.draftedPlayers.length === 0)).toBe(true);
  });

  it("builds acquired/surrendered for a 2-team trade from each side's perspective", () => {
    const trade: Trade = {
      id: 1,
      seasonYear: 2026,
      date: "Mar 1, 2026",
      week: null,
      sides: [
        {
          franchise: { id: "f1", name: "Foopus", slug: "foopus" },
          rosterId: "1",
          players: [{ id: "wr1", name: "Big Receiver", position: "WR", nflTeam: "KC" }],
          picks: [{ season: "2027", round: 1, originalFranchise: null, became: null }],
        },
        {
          franchise: { id: "f2", name: "Olave Garden", slug: "olave-garden" },
          rosterId: "2",
          players: [{ id: "rb1", name: "Solid Runner", position: "RB", nflTeam: "SF" }],
          picks: [],
        },
      ],
    };
    const moves = buildOffseasonMoves([], [trade], new Map(), FRANCHISES);
    const f1 = moves.find((m) => m.slug === "foopus")!;
    const f2 = moves.find((m) => m.slug === "olave-garden")!;

    expect(f1.trades[0].acquired.players).toEqual(["Big Receiver"]);
    expect(f1.trades[0].surrendered.players).toEqual(["Solid Runner"]);
    // f1's trade side carries the pick it RECEIVED in the deal.
    expect(f1.trades[0].acquired.picks).toEqual(["2027 Round 1"]);
    expect(f1.trades[0].surrendered.picks).toEqual([]);

    expect(f2.trades[0].acquired.players).toEqual(["Solid Runner"]);
    expect(f2.trades[0].surrendered.players).toEqual(["Big Receiver"]);
    expect(f2.trades[0].surrendered.picks).toEqual(["2027 Round 1"]);
  });

  it("builds surrendered as the UNION of the other two sides in a 3-team trade", () => {
    const trade: Trade = {
      id: 2,
      seasonYear: 2026,
      date: "Mar 2, 2026",
      week: null,
      sides: [
        {
          franchise: { id: "f1", name: "Foopus", slug: "foopus" },
          rosterId: "1",
          players: [{ id: "a", name: "Player A", position: "QB", nflTeam: null }],
          picks: [],
        },
        {
          franchise: { id: "f2", name: "Olave Garden", slug: "olave-garden" },
          rosterId: "2",
          players: [{ id: "b", name: "Player B", position: "RB", nflTeam: null }],
          picks: [{ season: "2026", round: 2, originalFranchise: null, became: null }],
        },
        {
          franchise: { id: "f3", name: "Team C", slug: "team-c" },
          rosterId: "3",
          players: [{ id: "c", name: "Player C", position: "WR", nflTeam: null }],
          picks: [],
        },
      ],
    };
    const moves = buildOffseasonMoves([], [trade], new Map(), FRANCHISES);
    const f1 = moves.find((m) => m.slug === "foopus")!;
    expect(f1.trades[0].acquired.players).toEqual(["Player A"]);
    expect(f1.trades[0].surrendered.players.sort()).toEqual(["Player B", "Player C"].sort());
    expect(f1.trades[0].surrendered.picks).toEqual(["2026 Round 2"]);
  });

  it("returns empty draftedPlayers/trades arrays for a franchise with no offseason activity", () => {
    const moves = buildOffseasonMoves([], [], new Map(), FRANCHISES);
    for (const m of moves) {
      expect(m.draftedPlayers).toEqual([]);
      expect(m.trades).toEqual([]);
    }
  });

  it("ignores trade sides whose franchise is null (unresolved roster)", () => {
    const trade: Trade = {
      id: 3,
      seasonYear: 2026,
      date: "Mar 3, 2026",
      week: null,
      sides: [
        {
          franchise: null,
          rosterId: "99",
          players: [{ id: "z", name: "Ghost Player", position: "QB", nflTeam: null }],
          picks: [],
        },
        {
          franchise: { id: "f1", name: "Foopus", slug: "foopus" },
          rosterId: "1",
          players: [],
          picks: [],
        },
      ],
    };
    const moves = buildOffseasonMoves([], [trade], new Map(), FRANCHISES);
    const f1 = moves.find((m) => m.slug === "foopus")!;
    expect(f1.trades[0].surrendered.players).toEqual(["Ghost Player"]);
  });
});
