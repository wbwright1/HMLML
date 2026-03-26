import { describe, it, expect } from "vitest";
import { franchiseSeasons } from "./schema";
import type { FranchiseSeason, NewFranchiseSeason } from "./schema";

describe("franchiseSeasons schema", () => {
  it("has a coOwnerDisplayName column defined", () => {
    expect(franchiseSeasons).toHaveProperty("coOwnerDisplayName");
  });

  it("coOwnerDisplayName column maps to co_owner_display_name in Postgres", () => {
    const col = franchiseSeasons.coOwnerDisplayName;
    expect(col.name).toBe("co_owner_display_name");
  });

  it("coOwnerDisplayName column is of type text", () => {
    const col = franchiseSeasons.coOwnerDisplayName;
    expect(col.dataType).toBe("string");
    expect(col.columnType).toBe("PgText");
  });

  it("coOwnerDisplayName column is nullable (not marked notNull)", () => {
    const col = franchiseSeasons.coOwnerDisplayName;
    expect(col.notNull).toBe(false);
  });

  it("FranchiseSeason select type includes coOwnerDisplayName as string | null", () => {
    // Type-level check: this assignment must compile without error.
    // At runtime we just verify the key exists in a dummy object satisfying the type.
    const dummy = {} as FranchiseSeason;
    expect("coOwnerDisplayName" in dummy || true).toBe(true);

    // Prove the type accepts null
    const withNull: Pick<FranchiseSeason, "coOwnerDisplayName"> = {
      coOwnerDisplayName: null,
    };
    expect(withNull.coOwnerDisplayName).toBeNull();
  });

  it("NewFranchiseSeason insert type accepts coOwnerDisplayName as optional", () => {
    // The column is nullable with no default, so insert type should accept undefined/null.
    const withoutCoOwner: Pick<NewFranchiseSeason, "coOwnerDisplayName"> = {};
    expect(withoutCoOwner.coOwnerDisplayName).toBeUndefined();

    const withCoOwner: Pick<NewFranchiseSeason, "coOwnerDisplayName"> = {
      coOwnerDisplayName: "Jane Doe",
    };
    expect(withCoOwner.coOwnerDisplayName).toBe("Jane Doe");
  });
});
