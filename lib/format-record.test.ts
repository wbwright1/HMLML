import { describe, it, expect } from "vitest";
import { formatRecord } from "./format-record";

describe("formatRecord", () => {
  it("formats wins-losses", () => {
    expect(formatRecord(9, 5, 0)).toBe("9-5");
  });

  it("includes ties only when present", () => {
    expect(formatRecord(8, 5, 1)).toBe("8-5-1");
  });

  it("treats nulls as zero", () => {
    expect(formatRecord(null, null, null)).toBe("0-0");
  });
});
