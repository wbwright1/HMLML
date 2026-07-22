import { describe, it, expect } from "vitest";
import {
  pickDoormatId,
  fieldTagFor,
  buildFieldEntry,
} from "./preseason-field";

// formatRecord's own tests live in lib/format-record.test.ts (the formatter was
// extracted there and is re-exported from this module for back-compat).

describe("pickDoormatId", () => {
  it("returns null for an empty season", () => {
    expect(pickDoormatId([])).toBeNull();
  });

  it("picks the largest standings_finish (last place)", () => {
    const id = pickDoormatId([
      { franchiseId: "a", wins: 10, losses: 4, ties: 0, standingsFinish: 1, playoffResult: "champion" },
      { franchiseId: "b", wins: 4, losses: 10, ties: 0, standingsFinish: 12, playoffResult: null },
      { franchiseId: "c", wins: 6, losses: 8, ties: 0, standingsFinish: 8, playoffResult: null },
    ]);
    expect(id).toBe("b");
  });

  it("falls back to lowest win% when finish is unrecorded", () => {
    const id = pickDoormatId([
      { franchiseId: "a", wins: 10, losses: 4, ties: 0, standingsFinish: null, playoffResult: null },
      { franchiseId: "b", wins: 2, losses: 12, ties: 0, standingsFinish: null, playoffResult: null },
    ]);
    expect(id).toBe("b");
  });

  it("falls back to single-season worst finish when no sustained set is given", () => {
    const id = pickDoormatId([
      { franchiseId: "a", wins: 10, losses: 4, ties: 0, standingsFinish: 1, playoffResult: "champion" },
      { franchiseId: "b", wins: 4, losses: 10, ties: 0, standingsFinish: 12, playoffResult: null },
    ], new Set());
    expect(id).toBe("b");
  });

  it("prefers a franchise with a sustained multi-year bottom-tier trend over the single-season worst", () => {
    const id = pickDoormatId(
      [
        { franchiseId: "a", wins: 10, losses: 4, ties: 0, standingsFinish: 1, playoffResult: "champion" },
        // "b" finished worse THIS season, but "c" is the sustained doormat.
        { franchiseId: "b", wins: 3, losses: 11, ties: 0, standingsFinish: 12, playoffResult: null },
        { franchiseId: "c", wins: 4, losses: 10, ties: 0, standingsFinish: 11, playoffResult: null },
      ],
      new Set(["c"]),
    );
    expect(id).toBe("c");
  });

  it("breaks ties among multiple sustained doormats by single-season worst finish", () => {
    const id = pickDoormatId(
      [
        { franchiseId: "b", wins: 4, losses: 10, ties: 0, standingsFinish: 10, playoffResult: null },
        { franchiseId: "c", wins: 3, losses: 11, ties: 0, standingsFinish: 12, playoffResult: null },
      ],
      new Set(["b", "c"]),
    );
    expect(id).toBe("c");
  });
});

describe("fieldTagFor", () => {
  const doormatId = "z";

  it("returns null for a missing row", () => {
    expect(fieldTagFor(undefined, doormatId)).toBeNull();
  });

  it("tags the champion", () => {
    expect(
      fieldTagFor(
        { franchiseId: "a", wins: 10, losses: 4, ties: 0, standingsFinish: 1, playoffResult: "champion" },
        doormatId,
      ),
    ).toBe("CHAMP");
  });

  it("tags the runner-up", () => {
    expect(
      fieldTagFor(
        { franchiseId: "b", wins: 9, losses: 5, ties: 0, standingsFinish: 2, playoffResult: "runner_up" },
        doormatId,
      ),
    ).toBe("R-UP");
  });

  it("tags the doormat by id", () => {
    expect(
      fieldTagFor(
        { franchiseId: "z", wins: 3, losses: 11, ties: 0, standingsFinish: 12, playoffResult: null },
        doormatId,
      ),
    ).toBe("DOORMAT");
  });

  it("returns null for a middling team", () => {
    expect(
      fieldTagFor(
        { franchiseId: "c", wins: 7, losses: 7, ties: 0, standingsFinish: 6, playoffResult: null },
        doormatId,
      ),
    ).toBeNull();
  });
});

describe("buildFieldEntry", () => {
  const team = {
    franchiseId: "a",
    slug: "gorilla-warfare",
    name: "Gorilla Warfare",
    abbreviation: "GW",
    brandingColor: "#E2B858",
  };

  it("shows a tag instead of a record when the team earned one", () => {
    const entry = buildFieldEntry(
      team,
      { franchiseId: "a", wins: 10, losses: 4, ties: 0, standingsFinish: 1, playoffResult: "champion" },
      null,
    );
    expect(entry.tag).toBe("CHAMP");
    expect(entry.recordLabel).toBeNull();
  });

  it("shows the record when the team has no tag", () => {
    const entry = buildFieldEntry(
      team,
      { franchiseId: "a", wins: 8, losses: 6, ties: 0, standingsFinish: 4, playoffResult: null },
      "z",
    );
    expect(entry.tag).toBeNull();
    expect(entry.recordLabel).toBe("8-6");
  });

  it("has neither tag nor record for a first-year franchise", () => {
    const entry = buildFieldEntry(team, undefined, null);
    expect(entry.tag).toBeNull();
    expect(entry.recordLabel).toBeNull();
  });
});
