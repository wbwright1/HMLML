import { describe, it, expect } from "vitest";
import {
  computeSeasonArc,
  crownOrder,
  findBiggestSwing,
  type ArcGame,
} from "./season-arc";

function game(
  franchiseId: string,
  week: number,
  points: number,
  isWinner: boolean | null
): ArcGame {
  return { franchiseId, week, points, isWinner };
}

describe("computeSeasonArc: standings lens", () => {
  it("ranks by cumulative wins, then points for", () => {
    const arc = computeSeasonArc(
      ["a", "b"],
      [
        game("a", 1, 100, true),
        game("b", 1, 90, false),
        game("a", 2, 80, false),
        game("b", 2, 120, true),
      ]
    );
    expect(arc.weeks).toEqual([1, 2]);
    const a = arc.standings.series.find((s) => s.franchiseId === "a")!;
    const b = arc.standings.series.find((s) => s.franchiseId === "b")!;
    // Week 1: a is 1-0. Week 2: both 1-1, b leads on PF (210 vs 180).
    expect(a.ranks).toEqual([1, 2]);
    expect(b.ranks).toEqual([2, 1]);
  });

  it("counts a tie as half a win", () => {
    const arc = computeSeasonArc(
      ["a", "b", "c"],
      [
        game("a", 1, 100, null),
        game("b", 1, 200, false),
        game("c", 1, 50, true),
      ]
    );
    const rank = (id: string) =>
      arc.standings.series.find((s) => s.franchiseId === id)!.ranks[0];
    expect(rank("c")).toBe(1);
    expect(rank("a")).toBe(2);
    expect(rank("b")).toBe(3);
  });
});

describe("computeSeasonArc: power lens", () => {
  it("only looks at the trailing four weeks", () => {
    // a wins weeks 1-4 and loses 5-8; b does the opposite. By week 8 the
    // window is weeks 5-8, so b must be ahead despite equal season records.
    const games: ArcGame[] = [];
    for (let w = 1; w <= 8; w++) {
      games.push(game("a", w, 100, w <= 4));
      games.push(game("b", w, 100, w > 4));
    }
    const arc = computeSeasonArc(["a", "b"], games);
    const a = arc.power.series.find((s) => s.franchiseId === "a")!;
    const b = arc.power.series.find((s) => s.franchiseId === "b")!;
    expect(a.ranks[3]).toBe(1); // week 4
    expect(b.ranks[7]).toBe(1); // week 8
    expect(a.ranks[7]).toBe(2);
  });
});

describe("findBiggestSwing", () => {
  const weeks = [1, 2, 3, 4, 5];
  const series = [
    { franchiseId: "a", ranks: [2, 1, 5, 9, 10] },
    { franchiseId: "b", ranks: [11, 9, 4, 3, 6] },
    { franchiseId: "c", ranks: [5, 5, 6, 5, 4] },
  ];

  it("finds the largest fall between any two weeks", () => {
    expect(findBiggestSwing(series, weeks, "fall")).toEqual({
      franchiseId: "a",
      fromRank: 1,
      fromWeek: 2,
      toRank: 10,
      toWeek: 5,
      spots: 9,
    });
  });

  it("finds the largest climb, even if it gave some back later", () => {
    expect(findBiggestSwing(series, weeks, "rise")).toEqual({
      franchiseId: "b",
      fromRank: 11,
      fromWeek: 1,
      toRank: 3,
      toWeek: 4,
      spots: 8,
    });
  });

  it("returns null when nothing moved enough to matter", () => {
    expect(
      findBiggestSwing([{ franchiseId: "c", ranks: [5, 4, 6] }], [1, 2, 3], "rise")
    ).toBeNull();
  });
});

describe("wire to wire", () => {
  it("names a franchise that was #1 every week once the season has length", () => {
    const games: ArcGame[] = [];
    for (let w = 1; w <= 4; w++) {
      games.push(game("a", w, 150, true));
      games.push(game("b", w, 90, false));
    }
    expect(computeSeasonArc(["a", "b"], games).standings.wireToWire).toBe("a");
  });

  it("stays null for a short season", () => {
    const arc = computeSeasonArc(
      ["a", "b"],
      [game("a", 1, 150, true), game("b", 1, 90, false)]
    );
    expect(arc.standings.wireToWire).toBeNull();
  });
});

describe("crownOrder", () => {
  it("puts the champion first and keeps everyone else in final-week order", () => {
    const order = crownOrder(
      [
        { franchiseId: "a", ranks: [1, 1] },
        { franchiseId: "b", ranks: [2, 2] },
        { franchiseId: "c", ranks: [3, 3] },
      ],
      "c"
    );
    expect(order.get("c")).toBe(1);
    expect(order.get("a")).toBe(2);
    expect(order.get("b")).toBe(3);
  });
});
