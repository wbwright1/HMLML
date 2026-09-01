import { describe, it, expect } from "vitest";
import {
  selectWeekHistoryReceipts,
  WEEK_RECEIPT_LABELS,
  type WeekHistoryRow,
} from "./week-history";

function game(
  seasonYear: number,
  matchupId: number,
  a: [string, number],
  b: [string, number]
): WeekHistoryRow[] {
  return [
    { seasonYear, matchupId, franchiseName: a[0], points: a[1] },
    { seasonYear, matchupId, franchiseName: b[0], points: b[1] },
  ];
}

describe("selectWeekHistoryReceipts", () => {
  it("returns [] with no history", () => {
    expect(selectWeekHistoryReceipts([])).toEqual([]);
  });

  it("ignores an unpaired half-game", () => {
    expect(
      selectWeekHistoryReceipts([
        { seasonYear: 2023, matchupId: 1, franchiseName: "Solo", points: 200 },
      ])
    ).toEqual([]);
  });

  it("picks the high, the blowout and the closest finish", () => {
    const rows = [
      ...game(2022, 1, ["McCarthyism", 168.4], ["Vanilla Vick", 150.2]),
      ...game(2023, 1, ["Team C", 140.0], ["Team D", 60.0]),
      ...game(2024, 1, ["Team E", 101.2], ["Team F", 100.8]),
    ];
    const receipts = selectWeekHistoryReceipts(rows);
    expect(receipts.map((r) => r.kind)).toEqual(["high", "blowout", "close"]);

    expect(receipts[0].label).toBe(WEEK_RECEIPT_LABELS.high);
    expect(receipts[0].seasonYear).toBe(2022);
    expect(receipts[0].claim).toBe("McCarthyism hung it on Vanilla Vick");
    expect(receipts[0].value).toBe("168.4");

    expect(receipts[1].claim).toBe("Team C buried Team D");
    expect(receipts[1].value).toBe("80.0");

    expect(receipts[2].claim).toBe("Team E survived Team F");
    expect(receipts[2].value).toBe("+0.4");
  });

  it("never cites the same game twice", () => {
    // One game is both the highest score and the biggest blowout.
    const rows = [
      ...game(2023, 1, ["Blowout Winner", 200.0], ["Victim", 50.0]),
      ...game(2022, 1, ["Second Best", 120.0], ["Runner Up", 110.0]),
    ];
    const receipts = selectWeekHistoryReceipts(rows);
    expect(receipts.map((r) => r.kind)).toEqual(["high", "blowout"]);
    expect(receipts[0].claim).toBe("Blowout Winner hung it on Victim");
    // The blowout falls through to the only other game on the board.
    expect(receipts[1].claim).toBe("Second Best buried Runner Up");
    // ...which leaves nothing undecided for the closest finish, so it is
    // dropped rather than repeated.
    expect(receipts.length).toBe(2);
  });

  it("refuses to call a tie a win", () => {
    const rows = [
      ...game(2023, 1, ["A", 150.0], ["B", 100.0]),
      ...game(2022, 1, ["C", 120.0], ["D", 120.0]),
    ];
    const receipts = selectWeekHistoryReceipts(rows);
    // The tie is the only game left after the high-water receipt takes the
    // other one, and no receipt will call a tie a win.
    expect(receipts.map((r) => r.kind)).toEqual(["high"]);
  });

  it("breaks ties toward the more recent season", () => {
    const rows = [
      ...game(2022, 1, ["Old", 150.0], ["Foil", 100.0]),
      ...game(2024, 2, ["New", 150.0], ["Foil2", 100.0]),
    ];
    const receipts = selectWeekHistoryReceipts(rows);
    expect(receipts[0].seasonYear).toBe(2024);
    expect(receipts[0].claim).toBe("New hung it on Foil2");
  });
});
