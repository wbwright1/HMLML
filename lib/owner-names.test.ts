import { describe, it, expect } from "vitest";
import { resolveOwnerName, resolveCoOwnerNames } from "./owner-names";

describe("resolveOwnerName", () => {
  it("resolves by user id", () => {
    expect(
      resolveOwnerName({ userId: "661810120119881728", displayName: "r2ampage6" })
    ).toBe("Collin");
  });

  it("resolves by username when no id match", () => {
    expect(
      resolveOwnerName({ userId: undefined, displayName: "bellybuttonfluff" })
    ).toBe("Landon");
  });

  it("resolves usernames case-insensitively", () => {
    expect(
      resolveOwnerName({ userId: null, displayName: "BELLYBUTTONFLUFF" })
    ).toBe("Landon");
  });

  it("resolves the historical Snakethorn alias for Blake", () => {
    expect(resolveOwnerName({ displayName: "Snakethorn" })).toBe("Blake");
    expect(resolveOwnerName({ displayName: "snakethorn" })).toBe("Blake");
  });

  it("falls back to the raw display name when unknown", () => {
    expect(resolveOwnerName({ displayName: "SomeRandomUser" })).toBe(
      "SomeRandomUser"
    );
  });

  it("returns undefined when nothing is known and no display name given", () => {
    expect(resolveOwnerName({})).toBeUndefined();
    expect(resolveOwnerName({ userId: null, displayName: null })).toBeUndefined();
  });
});

describe("resolveCoOwnerNames", () => {
  it("splits and rejoins a co-owner pair", () => {
    expect(
      resolveCoOwnerNames("bellybuttonfluff & thebiscottiway")
    ).toBe("Landon & Carson");
  });

  it("falls back per-piece for unknown usernames", () => {
    expect(resolveCoOwnerNames("bellybuttonfluff & mystery")).toBe(
      "Landon & mystery"
    );
  });

  it("returns undefined for null or undefined input", () => {
    expect(resolveCoOwnerNames(null)).toBeUndefined();
    expect(resolveCoOwnerNames(undefined)).toBeUndefined();
  });
});
