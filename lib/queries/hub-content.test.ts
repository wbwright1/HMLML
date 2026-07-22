import { describe, it, expect } from "vitest";
import { groupByKind, type HubContentRow } from "./hub-content";

function row(kind: string, body: string, refKey: string | null = null): HubContentRow {
  return { kind, body, refKey, extras: null, createdAt: null };
}

describe("groupByKind", () => {
  it("returns an empty object for no rows", () => {
    expect(groupByKind([])).toEqual({});
  });

  it("groups rows by kind", () => {
    const rows = [
      row("smack_post", "a"),
      row("burning_question", "q1"),
      row("smack_post", "b"),
      row("burning_question", "q2"),
    ];
    const grouped = groupByKind(rows);
    expect(Object.keys(grouped).sort()).toEqual(["burning_question", "smack_post"]);
    expect(grouped.smack_post).toHaveLength(2);
    expect(grouped.burning_question).toHaveLength(2);
  });

  it("preserves input order within a group", () => {
    const rows = [row("smack_post", "first"), row("smack_post", "second"), row("smack_post", "third")];
    const grouped = groupByKind(rows);
    expect(grouped.smack_post.map((r) => r.body)).toEqual(["first", "second", "third"]);
  });

  it("keeps refKey and other fields intact", () => {
    const grouped = groupByKind([row("division_note", "note", "Division 1")]);
    expect(grouped.division_note[0].refKey).toBe("Division 1");
    expect(grouped.division_note[0].body).toBe("note");
  });
});
