import { describe, it, expect } from "vitest";
import { segmentEditorialBody } from "./editorial-emphasis";

/** Reassembling every segment's text always reproduces the original body. */
function reassemble(body: string): string {
  return segmentEditorialBody(body)
    .map((s) => s.text)
    .join("");
}

function emphasized(body: string): string[] {
  return segmentEditorialBody(body)
    .filter((s) => s.emphasis)
    .map((s) => s.text);
}

describe("segmentEditorialBody", () => {
  it("bolds the Mendoza Math body's stat tokens without splitting 'No.' from its number", () => {
    const body =
      "Of Mice and Mendoza sits at No. 9 with a 0.414 all-time win rate, 3x worse than last season's pace.";
    const segments = segmentEditorialBody(body);
    expect(reassemble(body)).toBe(body);
    expect(emphasized(body)).toEqual(["No. 9", "0.414", "3x"]);
    // "No." must never be split from its number into separate segments.
    const noSegmentIndex = segments.findIndex((s) => s.text === "No. 9");
    expect(noSegmentIndex).toBeGreaterThanOrEqual(0);
    expect(segments[noSegmentIndex].emphasis).toBe(true);
  });

  it("returns a single non-emphasized segment for a body with no stat tokens", () => {
    const body = "Nobody in this league plays it safe, and that is exactly the problem.";
    const segments = segmentEditorialBody(body);
    expect(segments).toEqual([{ text: body, emphasis: false }]);
  });

  it("emphasizes W-L(-T) records", () => {
    expect(emphasized("They're sitting at 12-4 heading into the bye.")).toEqual(["12-4"]);
    expect(emphasized("A grim 9-6-1 finish, all things considered.")).toEqual(["9-6-1"]);
  });

  it("emphasizes thousands-comma numbers, with an attached unit when adjacent", () => {
    expect(emphasized("They put up 2,459.9 points, a franchise record.")).toEqual([
      "2,459.9 points",
    ]);
    expect(emphasized("A cool 2,459.9 all-time.")).toEqual(["2,459.9"]);
  });

  it("emphasizes percentages and leading-dot decimals", () => {
    expect(emphasized("A league-worst 41.4% clip so far.")).toEqual(["41.4%"]);
    expect(emphasized("Mendoza owns the league-worst .414 win rate.")).toEqual([".414"]);
  });

  it("emphasizes plain decimals with an attached unit allowlist word", () => {
    expect(emphasized("He left 18.3 points on the bench.")).toEqual(["18.3 points"]);
    expect(emphasized("Their PF sits at 1800.2 PF through six weeks.")).toEqual([
      "1800.2 PF",
    ]);
    // Unit word not in the allowlist stays outside the emphasized span.
    expect(emphasized("A tidy 12.5 rebounds per outing.")).toEqual(["12.5"]);
  });

  it("does not emphasize bare small integers or years in prose", () => {
    const body = "In 2026, all 12 teams entered Week 9 within 2 games of a playoff spot.";
    expect(emphasized(body)).toEqual([]);
    expect(reassemble(body)).toBe(body);
  });

  it("does not choke on em-dash-free multi-clause bodies (no weird splitting around punctuation)", () => {
    const body =
      "The Wanderers finished 6-8, good for No. 4 in the division; their 0.429 win rate says otherwise.";
    const segments = segmentEditorialBody(body);
    expect(reassemble(body)).toBe(body);
    expect(emphasized(body)).toEqual(["6-8", "No. 4", "0.429"]);
  });

  it("handles an empty body", () => {
    expect(segmentEditorialBody("")).toEqual([{ text: "", emphasis: false }]);
  });
});
