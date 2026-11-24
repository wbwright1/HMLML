import { describe, it, expect } from "vitest";
import { resolveOrder, type TiebreakGame, type TiebreakTeam } from "@/lib/nfl-tiebreakers";

const t = (franchiseId: string, wins: number, losses: number, division: number | null = null): TiebreakTeam => ({
  franchiseId,
  wins,
  losses,
  ties: 0,
  division,
});

/** A game the first team won (scores only matter for the points steps). */
const beat = (winner: string, loser: string, pw = 120, pl = 100): TiebreakGame => ({
  teamA: winner,
  teamB: loser,
  pointsA: pw,
  pointsB: pl,
  winner: "A",
});

const ids = (teams: TiebreakTeam[], games: TiebreakGame[]) =>
  resolveOrder(teams, { games }).map((o) => o.team.franchiseId);

describe("resolveOrder: NFL procedures", () => {
  it("orders by win% before any tiebreaker", () => {
    expect(ids([t("a", 5, 5), t("b", 9, 1), t("c", 3, 7)], [])).toEqual(["b", "a", "c"]);
  });

  it("division tie: split head-to-head falls to division record", () => {
    const teams = [t("a", 8, 2, 1), t("b", 8, 2, 1), t("x", 2, 8, 1), t("y", 2, 8, 2)];
    const games = [beat("a", "b"), beat("b", "a"), beat("b", "x"), beat("x", "a"), beat("a", "y")];
    const order = resolveOrder(teams, { games });
    expect(order.slice(0, 2).map((o) => o.team.franchiseId)).toEqual(["b", "a"]);
    expect(order[0].decidedBy).toBe("division record");
  });

  it("3-club wild card: no sweep, so a head-to-head cycle falls to conference (division) record", () => {
    // a, b, c from different divisions; a>b>c>a is a cycle, so the sweep step
    // does not apply. c has the best record inside its own division.
    const teams = [t("a", 7, 4, 1), t("b", 7, 4, 2), t("c", 7, 4, 3), t("a2", 1, 10, 1), t("b2", 1, 10, 2), t("c2", 1, 10, 3)];
    const games = [
      beat("a", "b"),
      beat("b", "c"),
      beat("c", "a"),
      beat("a2", "a"),
      beat("b2", "b"),
      beat("c", "c2"),
    ];
    const order = resolveOrder(teams, { games });
    expect(order[0].team.franchiseId).toBe("c");
    expect(order[0].decidedBy).toBe("division record");
  });

  it("3-club wild card: a sweep wins even with a worse division record", () => {
    const teams = [t("a", 7, 4, 1), t("b", 7, 4, 2), t("c", 7, 4, 3), t("a2", 1, 10, 1)];
    const games = [beat("a", "b"), beat("a", "c"), beat("a2", "a"), beat("b", "c")];
    const order = resolveOrder(teams, { games });
    expect(order.slice(0, 3).map((o) => o.team.franchiseId)).toEqual(["a", "b", "c"]);
    expect(order[0].decidedBy).toBe("head-to-head sweep");
  });

  it("a club swept by the others drops out, and the last two restart at 2-club step 1", () => {
    // a lost to b and c, so a is eliminated first. b and c never met, so the
    // 2-club head-to-head does not apply and division record decides: b.
    const teams = [t("a", 6, 5, 1), t("b", 6, 5, 2), t("c", 6, 5, 3), t("b2", 1, 10, 2), t("c2", 1, 10, 3)];
    const games = [beat("b", "a"), beat("c", "a"), beat("b", "b2"), beat("c2", "c")];
    expect(ids(teams, games).slice(0, 3)).toEqual(["b", "c", "a"]);
  });

  it("wild card: a tie is first reduced to the best team in each division", () => {
    // d1x beat d2z, but d1y owns d1x inside the division, so only d1y faces
    // d2z, and d2z beat d1y. Order: d2z, then d1y over d1x on division record.
    const teams = [t("d1x", 6, 5, 1), t("d1y", 6, 5, 1), t("d2z", 6, 5, 2)];
    const games = [beat("d1y", "d1x"), beat("d1y", "d1x"), beat("d1x", "d2z"), beat("d2z", "d1y")];
    const order = resolveOrder(teams, { games });
    expect(order.map((o) => o.team.franchiseId)).toEqual(["d2z", "d1y", "d1x"]);
    expect(order[0].decidedBy).toBe("head-to-head");
  });

  it("falls through to the points steps when every record step is level", () => {
    // a and b never met, both beat c; a scored more in the same win.
    const teams = [t("a", 8, 2), t("b", 8, 2), t("c", 2, 8)];
    const games = [beat("a", "c", 150, 100), beat("b", "c", 120, 100)];
    const order = resolveOrder(teams, { games });
    expect(order[0].team.franchiseId).toBe("a");
    expect(order[0].decidedBy).toBe("combined ranking (league)");
  });

  it("an all-steps tie is a deterministic coin toss", () => {
    const order = resolveOrder([t("b", 5, 5), t("a", 5, 5)], { games: [] });
    expect(order.map((o) => o.team.franchiseId)).toEqual(["a", "b"]);
    expect(order[0].decidedBy).toBe("coin toss");
  });

  it("is stable regardless of input order", () => {
    const teams = [t("a", 7, 4, 1), t("b", 7, 4, 2), t("c", 7, 4, 3)];
    const games = [beat("a", "b"), beat("b", "c"), beat("c", "a")];
    const first = ids(teams, games);
    expect(ids([...teams].reverse(), games)).toEqual(first);
    expect(ids([teams[1], teams[2], teams[0]], games)).toEqual(first);
  });
});
