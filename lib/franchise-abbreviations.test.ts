import { describe, it, expect } from "vitest";
import {
  ABBREVIATION_PATTERN,
  CURATED_FRANCHISE_ABBREVIATIONS,
  buildTakenSet,
  deriveAbbreviation,
  resolveAbbreviation,
} from "./franchise-abbreviations";

/**
 * The 12 real production franchises (IDs and names read from the live
 * franchises table), with the natural word-initial acronym each must resolve
 * to.
 */
const REAL_FRANCHISES: { id: string; name: string; expected: string }[] = [
  { id: "337850257649987584", name: "The Tokyo Thunderbirds", expected: "TTT" },
  { id: "661810120119881728", name: "Better call Hall", expected: "BCH" },
  { id: "662174578797273088", name: "Vanilla Vick", expected: "VV" },
  { id: "662204930538422272", name: "Of Mice and Mendoza", expected: "OMM" },
  { id: "662444232488861696", name: "McCarthyism", expected: "MCC" },
  { id: "685237785795293184", name: "Foopus", expected: "FOO" },
  { id: "685240664639750144", name: "Pay The Price", expected: "PTP" },
  { id: "685396254645129216", name: "Watson Love Diggs", expected: "WLD" },
  { id: "687106446546001920", name: "Bucky’s General Store", expected: "BGS" },
  { id: "687176498725081088", name: "Better call Myballs", expected: "BCM" },
  {
    id: "696838517652824064",
    name: "Latter Day Lamb Special",
    expected: "LDL",
  },
  { id: "710650554438709248", name: "Olave Garden", expected: "OG" },
];

/** Mirrors the sync loop: stable ID order, taken set seeded up front. */
function resolveAll(
  input: { id: string; name: string }[]
): Map<string, string> {
  const taken = buildTakenSet([]);
  const results = new Map<string, string>();
  for (const f of [...input].sort((a, b) => a.id.localeCompare(b.id))) {
    const value = resolveAbbreviation(f.id, f.name, taken);
    taken.add(value);
    results.set(f.id, value);
  }
  return results;
}

describe("resolveAbbreviation over the real league", () => {
  const resolved = resolveAll(REAL_FRANCHISES);

  for (const f of REAL_FRANCHISES) {
    it(`${f.name} resolves to ${f.expected}`, () => {
      expect(resolved.get(f.id)).toBe(f.expected);
    });
  }

  it("produces 12 pairwise distinct values", () => {
    const values = [...resolved.values()];
    expect(values).toHaveLength(12);
    expect(new Set(values).size).toBe(12);
  });

  it("produces only well-formed values", () => {
    for (const value of resolved.values()) {
      expect(value).toMatch(ABBREVIATION_PATTERN);
    }
  });

  it("is stable regardless of the input order", () => {
    const reversed = resolveAll([...REAL_FRANCHISES].reverse());
    expect([...reversed.entries()].sort()).toEqual(
      [...resolved.entries()].sort()
    );
  });

  it("needs no curated overrides today", () => {
    expect(Object.keys(CURATED_FRANCHISE_ABBREVIATIONS)).toHaveLength(0);
  });

  it("any curated value that is added must be well-formed and distinct", () => {
    const curated = Object.values(CURATED_FRANCHISE_ABBREVIATIONS);
    for (const value of curated) expect(value).toMatch(ABBREVIATION_PATTERN);
    expect(new Set(curated).size).toBe(curated.length);
  });
});

describe("deriveAbbreviation fitting rule", () => {
  it("keeps the plain acronym when it already fits", () => {
    expect(deriveAbbreviation("Watson Love Diggs")).toBe("WLD");
    expect(deriveAbbreviation("Olave Garden")).toBe("OG");
  });

  it("keeps articles in a 3-word name", () => {
    expect(deriveAbbreviation("Pay The Price")).toBe("PTP");
    expect(deriveAbbreviation("The Tokyo Thunderbirds")).toBe("TTT");
  });

  it("drops conjunctions before articles when the acronym is too long", () => {
    expect(deriveAbbreviation("Of Mice and Mendoza")).toBe("OMM");
    expect(deriveAbbreviation("Sturm und Drang and Co")).toMatch(
      ABBREVIATION_PATTERN
    );
    expect(deriveAbbreviation("Franks and Beans and Rice")).toBe("FBR");
  });

  it("drops articles when dropping conjunctions is not enough", () => {
    expect(deriveAbbreviation("The Kings of the North")).toBe("KN");
  });

  it("truncates when there is nothing left to drop", () => {
    expect(deriveAbbreviation("Latter Day Lamb Special")).toBe("LDL");
    expect(deriveAbbreviation("Gimme That Fat Boutte")).toBe("GTF");
  });

  it("uses the first three letters of a one-word name", () => {
    expect(deriveAbbreviation("McCarthyism")).toBe("MCC");
    expect(deriveAbbreviation("Foopus")).toBe("FOO");
  });
});

