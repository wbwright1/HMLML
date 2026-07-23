import { describe, it, expect } from "vitest";
import { getHubEditorial, overlayHubEditorial } from "./content";
import type { GroupedHubContent, HubContentRow } from "./queries/hub-content";

function r(
  kind: string,
  body: string,
  refKey: string | null = null,
  extras: Record<string, unknown> | null = null,
  createdAt: Date | null = null,
): HubContentRow {
  return { kind, body, refKey, extras, createdAt };
}

function grouped(rows: HubContentRow[]): GroupedHubContent {
  const g: GroupedHubContent = {};
  for (const row of rows) (g[row.kind] ??= []).push(row);
  return g;
}

describe("overlayHubEditorial", () => {
  it("returns the seeds unchanged when there is no DB content", async () => {
    const seeds = await getHubEditorial();
    const out = overlayHubEditorial(seeds, {});
    expect(out.burningQuestions).toEqual(seeds.burningQuestions);
    expect(out.boldPredictions).toEqual(seeds.boldPredictions);
    expect(out.offseasonReceipts).toEqual(seeds.offseasonReceipts);
    expect(out.smackPosts).toEqual(seeds.smackPosts);
    expect(out.divisions).toEqual(seeds.divisions);
    expect(out.heroDek).toBeNull();
  });

  it("overlays division notes onto the seed map by name", async () => {
    const seeds = await getHubEditorial();
    const out = overlayHubEditorial(
      seeds,
      grouped([r("division_note", "New rivalry note", "Division 1", { characterization: "chaos" })]),
    );
    expect(out.divisions["Division 1"].rivalryNote).toBe("New rivalry note");
    expect(out.divisions["Division 1"].characterization).toBe("chaos");
    // Untouched divisions keep their seed values.
    expect(out.divisions["Division 2"]).toEqual(seeds.divisions["Division 2"]);
  });

  it("replaces burning questions when rows exist", async () => {
    const seeds = await getHubEditorial();
    const out = overlayHubEditorial(
      seeds,
      grouped([r("burning_question", "Q1"), r("burning_question", "Q2")]),
    );
    expect(out.burningQuestions).toEqual(["Q1", "Q2"]);
  });

  it("maps bold predictions and drops invalid verdicts", async () => {
    const seeds = await getHubEditorial();
    const out = overlayHubEditorial(
      seeds,
      grouped([
        r("bold_prediction", "good", null, { kicker: "K", verdict: "LOCK" }),
        r("bold_prediction", "bad", null, { kicker: "K2", verdict: "MAYBE" }),
      ]),
    );
    expect(out.boldPredictions).toHaveLength(1);
    expect(out.boldPredictions[0]).toEqual({ kicker: "K", verdict: "LOCK", body: "good" });
  });

  it("maps offseason receipts and drops invalid categories", async () => {
    const seeds = await getHubEditorial();
    const out = overlayHubEditorial(
      seeds,
      grouped([
        r("offseason_receipt", "teaser", "foopus", { category: "TRADE" }),
        r("offseason_receipt", "bad", "foopus", { category: "NONSENSE" }),
      ]),
    );
    // Generated rows replace the rotating seeds, then pinned editorial
    // spotlights (currently the watson-love-diggs AGING_CORE card) append.
    expect(out.offseasonReceipts[0]).toEqual({ category: "TRADE", franchiseSlug: "foopus", body: "teaser" });
    const pinned = out.offseasonReceipts.slice(1);
    expect(pinned.length).toBeGreaterThan(0);
    for (const receipt of pinned) {
      expect(receipt.category).toBe("AGING_CORE");
    }
    expect(pinned.some((p) => p.franchiseSlug === "watson-love-diggs")).toBe(true);
  });

  it("merges matchup angles by pair and replaces the game-of-week blurb", async () => {
    const seeds = await getHubEditorial();
    const out = overlayHubEditorial(
      seeds,
      grouped([
        r("matchup_angle", "angle text", "a__b"),
        r("game_of_week_blurb", "the blurb"),
      ]),
    );
    expect(out.matchupAngles.byPair["a__b"]).toBe("angle text");
    expect(out.matchupAngles.gameOfWeekBlurb).toBe("the blurb");
  });

  it("replaces smack posts as Site Desk voice, timestamped from created_at", async () => {
    const seeds = await getHubEditorial();
    const created = new Date("2026-07-20T12:00:00.000Z");
    const out = overlayHubEditorial(seeds, grouped([r("smack_post", "post body", null, null, created)]));
    expect(out.smackPosts).toHaveLength(1);
    expect(out.smackPosts[0].franchiseSlug).toBe("site-desk");
    expect(out.smackPosts[0].body).toBe("post body");
    expect(out.smackPosts[0].postedAt).toBe(created.toISOString());
  });

  it("sets heroDek from the first hero_dek row", async () => {
    const seeds = await getHubEditorial();
    const out = overlayHubEditorial(seeds, grouped([r("hero_dek", "the dek")]));
    expect(out.heroDek).toBe("the dek");
  });

  it("skips rows with an empty body", async () => {
    const seeds = await getHubEditorial();
    const out = overlayHubEditorial(seeds, grouped([r("burning_question", "   ")]));
    // Empty question filtered out, so seeds remain.
    expect(out.burningQuestions).toEqual(seeds.burningQuestions);
  });
});
