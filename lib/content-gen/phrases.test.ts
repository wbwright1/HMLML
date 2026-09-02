import { describe, expect, it } from "vitest";
import {
  phraseSetsOverlap,
  sharesSignaturePhrase,
  SIGNATURE_PHRASES,
  signaturePhrasesIn,
} from "@/lib/content-gen/phrases";

describe("SIGNATURE_PHRASES", () => {
  it("only contains multi-word, already-normalized idioms", () => {
    for (const phrase of SIGNATURE_PHRASES) {
      expect(phrase.split(" ").length, phrase).toBeGreaterThanOrEqual(2);
      expect(phrase, phrase).toBe(phrase.toLowerCase());
      expect(phrase, phrase).toMatch(/^[a-z0-9 ]+$/);
    }
  });

  it("has no duplicate entries", () => {
    expect(new Set(SIGNATURE_PHRASES).size).toBe(SIGNATURE_PHRASES.length);
  });
});

describe("signaturePhrasesIn", () => {
  it("finds a phrase regardless of case and punctuation", () => {
    expect(signaturePhrasesIn("Receipts, to settle!")).toEqual(
      new Set(["receipts to settle"]),
    );
    expect(
      signaturePhrasesIn("FIRST PLACE IS ON   THE LINE tonight"),
    ).toEqual(new Set(["on the line"]));
  });

  it("returns an empty set for copy with no stock idiom", () => {
    expect(
      signaturePhrasesIn("Week 3 is set. Six games and twelve rosters."),
    ).toEqual(new Set());
  });

  it("finds every phrase present, not just the first", () => {
    const found = signaturePhrasesIn(
      "First place is on the line and there are receipts to settle by Thursday night.",
    );
    expect(found.has("on the line")).toBe(true);
    expect(found.has("receipts to settle")).toBe(true);
  });
});

describe("sharesSignaturePhrase", () => {
  it("catches the live hub collision this module exists for", () => {
    const dek =
      "Week 1 is set. 6 matchups, one grudge match at the top, and a week of receipts to settle by Sunday.";
    const gotw =
      "Foopus (0-0) and Bar FC (0-0) headline the slate. First place is on the line and there are receipts to settle by Thursday night.";
    expect(sharesSignaturePhrase(dek, gotw)).toBe(true);
  });

  it("does not fire on a merely shared common word", () => {
    expect(
      sharesSignaturePhrase(
        "The receipts are already piling up in week one.",
        "There are receipts to settle by Thursday night.",
      ),
    ).toBe(false);
    expect(
      sharesSignaturePhrase(
        "Six matchups and nowhere left to hide.",
        "Twelve rosters and one slate to sort them out.",
      ),
    ).toBe(false);
  });

  it("is symmetric", () => {
    const a = "The group chat has not let it go.";
    const b = "Every team is a contender in a group chat and nowhere else.";
    expect(sharesSignaturePhrase(a, b)).toBe(true);
    expect(sharesSignaturePhrase(b, a)).toBe(true);
  });
});

describe("phraseSetsOverlap", () => {
  it("is false when either side has no phrases at all", () => {
    expect(
      phraseSetsOverlap(new Set(), signaturePhrasesIn("on the line")),
    ).toBe(false);
    expect(
      phraseSetsOverlap(signaturePhrasesIn("on the line"), new Set()),
    ).toBe(false);
  });

  it("is true on any shared entry", () => {
    expect(
      phraseSetsOverlap(
        signaturePhrasesIn("bragging rights and nothing else"),
        signaturePhrasesIn("this one is for bragging rights"),
      ),
    ).toBe(true);
  });
});
