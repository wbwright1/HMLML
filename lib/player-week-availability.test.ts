import { describe, it, expect } from "vitest";
import {
  classifyPlayerWeekAvailability,
  normalizeNflTeam,
  teamByeKey,
  seasonWeekKey,
  type PlayerWeekAvailabilityInput,
} from "./player-week-availability";

function baseInput(
  overrides: Partial<PlayerWeekAvailabilityInput> = {},
): PlayerWeekAvailabilityInput {
  return {
    week: 6,
    gamesPlayed: 0,
    gmsActive: 0,
    points: 0,
    curatedStats: [],
    teamByeWeek: 6,
    weekIsComplete: true,
    ...overrides,
  };
}

describe("classifyPlayerWeekAvailability", () => {
  describe("PLAYED guard order (runs before bye/DNP)", () => {
    it("gamesPlayed >= 1 wins even when the week matches the team bye", () => {
      expect(
        classifyPlayerWeekAvailability(baseInput({ gamesPlayed: 1 })),
      ).toBe("PLAYED");
    });

    it("gms_active >= 1 wins even when the week matches the team bye", () => {
      expect(
        classifyPlayerWeekAvailability(baseInput({ gmsActive: 1 })),
      ).toBe("PLAYED");
    });

    it("points > 0 wins even when the week matches the team bye", () => {
      expect(
        classifyPlayerWeekAvailability(baseInput({ points: 3.4 })),
      ).toBe("PLAYED");
    });

    it("any positive curated stat wins even when the week matches the team bye", () => {
      expect(
        classifyPlayerWeekAvailability(
          baseInput({ curatedStats: [null, 0, 12, null] }),
        ),
      ).toBe("PLAYED");
    });

    it("a real 0-point game (all played-signals zero/absent but gamesPlayed=1) still counts as played", () => {
      expect(
        classifyPlayerWeekAvailability(
          baseInput({
            gamesPlayed: 1,
            gmsActive: 0,
            points: 0,
            curatedStats: [0, null],
          }),
        ),
      ).toBe("PLAYED");
    });

    it("a stale/wrong team-bye map cannot override a played week", () => {
      // teamByeWeek says this week is a bye, but the player has real production.
      expect(
        classifyPlayerWeekAvailability(
          baseInput({ week: 6, teamByeWeek: 6, points: 9 }),
        ),
      ).toBe("PLAYED");
    });
  });

  describe("bye match", () => {
    it("classifies BYE when no played-signal is present and week equals the team bye week", () => {
      expect(
        classifyPlayerWeekAvailability(baseInput({ week: 9, teamByeWeek: 9 })),
      ).toBe("BYE");
    });

    it("does not classify BYE when week does not equal the team bye week", () => {
      expect(
        classifyPlayerWeekAvailability(baseInput({ week: 5, teamByeWeek: 9 })),
      ).toBe("DNP");
    });
  });

  describe("DNP fallback", () => {
    it("classifies DNP when there is no played-signal and no bye match", () => {
      expect(
        classifyPlayerWeekAvailability(baseInput({ teamByeWeek: null })),
      ).toBe("DNP");
    });

    it("classifies DNP (never a fabricated OUT) for a rostered week with zero everything", () => {
      const result = classifyPlayerWeekAvailability(
        baseInput({
          gamesPlayed: null,
          gmsActive: null,
          points: null,
          curatedStats: [null, null],
          teamByeWeek: null,
        }),
      );
      expect(result).toBe("DNP");
      expect(result).not.toBe("OUT" as unknown as string);
    });
  });

  describe("OAK/LV alias", () => {
    it("normalizeNflTeam maps OAK to LV", () => {
      expect(normalizeNflTeam("OAK")).toBe("LV");
    });

    it("normalizeNflTeam passes through unrelated teams unchanged", () => {
      expect(normalizeNflTeam("KC")).toBe("KC");
    });

    it("teamByeKey resolves an OAK-labeled player onto the LV bye-week key", () => {
      expect(teamByeKey(2020, "OAK")).toBe(teamByeKey(2020, "LV"));
    });
  });

  describe("null team", () => {
    it("normalizeNflTeam returns null for a null/undefined team", () => {
      expect(normalizeNflTeam(null)).toBeNull();
      expect(normalizeNflTeam(undefined)).toBeNull();
    });

    it("teamByeKey returns null for a null team (never assert a bye for an unknown team)", () => {
      expect(teamByeKey(2024, null)).toBeNull();
    });

    it("a player with a null team (teamByeWeek unresolved) falls to DNP, never BYE", () => {
      expect(
        classifyPlayerWeekAvailability(baseInput({ teamByeWeek: null })),
      ).toBe("DNP");
    });
  });

  describe("incomplete-week guard", () => {
    it("returns null for a week that has not happened yet, even if it matches the bye week", () => {
      expect(
        classifyPlayerWeekAvailability(
          baseInput({ week: 9, teamByeWeek: 9, weekIsComplete: false }),
        ),
      ).toBeNull();
    });

    it("returns null for an incomplete week with no played-signal (no premature DNP)", () => {
      expect(
        classifyPlayerWeekAvailability(baseInput({ weekIsComplete: false })),
      ).toBeNull();
    });
  });

  describe("seasonWeekKey", () => {
    it("formats a stable season:week key", () => {
      expect(seasonWeekKey(2024, 6)).toBe("2024:6");
    });
  });
});
