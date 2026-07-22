import { describe, it, expect } from "vitest";
import { buildMemberFranchiseMap } from "./member-franchise";

describe("buildMemberFranchiseMap", () => {
  it("maps a primary owner to their own franchise", () => {
    const map = buildMemberFranchiseMap([{ owner_id: "u1" }]);
    expect(map.get("u1")).toBe("u1");
  });

  it("maps a co-owner to the roster's franchise", () => {
    const map = buildMemberFranchiseMap([
      { owner_id: "u1", co_owners: ["u2"] },
    ]);
    expect(map.get("u2")).toBe("u1");
  });

  it("skips unowned rosters", () => {
    const map = buildMemberFranchiseMap([
      { owner_id: null, co_owners: ["u9"] },
    ]);
    expect(map.has("u9")).toBe(false);
    expect(map.size).toBe(0);
  });

  it("lets primary ownership win over co-ownership regardless of order", () => {
    // u1 primary-owns roster A but is listed as a co-owner of roster B. Whether
    // A precedes or follows B, u1 must resolve to A (their own franchise).
    const rostersAthenB = [
      { owner_id: "u1", co_owners: [] as string[] }, // A
      { owner_id: "u2", co_owners: ["u1"] }, // B lists u1 as co-owner
    ];
    const rostersBthenA = [rostersAthenB[1], rostersAthenB[0]];

    expect(buildMemberFranchiseMap(rostersAthenB).get("u1")).toBe("u1");
    expect(buildMemberFranchiseMap(rostersBthenA).get("u1")).toBe("u1");
  });

  it("handles rosters with no co_owners field", () => {
    const map = buildMemberFranchiseMap([{ owner_id: "u1", co_owners: null }]);
    expect(map.get("u1")).toBe("u1");
  });
});
