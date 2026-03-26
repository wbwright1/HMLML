import { describe, it, expect } from "vitest";
import { SleeperRosterSchema } from "@/lib/sleeper-schemas";

// ---------------------------------------------------------------------------
// The co-owner resolution logic used in both daily sync (daily.ts:241-246)
// and legacy import (legacy-import.ts:263-268) follows this pattern:
//
//   const coOwners = roster.co_owners;
//   const coOwnerDisplayName = coOwners?.length
//     ? coOwners.map((id) => userMap.get(id)?.displayName ?? "Unknown").join(" & ")
//     : null;
//
// We test two things here:
//   1. The Zod schema validates co_owners correctly (pure validation, no mocks)
//   2. The formatting logic produces correct output (pure function, no mocks)
// ---------------------------------------------------------------------------

/** Replicates the co-owner resolution logic from daily.ts and legacy-import.ts */
function resolveCoOwnerDisplayName(
  coOwners: string[] | null | undefined,
  userMap: Map<string, { displayName: string }>
): string | null {
  return coOwners?.length
    ? coOwners
        .map((id) => userMap.get(id)?.displayName ?? "Unknown")
        .join(" & ")
    : null;
}

// ---------------------------------------------------------------------------
// 1. Zod Schema: SleeperRosterSchema co_owners field validation
// ---------------------------------------------------------------------------

describe("SleeperRosterSchema co_owners field", () => {
  // Minimal valid roster object (all required fields present)
  const baseRoster = {
    roster_id: 1,
    owner_id: "user123",
    league_id: "league456",
    players: ["p1", "p2"],
    starters: ["p1"],
    reserve: null,
    taxi: null,
    settings: {
      wins: 5,
      losses: 3,
      ties: 0,
      fpts: 1234,
      fpts_decimal: 56,
    },
  };

  it("accepts co_owners as an array of strings", () => {
    const data = { ...baseRoster, co_owners: ["user1", "user2"] };
    const result = SleeperRosterSchema.safeParse(data);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.co_owners).toEqual(["user1", "user2"]);
    }
  });

  it("accepts co_owners as null (nullable)", () => {
    const data = { ...baseRoster, co_owners: null };
    const result = SleeperRosterSchema.safeParse(data);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.co_owners).toBeNull();
    }
  });

  it("accepts missing co_owners field (optional)", () => {
    const data = { ...baseRoster };
    // Ensure co_owners is not present
    const result = SleeperRosterSchema.safeParse(data);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.co_owners).toBeUndefined();
    }
  });

  it("accepts co_owners as an empty array", () => {
    const data = { ...baseRoster, co_owners: [] };
    const result = SleeperRosterSchema.safeParse(data);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.co_owners).toEqual([]);
    }
  });

  it("accepts co_owners with a single string", () => {
    const data = { ...baseRoster, co_owners: ["user1"] };
    const result = SleeperRosterSchema.safeParse(data);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.co_owners).toEqual(["user1"]);
    }
  });

  it("rejects co_owners as a plain string (not an array)", () => {
    const data = { ...baseRoster, co_owners: "invalid" };
    const result = SleeperRosterSchema.safeParse(data);

    expect(result.success).toBe(false);
  });

  it("rejects co_owners containing numbers instead of strings", () => {
    const data = { ...baseRoster, co_owners: [123] };
    const result = SleeperRosterSchema.safeParse(data);

    expect(result.success).toBe(false);
  });

  it("rejects co_owners containing mixed types", () => {
    const data = { ...baseRoster, co_owners: ["user1", 123, null] };
    const result = SleeperRosterSchema.safeParse(data);

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Co-owner display name formatting logic
// ---------------------------------------------------------------------------

describe("co-owner display name resolution", () => {
  const userMap = new Map<string, { displayName: string }>([
    ["uid1", { displayName: "Alice" }],
    ["uid2", { displayName: "Bob" }],
    ["uid3", { displayName: "Charlie" }],
  ]);

  it("joins two co-owners with ' & ' separator", () => {
    const result = resolveCoOwnerDisplayName(["uid1", "uid2"], userMap);
    expect(result).toBe("Alice & Bob");
  });

  it("joins three co-owners with ' & ' separator", () => {
    const result = resolveCoOwnerDisplayName(
      ["uid1", "uid2", "uid3"],
      userMap
    );
    expect(result).toBe("Alice & Bob & Charlie");
  });

  it("resolves a single co-owner without separator", () => {
    const result = resolveCoOwnerDisplayName(["uid1"], userMap);
    expect(result).toBe("Alice");
  });

  it("returns null when co_owners is null", () => {
    const result = resolveCoOwnerDisplayName(null, userMap);
    expect(result).toBeNull();
  });

  it("returns null when co_owners is undefined", () => {
    const result = resolveCoOwnerDisplayName(undefined, userMap);
    expect(result).toBeNull();
  });

  it("returns null when co_owners is an empty array", () => {
    const result = resolveCoOwnerDisplayName([], userMap);
    expect(result).toBeNull();
  });

  it("falls back to 'Unknown' for unresolved user IDs", () => {
    const result = resolveCoOwnerDisplayName(["uid1", "unknown_id"], userMap);
    expect(result).toBe("Alice & Unknown");
  });

  it("returns 'Unknown' for all unresolved co-owners", () => {
    const result = resolveCoOwnerDisplayName(
      ["missing1", "missing2"],
      userMap
    );
    expect(result).toBe("Unknown & Unknown");
  });

  it("never returns empty string (returns null instead)", () => {
    // This verifies BR-4: coOwnerDisplayName is null, not ""
    const nullResult = resolveCoOwnerDisplayName(null, userMap);
    const undefinedResult = resolveCoOwnerDisplayName(undefined, userMap);
    const emptyResult = resolveCoOwnerDisplayName([], userMap);

    expect(nullResult).not.toBe("");
    expect(undefinedResult).not.toBe("");
    expect(emptyResult).not.toBe("");

    expect(nullResult).toBeNull();
    expect(undefinedResult).toBeNull();
    expect(emptyResult).toBeNull();
  });
});
