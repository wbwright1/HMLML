import { describe, it, expect } from "vitest";
import { formatAddCount } from "./format-adds";

describe("formatAddCount", () => {
  it("compacts thousands to one decimal", () => {
    expect(formatAddCount(877698)).toBe("877.7K");
    expect(formatAddCount(556400)).toBe("556.4K");
  });

  it("drops a trailing .0 and compacts millions", () => {
    expect(formatAddCount(12000)).toBe("12K");
    expect(formatAddCount(1_234_567)).toBe("1.2M");
  });

  it("leaves small counts as plain numbers", () => {
    expect(formatAddCount(0)).toBe("0");
    expect(formatAddCount(942)).toBe("942");
  });
});
