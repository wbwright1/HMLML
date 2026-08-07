import { describe, expect, it } from "vitest";
import { normalizePlayerSearchQuery } from "@/lib/queries/players";

describe("normalizePlayerSearchQuery", () => {
  it("strips spaces so multi-word names match Sleeper's spaceless search_full_name", () => {
    expect(normalizePlayerSearchQuery("Darius Cooper")).toBe("dariuscooper");
  });

  it("strips punctuation", () => {
    expect(normalizePlayerSearchQuery("A.J. Brown")).toBe("ajbrown");
    expect(normalizePlayerSearchQuery("Ja'Marr Chase")).toBe("jamarrchase");
  });

  it("trims surrounding whitespace via stripping, not .trim()", () => {
    expect(normalizePlayerSearchQuery("  cooper  ")).toBe("cooper");
  });

  it("returns empty string for symbol-only or empty input", () => {
    expect(normalizePlayerSearchQuery("!!!")).toBe("");
    expect(normalizePlayerSearchQuery("")).toBe("");
  });

  it("lowercases input", () => {
    expect(normalizePlayerSearchQuery("COOPER")).toBe("cooper");
  });
});
