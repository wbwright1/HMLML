import { describe, it, expect } from "vitest";
import { teamAcronym } from "./team-acronym";

describe("teamAcronym", () => {
  const cases: [string, string][] = [
    ["Better call Hall", "BCH"],
    ["Better call Myballs", "BCM"],
    ["Bucky's General Store", "BGS"],
    ["Foopus", "FOO"],
    ["Gimme That Fat Boutte", "GTFB"],
    ["Latter Day Lamb Special", "LDLS"],
    ["McCarthyism", "MCC"],
    ["Of Mice and Mendoza", "OMAM"],
    ["Olave Garden", "OG"],
    ["The Tokyo Thunderbirds", "TTT"],
    ["Vanilla Vick", "VV"],
    ["Watson Love Diggs", "WLD"],
  ];

  for (const [name, expected] of cases) {
    it(`maps "${name}" to "${expected}"`, () => {
      expect(teamAcronym(name)).toBe(expected);
    });
  }

  it("returns '?' for an empty string", () => {
    expect(teamAcronym("")).toBe("?");
  });

  it("returns '?' for whitespace-only input", () => {
    expect(teamAcronym("   ")).toBe("?");
  });

  it("falls back to the first 3 letters for a single-word name", () => {
    expect(teamAcronym("Foopus")).toBe("FOO");
  });
});
