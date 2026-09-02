import { describe, it, expect } from "vitest";
import { describeDbError } from "./db-error";

describe("describeDbError", () => {
  it("keeps the constraint and detail Postgres attaches to the error", () => {
    const e = Object.assign(
      new Error(
        'insert or update on table "roster_players" violates foreign key constraint "roster_players_player_id_players_id_fk"'
      ),
      {
        constraint: "roster_players_player_id_players_id_fk",
        detail: 'Key (player_id)=(12345) is not present in table "players".',
      }
    );

    const described = describeDbError(e);
    expect(described).toContain("roster_players_player_id_players_id_fk");
    expect(described).toContain("Key (player_id)=(12345)");
  });

  it("reads detail and constraint off the error's cause", () => {
    const e = new Error("Error connecting to database", {
      cause: {
        constraint: "tmp_269_block",
        detail: "Failing row contains (1, 2, ...).",
      },
    });
    expect(describeDbError(e)).toBe(
      "Error connecting to database; constraint tmp_269_block; Failing row contains (1, 2, ...)."
    );
  });

  it("falls back to the bare message when Postgres attached nothing", () => {
    expect(describeDbError(new Error("boom"))).toBe("boom");
  });

  it("handles a non-Error throw", () => {
    expect(describeDbError("nope")).toBe("Unknown error");
  });
});
