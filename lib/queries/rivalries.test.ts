import { describe, expect, it } from "vitest";
import {
  buildRivalryLookup,
  findNamedRivalry,
  type NamedRivalry,
} from "./rivalries";

function rivalry(
  id: number,
  franchiseAId: string,
  franchiseBId: string,
  name: string,
): NamedRivalry {
  return {
    id,
    franchiseAId,
    franchiseBId,
    name,
    tagline: null,
    origin: null,
    originYear: null,
    trophyName: null,
  };
}

const CUSTODY = rivalry(1, "662204930538422272", "710650554438709248", "The Custody Battle");
const SPLIT = rivalry(2, "662174578797273088", "662444232488861696", "The Split Decision");

describe("buildRivalryLookup / findNamedRivalry", () => {
  const lookup = buildRivalryLookup([CUSTODY, SPLIT]);

  it("keys every rivalry by its pair", () => {
    expect(lookup.size).toBe(2);
    expect([...lookup.keys()].sort()).toEqual([
      "662174578797273088|662444232488861696",
      "662204930538422272|710650554438709248",
    ]);
  });

  it("finds a rivalry with the franchises in either order", () => {
    expect(findNamedRivalry(lookup, "710650554438709248", "662204930538422272")).toBe(CUSTODY);
    expect(findNamedRivalry(lookup, "662204930538422272", "710650554438709248")).toBe(CUSTODY);
    expect(findNamedRivalry(lookup, "662444232488861696", "662174578797273088")).toBe(SPLIT);
  });

  it("returns null for an unnamed pair, a cross pair, or a self pair", () => {
    expect(findNamedRivalry(lookup, "710650554438709248", "662444232488861696")).toBeNull();
    expect(findNamedRivalry(lookup, "nope", "also-nope")).toBeNull();
    expect(findNamedRivalry(lookup, "710650554438709248", "710650554438709248")).toBeNull();
  });

  it("still finds a row stored out of canonical order", () => {
    // The CHECK prevents this in the DB; the lookup should not depend on it.
    const flipped = rivalry(3, "b", "a", "Flipped");
    const l = buildRivalryLookup([flipped]);
    expect(findNamedRivalry(l, "a", "b")).toBe(flipped);
  });

  it("builds an empty lookup from an empty list", () => {
    expect(buildRivalryLookup([]).size).toBe(0);
    expect(findNamedRivalry(buildRivalryLookup([]), "a", "b")).toBeNull();
  });
});
