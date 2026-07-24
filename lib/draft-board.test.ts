import { describe, it, expect } from "vitest";
import { buildDraftBoard, type NormalizedPick } from "./draft-board";

// ---------------------------------------------------------------------------
// Test helpers — build NormalizedPicks with sensible defaults so each test
// only specifies the fields it cares about.
// ---------------------------------------------------------------------------

function pick(overrides: Partial<NormalizedPick> & { pickNumber: number; round: number }): NormalizedPick {
  return {
    playerId: null,
    playerName: null,
    playerPosition: null,
    roster: null,
    currentId: `f${overrides.pickNumber}`,
    currentName: `Team ${overrides.pickNumber}`,
    currentSlug: null,
    currentAbbreviation: null,
    currentBrandingColor: null,
    currentAvatarUrl: null,
    originalId: null,
    originalName: null,
    originalSlug: null,
    originalAbbreviation: null,
    originalBrandingColor: null,
    ...overrides,
  };
}

// Builds a snake draft: `teams` franchises, `rounds` rounds. Each franchise
// owns its own slot in every round (originalId === franchiseId). Even rounds
// reverse pick order, as Sleeper snake drafts do. Returns picks in pickNumber
// order. `trades` remaps a specific (round, originalTeamIdx) slot to a
// different current owner idx, mirroring a traded pick.
function snakeDraft(
  teams: number,
  rounds: number,
  trades: { round: number; originalIdx: number; newOwnerIdx: number }[] = []
): NormalizedPick[] {
  const ids = Array.from({ length: teams }, (_, i) => `f${i}`);
  const names = Array.from({ length: teams }, (_, i) => `Team ${i}`);
  const picks: NormalizedPick[] = [];
  let pickNumber = 0;

  for (let round = 1; round <= rounds; round++) {
    for (let i = 0; i < teams; i++) {
      pickNumber++;
      const originalIdx = round % 2 === 0 ? teams - 1 - i : i;
      const trade = trades.find((t) => t.round === round && t.originalIdx === originalIdx);
      const ownerIdx = trade ? trade.newOwnerIdx : originalIdx;
      picks.push(
        pick({
          pickNumber,
          round,
          currentId: ids[ownerIdx],
          currentName: names[ownerIdx],
          originalId: ids[originalIdx],
          originalName: names[originalIdx],
          playerName: `Player ${pickNumber}`,
        })
      );
    }
  }
  return picks;
}

function placedCount(board: ReturnType<typeof buildDraftBoard>): number {
  let n = 0;
  for (const row of board.grid.values()) {
    for (const cell of row) if (cell) n++;
  }
  return n;
}

function hasCollisionOrLoss(picks: NormalizedPick[], board: ReturnType<typeof buildDraftBoard>): boolean {
  return placedCount(board) !== picks.length;
}

describe("buildDraftBoard", () => {
  it("returns an empty board for no picks", () => {
    const board = buildDraftBoard([]);
    expect(board.rounds).toEqual([]);
    expect(board.columns).toEqual([]);
    expect(board.grid.size).toBe(0);
  });

  it("linear rookie draft with no trades places every pick in its own column", () => {
    // 12 teams, 3 linear rounds; upcoming-style (originalId null, no trades).
    const teams = 12;
    const rounds = 3;
    const picks: NormalizedPick[] = [];
    let pickNumber = 0;
    for (let round = 1; round <= rounds; round++) {
      for (let i = 0; i < teams; i++) {
        pickNumber++;
        picks.push(
          pick({
            pickNumber,
            round,
            currentId: `f${i}`,
            currentName: `Team ${i}`,
          })
        );
      }
    }

    const board = buildDraftBoard(picks);
    expect(board.columns).toHaveLength(teams);
    expect(placedCount(board)).toBe(picks.length);
    // Each column holds exactly one pick per round.
    for (const row of board.grid.values()) {
      expect(row.filter(Boolean)).toHaveLength(teams);
    }
  });

  it("snake startup with even-round reversal keeps each franchise in one column, no collisions", () => {
    const picks = snakeDraft(10, 28);
    const board = buildDraftBoard(picks);

    expect(board.columns).toHaveLength(10);
    expect(placedCount(board)).toBe(picks.length);
    expect(hasCollisionOrLoss(picks, board)).toBe(false);

    // A franchise's column is stable: every one of its untraded picks lands in
    // the same column index across all rounds.
    const colOf = new Map<string, number>();
    board.columns.forEach((c, idx) => colOf.set(c.key, idx));
    for (const [, row] of board.grid) {
      row.forEach((cell, idx) => {
        if (cell) expect(colOf.get(cell.originalId!)).toBe(idx);
      });
    }
  });

  it("regression: a franchise that traded away its round-1 pick still gets its own column and its later untraded picks reconcile to it", () => {
    // Team 0 trades away its round-1 pick to Team 5. Its round-2 pick (and all
    // later untraded picks) must still resolve to Team 0's column — the exact
    // bug in #96 where the column was created under a name-key and the later
    // id-keyed picks collided into fallback columns.
    const picks = snakeDraft(10, 28, [{ round: 1, originalIdx: 0, newOwnerIdx: 5 }]);
    const board = buildDraftBoard(picks);

    expect(board.columns).toHaveLength(10);
    expect(placedCount(board)).toBe(picks.length);

    // Team 0 has a column even though it never made a round-1 pick.
    const team0Col = board.columns.findIndex((c) => c.key === "f0");
    expect(team0Col).toBeGreaterThanOrEqual(0);

    // The round-1 slot for Team 0 shows Team 5 as the maker, "via Team 0".
    const r1 = board.grid.get(1)!;
    const tradedCell = r1[team0Col];
    expect(tradedCell).not.toBeNull();
    expect(tradedCell!.currentId).toBe("f5");
    expect(tradedCell!.originalId).toBe("f0");

    // Team 0's round-2 untraded pick lands in Team 0's column, not a fallback.
    const r2 = board.grid.get(2)!;
    expect(r2[team0Col]!.currentId).toBe("f0");
    expect(r2[team0Col]!.originalId).toBe("f0");
  });

  it("overwrite guard reconciles a colliding pick into an empty column instead of dropping it", () => {
    // Round 1 establishes 3 columns (f0, f1, f2). In round 2 two picks resolve
    // to f0's key (a data anomaly), while f2's slot is missing — leaving an
    // empty column. The guard must place the colliding pick into that empty
    // column rather than overwriting f0's cell and silently losing a pick.
    const picks: NormalizedPick[] = [
      pick({ pickNumber: 1, round: 1, currentId: "f0", originalId: "f0" }),
      pick({ pickNumber: 2, round: 1, currentId: "f1", originalId: "f1" }),
      pick({ pickNumber: 3, round: 1, currentId: "f2", originalId: "f2" }),
      // Round 2: both anomalously claim f0's slot; nothing claims f2's.
      pick({ pickNumber: 4, round: 2, currentId: "f0", originalId: "f0", playerName: "A" }),
      pick({ pickNumber: 5, round: 2, currentId: "f1", originalId: "f1", playerName: "B" }),
      pick({ pickNumber: 6, round: 2, currentId: "f0", originalId: "f0", playerName: "C" }),
    ];
    const board = buildDraftBoard(picks);
    expect(board.columns).toHaveLength(3);
    // All 6 picks placed; none dropped by the collision.
    expect(placedCount(board)).toBe(6);
    const r2Players = board.grid.get(2)!.filter(Boolean).map((c) => c!.playerName).sort();
    expect(r2Players).toEqual(["A", "B", "C"]);
  });
});
