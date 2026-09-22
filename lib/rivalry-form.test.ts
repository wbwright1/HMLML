import { describe, expect, it } from "vitest";
import {
  canonicalRivalryPair,
  parseRivalryForm,
  parseRivalryId,
  RIVALRY_LIMITS,
} from "./rivalry-form";
import { rivalryPairKey } from "./queries/rivalry-week";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const BASE = {
  franchiseOneId: "710650554438709248",
  franchiseTwoId: "662204930538422272",
  name: "  The Custody Battle ",
  tagline: "",
  origin: "",
  originYear: "",
  trophyName: "",
};

describe("canonicalRivalryPair", () => {
  it("orders the pair ascending regardless of input order", () => {
    expect(canonicalRivalryPair("b", "a")).toEqual({
      franchiseAId: "a",
      franchiseBId: "b",
    });
    expect(canonicalRivalryPair("a", "b")).toEqual({
      franchiseAId: "a",
      franchiseBId: "b",
    });
  });

  it("agrees with rivalryPairKey's order, including punctuation-heavy ids", () => {
    // Byte order puts "-" (0x2D) before digits; locale collation would not.
    const pairs: [string, string][] = [
      ["e2e-4-1-franchise-b", "e2e-4-1-franchise-a"],
      ["e2e1", "e2e-a"],
      ["710650554438709248", "662204930538422272"],
    ];
    for (const [x, y] of pairs) {
      const p = canonicalRivalryPair(x, y)!;
      expect(`${p.franchiseAId}|${p.franchiseBId}`).toBe(rivalryPairKey(x, y));
    }
  });

  it("rejects a franchise paired with itself", () => {
    expect(canonicalRivalryPair("a", "a")).toBeNull();
  });
});

describe("parseRivalryForm", () => {
  it("canonicalizes the pair, trims text and nulls blank optionals", () => {
    const r = parseRivalryForm(form(BASE));
    expect(r).toEqual({
      ok: true,
      value: {
        franchiseAId: "662204930538422272",
        franchiseBId: "710650554438709248",
        name: "The Custody Battle",
        tagline: null,
        origin: null,
        originYear: null,
        trophyName: null,
      },
    });
  });

  it("keeps optional fields and parses the origin year", () => {
    const r = parseRivalryForm(
      form({
        ...BASE,
        tagline: " A grudge ",
        origin: "Lore.",
        originYear: "2021",
        trophyName: "The Gavel",
      }),
    );
    expect(r.ok && r.value).toMatchObject({
      tagline: "A grudge",
      origin: "Lore.",
      originYear: 2021,
      trophyName: "The Gavel",
    });
  });

  it("treats missing optional fields as null", () => {
    const fd = new FormData();
    fd.set("franchiseOneId", "a");
    fd.set("franchiseTwoId", "b");
    fd.set("name", "X");
    const r = parseRivalryForm(fd);
    expect(r).toEqual({
      ok: true,
      value: {
        franchiseAId: "a",
        franchiseBId: "b",
        name: "X",
        tagline: null,
        origin: null,
        originYear: null,
        trophyName: null,
      },
    });
  });

  it.each([
    [{ franchiseTwoId: BASE.franchiseOneId }, "A franchise cannot be its own rival."],
    [{ franchiseOneId: "" }, "Pick both franchises."],
    [{ name: "   " }, "A rivalry needs a name."],
    [{ name: "x".repeat(RIVALRY_LIMITS.name + 1) }, "Name is capped"],
    [{ tagline: "x".repeat(RIVALRY_LIMITS.tagline + 1) }, "Tagline is capped"],
    [{ originYear: "21" }, "Origin year must be a four-digit year"],
    [{ originYear: "1899" }, "Origin year must be a four-digit year"],
    [{ originYear: "2021.5" }, "Origin year must be a four-digit year"],
  ])("rejects %o", (patch, message) => {
    const r = parseRivalryForm(form({ ...BASE, ...patch }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(message);
  });

  it("reports a missing required field with its own message", () => {
    const r = parseRivalryForm(new FormData());
    expect(r).toEqual({ ok: false, error: "Pick both franchises." });
  });
});

describe("parseRivalryId", () => {
  it("accepts a positive integer and rejects anything else", () => {
    expect(parseRivalryId(form({ rivalryId: "7" }))).toBe(7);
    for (const bad of ["0", "-1", "1.5", "abc", "", "1e3"]) {
      expect(parseRivalryId(form({ rivalryId: bad }))).toBeNull();
    }
    expect(parseRivalryId(new FormData())).toBeNull();
  });
});
