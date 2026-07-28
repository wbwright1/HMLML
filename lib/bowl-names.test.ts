import { describe, expect, it } from "vitest";
import { FIRST_BOWL_SEASON, formatRecord, getBowlName, toRoman } from "@/lib/bowl-names";

describe("toRoman", () => {
  it("converts standard subtractive-notation cases", () => {
    expect(toRoman(4)).toBe("IV");
    expect(toRoman(9)).toBe("IX");
    expect(toRoman(14)).toBe("XIV");
  });

  it("converts single digits and larger numbers", () => {
    expect(toRoman(1)).toBe("I");
    expect(toRoman(3)).toBe("III");
    expect(toRoman(40)).toBe("XL");
    expect(toRoman(90)).toBe("XC");
  });
});

describe("getBowlName", () => {
  it("returns HMLML Bowl I for the first bowl season", () => {
    expect(FIRST_BOWL_SEASON).toBe(2021);
    expect(getBowlName(2021)).toBe("HMLML Bowl I");
  });

  it("returns the correct sequential bowl number", () => {
    expect(getBowlName(2023)).toBe("HMLML Bowl III");
    expect(getBowlName(2026)).toBe("HMLML Bowl VI");
  });

  it("returns null for legacy-era seasons before the first bowl season", () => {
    expect(getBowlName(2020)).toBeNull();
    expect(getBowlName(2015)).toBeNull();
  });
});

describe("formatRecord", () => {
  it("formats a record with no ties as W–L (en dash)", () => {
    expect(formatRecord(11, 3, 0)).toBe("11–3");
    expect(formatRecord(11, 3, null)).toBe("11–3");
  });

  it("appends the tie count only when ties > 0", () => {
    expect(formatRecord(9, 4, 1)).toBe("9–4–1");
  });

  it("returns null when wins or losses is null", () => {
    expect(formatRecord(null, 3, 0)).toBeNull();
    expect(formatRecord(11, null, 0)).toBeNull();
    expect(formatRecord(null, null, null)).toBeNull();
  });
});