describe("deriveAbbreviation collisions", () => {
  it("gives two identically named franchises different values", () => {
    const taken = new Set<string>();
    const first = deriveAbbreviation("Better call Hall", taken, "id-1");
    taken.add(first);
    const second = deriveAbbreviation("Better call Hall", taken, "id-2");
    taken.add(second);
    const third = deriveAbbreviation("Better call Hall", taken, "id-3");

    expect(first).toBe("BCH");
    expect(second).not.toBe(first);
    expect(third).not.toBe(first);
    expect(third).not.toBe(second);
    for (const value of [first, second, third]) {
      expect(value).toMatch(ABBREVIATION_PATTERN);
    }
  });

  it("falls back deterministically when every name candidate is taken", () => {
    const taken = new Set<string>();
    const values: string[] = [];
    for (let i = 0; i < 15; i++) {
      const value = deriveAbbreviation("Foopus", taken, `id-${i}`);
      taken.add(value);
      values.push(value);
    }
    expect(new Set(values).size).toBe(15);
    for (const value of values) expect(value).toMatch(ABBREVIATION_PATTERN);

    // Same inputs, same outputs.
    const replay = new Set<string>();
    for (let i = 0; i < 15; i++) {
      const value = deriveAbbreviation("Foopus", replay, `id-${i}`);
      replay.add(value);
      expect(value).toBe(values[i]);
    }
  });
});

describe("deriveAbbreviation normalization", () => {
  it("treats a curly apostrophe as part of the word, not a separator", () => {
    expect(deriveAbbreviation("Bucky’s General Store")).toBe("BGS");
    expect(deriveAbbreviation("Bucky's General Store")).toBe("BGS");
  });

  it("strips diacritics instead of leaking them", () => {
    expect(deriveAbbreviation("Équipe Rouge")).toBe("ER");
    expect(deriveAbbreviation("Ñaño Fuútbol Club")).toBe("NFC");
    expect(deriveAbbreviation("José")).toBe("JOS");
  });

  it("drops punctuation and emoji", () => {
    expect(deriveAbbreviation("Team #1 (Best!)")).toBe("T1B");
    expect(deriveAbbreviation("\u{1F410} Harambe Squad")).toBe("HS");
  });
});

describe("deriveAbbreviation edge cases", () => {
  it("handles an all-stopword name", () => {
    const value = deriveAbbreviation("The The");
    expect(value).toBe("TT");
    expect(value).toMatch(ABBREVIATION_PATTERN);
  });

  it("never drops every word", () => {
    // "The Of And" is entirely droppable; something must still come out.
    expect(deriveAbbreviation("The Of And", new Set(), "seed")).toMatch(
      ABBREVIATION_PATTERN
    );
  });

  it("handles an empty name without throwing or returning empty", () => {
    for (const name of ["", "   ", "\t\n", "!!!"]) {
      const value = deriveAbbreviation(name, new Set(), "337850257649987584");
      expect(value).not.toBe("");
      expect(value).toMatch(ABBREVIATION_PATTERN);
    }
  });

  it("handles single- and two-character names", () => {
    expect(deriveAbbreviation("Xi")).toBe("XI");
    const single = deriveAbbreviation("X", new Set(), "seed");
    expect(single).toMatch(ABBREVIATION_PATTERN);
  });

  it("always returns a well-formed value for arbitrary names", () => {
    const names = [
      "a",
      "the of and",
      "12",
      "3",
      "——",
      "Team",
      "My Team In The On",
      "ü",
      "A B C D E F G H",
    ];
    for (const name of names) {
      expect(deriveAbbreviation(name, new Set(), name)).toMatch(
        ABBREVIATION_PATTERN
      );
    }
  });
});

describe("buildTakenSet", () => {
  it("seeds from curated values plus persisted values, ignoring nulls", () => {
    const taken = buildTakenSet(["ZZZ", null, undefined, "AB"]);
    for (const value of Object.values(CURATED_FRANCHISE_ABBREVIATIONS)) {
      expect(taken.has(value)).toBe(true);
    }
    expect(taken.has("ZZZ")).toBe(true);
    expect(taken.has("AB")).toBe(true);
  });

  it("prevents a derived value from squatting on a persisted one", () => {
    const taken = buildTakenSet(["WLD"]);
    expect(deriveAbbreviation("Watson Love Diggs", taken, "new-id")).not.toBe(
      "WLD"
    );
  });
});
