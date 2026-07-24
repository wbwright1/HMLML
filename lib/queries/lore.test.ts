import { describe, it, expect } from "vitest";
import { dedupePieces } from "@/lib/queries/lore";

interface Candidate {
  playerId: string;
  value: number;
}

function candidate(playerId: string, value = 0): Candidate {
  return { playerId, value };
}

describe("dedupePieces", () => {
  it("picks the top candidate from each list when nothing is claimed", () => {
    const [a, b] = dedupePieces(
      [],
      [candidate("p1"), candidate("p2")],
      [candidate("p3"), candidate("p4")],
    );
    expect(a?.playerId).toBe("p1");
    expect(b?.playerId).toBe("p3");
  });

  it("skips a candidate already claimed by a fixed card", () => {
    const [a] = dedupePieces(["p1"], [candidate("p1"), candidate("p2")]);
    expect(a?.playerId).toBe("p2");
  });

  it("claims sequentially: a later list skips a player an earlier list just picked", () => {
    const [a, b] = dedupePieces(
      [],
      [candidate("shared"), candidate("p2")],
      [candidate("shared"), candidate("p4")],
    );
    expect(a?.playerId).toBe("shared");
    expect(b?.playerId).toBe("p4");
  });

  it("returns null when every candidate in a list is already claimed", () => {
    const [a] = dedupePieces(["p1", "p2"], [candidate("p1"), candidate("p2")]);
    expect(a).toBeNull();
  });

  it("returns null for an empty candidate list", () => {
    const [a] = dedupePieces([], [] as Candidate[]);
    expect(a).toBeNull();
  });

  it("does not let a null pick block subsequent lists", () => {
    const [a, b] = dedupePieces(
      ["p1"],
      [candidate("p1")],
      [candidate("p1"), candidate("p2")],
    );
    expect(a).toBeNull();
    expect(b?.playerId).toBe("p2");
  });

  it("accepts a ReadonlySet for claimedIds", () => {
    const claimed = new Set(["p1"]);
    const [a] = dedupePieces(claimed, [candidate("p1"), candidate("p2")]);
    expect(a?.playerId).toBe("p2");
  });
});
