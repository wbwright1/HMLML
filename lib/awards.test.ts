import { describe, it, expect } from "vitest";
import {
  AWARD_TYPES,
  AWARD_TYPE_ORDER,
  isAwardType,
  getAwardMeta,
  seasonShort,
  formatAwardChip,
} from "./awards";
import { normalizePlayerName } from "./awards-seed";

describe("isAwardType", () => {
  it("accepts the three known codes", () => {
    expect(isAwardType("regular_season_mvp")).toBe(true);
    expect(isAwardType("championship_mvp")).toBe(true);
    expect(isAwardType("rookie_of_year")).toBe(true);
  });
  it("rejects unknown codes", () => {
    expect(isAwardType("lvp")).toBe(false);
    expect(isAwardType("")).toBe(false);
  });
});

describe("AWARD_TYPE_ORDER", () => {
  it("is MVP, Championship MVP, Rookie of the Year", () => {
    expect(AWARD_TYPE_ORDER).toEqual([
      AWARD_TYPES.REGULAR_SEASON_MVP,
      AWARD_TYPES.CHAMPIONSHIP_MVP,
      AWARD_TYPES.ROOKIE_OF_YEAR,
    ]);
  });
});

describe("getAwardMeta", () => {
  it("returns metadata for a known type", () => {
    expect(getAwardMeta("regular_season_mvp")?.shortLabel).toBe("MVP");
    expect(getAwardMeta("championship_mvp")?.shortLabel).toBe("FMVP");
    expect(getAwardMeta("rookie_of_year")?.shortLabel).toBe("ROY");
  });
  it("returns null for an unknown type", () => {
    expect(getAwardMeta("bust_of_year")).toBeNull();
  });
});

describe("seasonShort", () => {
  it("returns a two-digit suffix", () => {
    expect(seasonShort(2025)).toBe("25");
    expect(seasonShort(2001)).toBe("01");
  });
});

describe("formatAwardChip", () => {
  it("formats known types as SHORT 'YY", () => {
    expect(formatAwardChip("regular_season_mvp", 2025)).toBe("MVP '25");
    expect(formatAwardChip("championship_mvp", 2024)).toBe("FMVP '24");
    expect(formatAwardChip("rookie_of_year", 2021)).toBe("ROY '21");
  });
  it("falls back to an uppercased raw type when unknown", () => {
    expect(formatAwardChip("lvp", 2025)).toBe("LVP '25");
  });
});

describe("normalizePlayerName", () => {
  it("lowercases and strips punctuation/spaces to match search_full_name", () => {
    expect(normalizePlayerName("Ja'Marr Chase")).toBe("jamarrchase");
    expect(normalizePlayerName("Jaxon Smith-Njigba")).toBe("jaxonsmithnjigba");
    expect(normalizePlayerName("Christian McCaffrey")).toBe("christianmccaffrey");
    expect(normalizePlayerName("Cooper Kupp")).toBe("cooperkupp");
  });
});
