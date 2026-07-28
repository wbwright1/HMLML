import { describe, it, expect } from "vitest";
import { dedupeTimelineStints } from "./player-timeline-dedup";
import type { TimelineEvent, TimelineEventType, TimelineFranchiseRef } from "./queries/player-profile";

function franchise(id: string): TimelineFranchiseRef {
  return { id, name: id, slug: id, avatarUrl: null };
}

function ev(partial: Partial<TimelineEvent> & { type: TimelineEventType; seasonYear: number }): TimelineEvent {
  return {
    week: null,
    sleeperMs: null,
    franchise: null,
    transactionId: null,
    tradeDbId: null,
    tradeFromFranchise: null,
    tradeToFranchise: null,
    draftType: null,
    draftRound: null,
    draftPickNumber: null,
    draftPickInRound: null,
    awardType: null,
    awardNote: null,
    stintEndSeasonYear: null,
    ...partial,
  };
}

describe("dedupeTimelineStints", () => {
  it("drops a stint that coincides with a draft in the same franchise+season", () => {
    const x = franchise("x");
    const events = [
      ev({ type: "drafted", seasonYear: 2021, franchise: x }),
      ev({ type: "stint", seasonYear: 2021, franchise: x, stintEndSeasonYear: 2026 }),
    ];
    const result = dedupeTimelineStints(events);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("drafted");
  });

  it("redraft: startup draft 2021 + redraft 2023 + stint(2021) -> both drafts kept, stint removed", () => {
    const x = franchise("x");
    const events = [
      ev({ type: "drafted", seasonYear: 2021, franchise: x }),
      ev({ type: "drafted", seasonYear: 2023, franchise: x }),
      ev({ type: "stint", seasonYear: 2021, franchise: x, stintEndSeasonYear: 2026 }),
    ];
    const result = dedupeTimelineStints(events);
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.type === "drafted")).toBe(true);
  });

  it("drops a stint that coincides with the gaining side of a trade", () => {
    const y = franchise("y");
    const events = [
      ev({ type: "traded", seasonYear: 2024, tradeToFranchise: y, franchise: y }),
      ev({ type: "stint", seasonYear: 2024, franchise: y, stintEndSeasonYear: 2026 }),
    ];
    const result = dedupeTimelineStints(events);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("traded");
  });

  it("losing side of a trade does not suppress a stint in a different season", () => {
    const x = franchise("x");
    const y = franchise("y");
    const events = [
      ev({ type: "traded", seasonYear: 2024, tradeFromFranchise: x, tradeToFranchise: y, franchise: y }),
      ev({ type: "stint", seasonYear: 2023, franchise: x, stintEndSeasonYear: 2024 }),
    ];
    const result = dedupeTimelineStints(events);
    expect(result).toHaveLength(2);
  });

  it("drops a stint that coincides with a waiver add", () => {
    const x = franchise("x");
    const events = [
      ev({ type: "waiver_add", seasonYear: 2022, franchise: x }),
      ev({ type: "stint", seasonYear: 2022, franchise: x, stintEndSeasonYear: 2023 }),
    ];
    const result = dedupeTimelineStints(events);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("waiver_add");
  });

  it("keeps a lone stint with no coinciding acquisition", () => {
    const x = franchise("x");
    const events = [ev({ type: "stint", seasonYear: 2019, franchise: x, stintEndSeasonYear: 2020 })];
    const result = dedupeTimelineStints(events);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("stint");
  });

  it("keeps a stint whose year does not match a later draft year for the same franchise", () => {
    const x = franchise("x");
    const events = [
      ev({ type: "stint", seasonYear: 2020, franchise: x, stintEndSeasonYear: 2020 }),
      ev({ type: "drafted", seasonYear: 2021, franchise: x }),
    ];
    const result = dedupeTimelineStints(events);
    expect(result).toHaveLength(2);
  });

  it("keeps a stint with a null franchise", () => {
    const events = [ev({ type: "stint", seasonYear: 2021, franchise: null, stintEndSeasonYear: 2022 })];
    const result = dedupeTimelineStints(events);
    expect(result).toHaveLength(1);
  });

  it("never removes drop, award, or traded events", () => {
    const x = franchise("x");
    const events = [
      ev({ type: "drop", seasonYear: 2022, franchise: x }),
      ev({ type: "award", seasonYear: 2022, franchise: x }),
      ev({ type: "traded", seasonYear: 2022, tradeFromFranchise: x, franchise: x }),
    ];
    const result = dedupeTimelineStints(events);
    expect(result).toHaveLength(3);
  });

  it("draft + trade-in in different seasons each suppress their matching stint", () => {
    const x = franchise("x");
    const y = franchise("y");
    const events = [
      ev({ type: "drafted", seasonYear: 2021, franchise: x }),
      ev({ type: "traded", seasonYear: 2024, tradeToFranchise: y, franchise: y }),
      ev({ type: "stint", seasonYear: 2021, franchise: x, stintEndSeasonYear: 2023 }),
      ev({ type: "stint", seasonYear: 2024, franchise: y, stintEndSeasonYear: 2026 }),
    ];
    const result = dedupeTimelineStints(events);
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.type !== "stint")).toBe(true);
  });
});
