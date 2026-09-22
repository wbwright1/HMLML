import { describe, expect, it } from "vitest";
import {
  canonicalRivalryPair,
  parseRivalryForm,
  parseRivalryId,
  RIVALRY_LIMITS,
  RIVALRY_MESSAGES,
  asRivalryMessageKey,
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
    [{ franchiseTwoId: BASE.franchiseOneId }, "self-rival"],
    [{ franchiseOneId: "" }, "missing-franchise"],
    [{ name: "   " }, "missing-name"],
    [{ name: "x".repeat(RIVALRY_LIMITS.name + 1) }, "name-too-long"],
    [{ tagline: "x".repeat(RIVALRY_LIMITS.tagline + 1) }, "tagline-too-long"],
    [{ origin: "x".repeat(RIVALRY_LIMITS.origin + 1) }, "origin-too-long"],
    [{ trophyName: "x".repeat(RIVALRY_LIMITS.trophyName + 1) }, "trophy-too-long"],
    [{ originYear: "21" }, "bad-year"],
    [{ originYear: "1899" }, "bad-year"],
    [{ originYear: "2021.5" }, "bad-year"],
  ] as const)("rejects %o with %s", (patch, key) => {
    expect(parseRivalryForm(form({ ...BASE, ...patch }))).toEqual({
      ok: false,
      error: key,
    });
  });

  it("reports a missing required field with its own message", () => {
    const r = parseRivalryForm(new FormData());
    expect(r).toEqual({ ok: false, error: "missing-franchise" });
  });

  it("accepts a name exactly at the cap", () => {
    const r = parseRivalryForm(form({ ...BASE, name: "x".repeat(RIVALRY_LIMITS.name) }));
    expect(r.ok).toBe(true);
  });
});

describe("asRivalryMessageKey", () => {
  it("accepts only known keys, so a crafted URL cannot inject text", () => {
    expect(asRivalryMessageKey("created")).toBe("created");
    expect(asRivalryMessageKey("duplicate-pair")).toBe("duplicate-pair");
    expect(asRivalryMessageKey("You have been hacked")).toBeNull();
    expect(asRivalryMessageKey("toString")).toBeNull();
    expect(asRivalryMessageKey(["created"])).toBeNull();
    expect(asRivalryMessageKey(undefined)).toBeNull();
  });

  it("every message is free of em-dashes", () => {
    for (const m of Object.values(RIVALRY_MESSAGES)) expect(m).not.toContain("\u2014");
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
