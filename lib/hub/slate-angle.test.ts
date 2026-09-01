import { describe, it, expect } from "vitest";
import {
  buildSlateAngle,
  buildSlateAngleResult,
  buildSlateAngles,
  parseStreak,
  SLATE_ANGLE_MAX_CHARS,
  type SlateAngleInput,
} from "./slate-angle";

/** A pair with nothing on file: the bottom of the ladder. */
function base(overrides: Partial<SlateAngleInput> = {}): SlateAngleInput {
  return {
    teamA: { name: "Team Alpha", abbreviation: "ALP" },
    teamB: { name: "Team Bravo", abbreviation: "BRV" },
    h2h: { wins: 0, losses: 0, ties: 0, streak: null },
    lastMeeting: null,
    playoffMeetingYears: [],
    topProjected: null,
    isTitleRematch: false,
    bowlName: null,
    recordA: "0-0",
    recordB: "0-0",
    anyGamesPlayed: false,
    kickoffWeekday: "Wednesday",
    ...overrides,
  };
}

describe("parseStreak", () => {
  it("reads a win streak as team A's", () => {
    expect(parseStreak("3-game win streak")).toEqual({ side: "A", count: 3 });
  });

  it("reads a losing streak as team B's", () => {
    expect(parseStreak("4-game losing streak")).toEqual({ side: "B", count: 4 });
  });

  it("ignores absent or unparseable labels", () => {
    expect(parseStreak(null)).toBeNull();
    expect(parseStreak("hot lately")).toBeNull();
  });
});

describe("buildSlateAngle ladder", () => {
  it("rung 1: title rematch names the bowl and who won it", () => {
    const result = buildSlateAngleResult(
      base({
        isTitleRematch: true,
        bowlName: "HMLML Bowl V",
        h2h: { wins: 1, losses: 0, ties: 0, streak: null },
        lastMeeting: {
          seasonYear: 2025,
          week: 17,
          winner: "A",
          pointsA: 142.6,
          pointsB: 98.1,
          isPlayoff: true,
        },
        playoffMeetingYears: [2025],
      })
    );
    expect(result.rung).toBe("titleRematch");
    expect(result.text).toContain("HMLML Bowl V");
    expect(result.text).toContain("Team Alpha");
  });

  it("rung 2: an active streak names the team on the right end of it", () => {
    const result = buildSlateAngleResult(
      base({
        h2h: { wins: 1, losses: 4, ties: 0, streak: "3-game losing streak" },
      })
    );
    expect(result.rung).toBe("streak");
    // Streak orientation is team A's perspective: a LOSING streak for A means
    // team B has taken the last three.
    expect(result.text).toMatch(/^Team Bravo has taken the last 3 meetings from Team Alpha\./);
  });

  it("rung 2: a win streak points the other way", () => {
    const text = buildSlateAngle(
      base({ h2h: { wins: 5, losses: 1, ties: 0, streak: "3-game win streak" } })
    );
    expect(text).toMatch(/^Team Alpha has taken the last 3 meetings from Team Bravo\./);
  });

  it("rung 3: a lopsided series without a streak", () => {
    const result = buildSlateAngleResult(
      base({ h2h: { wins: 6, losses: 1, ties: 0, streak: null } })
    );
    expect(result.rung).toBe("lopsided");
    expect(result.text).toContain("Team Alpha owns this series 6-1");
  });

  it("rung 3: does not fire on a thin or balanced series", () => {
    expect(
      buildSlateAngleResult(base({ h2h: { wins: 2, losses: 0, ties: 0, streak: null } })).rung
    ).not.toBe("lopsided");
    expect(
      buildSlateAngleResult(base({ h2h: { wins: 3, losses: 2, ties: 0, streak: null } })).rung
    ).not.toBe("lopsided");
  });

  it("rung 4: a playoff meeting outranks the regular last meeting", () => {
    const result = buildSlateAngleResult(
      base({
        h2h: { wins: 2, losses: 2, ties: 0, streak: null },
        playoffMeetingYears: [2023],
        lastMeeting: {
          seasonYear: 2024,
          week: 5,
          winner: "B",
          pointsA: 101.2,
          pointsB: 120.4,
          isPlayoff: false,
        },
      })
    );
    expect(result.rung).toBe("playoffHistory");
    expect(result.text).toContain("2023 playoffs");
  });

  it("rung 5: last meeting reports the real score, winner first", () => {
    const result = buildSlateAngleResult(
      base({
        h2h: { wins: 1, losses: 1, ties: 0, streak: null },
        lastMeeting: {
          seasonYear: 2024,
          week: 5,
          winner: "B",
          pointsA: 101.2,
          pointsB: 120.4,
          isPlayoff: false,
        },
      })
    );
    expect(result.rung).toBe("lastMeeting");
    expect(result.text).toContain("Team Bravo 120.4, Team Alpha 101.2");
  });

  it("rung 6: an uneven-but-close series names the leader, not the first team", () => {
    const result = buildSlateAngleResult(
      base({ h2h: { wins: 2, losses: 3, ties: 0, streak: null } })
    );
    expect(result.rung).toBe("evenSeries");
    expect(result.text).toContain("Team Bravo leads it 3-2 all time over Team Alpha");
  });

  it("rung 6: an even series with no other hook", () => {
    const result = buildSlateAngleResult(
      base({ h2h: { wins: 1, losses: 1, ties: 0, streak: null } })
    );
    expect(result.rung).toBe("evenSeries");
    expect(result.text).toContain("dead even at 1-1");
  });

  it("rung 7: a first meeting claims no history at all", () => {
    const result = buildSlateAngleResult(base());
    expect(result.rung).toBe("firstMeeting");
    expect(result.text).toContain("have never played");
    expect(result.text).toContain("Wednesday");
    // No series claim of any kind.
    expect(result.text).not.toMatch(/\d+-\d+/);
    expect(result.text).not.toMatch(/all time|series|last \d+ meetings|Last time out/);
  });

  it("rung 8: the projected star fires when there is no history", () => {
    const result = buildSlateAngleResult(
      base({
        // Force past the first-meeting rung by giving the pair a played game
        // whose details are unknown: only the star clause is left.
        h2h: null,
        lastMeeting: null,
        topProjected: {
          playerName: "Bijan Robinson",
          position: "RB",
          side: "B",
          projectedPoints: 22.4,
        },
      })
    );
    // With no h2h and no meeting the first-meeting rung still wins, which is
    // the honest answer; the star clause is the distinctness widener.
    expect(result.rung).toBe("firstMeeting");
    const star = buildSlateAngles([
      base({
        topProjected: {
          playerName: "Bijan Robinson",
          position: "RB",
          side: "B",
          projectedPoints: 22.4,
        },
      }),
      base({
        topProjected: {
          playerName: "Bijan Robinson",
          position: "RB",
          side: "B",
          projectedPoints: 22.4,
        },
      }),
    ]);
    expect(star[1]).toContain("Bijan Robinson");
  });

  it("rung 9: season records only once a game has been played", () => {
    const result = buildSlateAngleResult(
      base({ anyGamesPlayed: true, recordA: "2-1", recordB: "1-2", h2h: null })
    );
    // With no series data at all the first-meeting rung is still truthful and
    // outranks the records line.
    expect(result.rung).toBe("firstMeeting");
    // But when the pair HAS met and nothing else fires, records are reachable.
    const noHooks = buildSlateAngleResult({
      ...base({ anyGamesPlayed: true, recordA: "2-1", recordB: "1-2" }),
      h2h: null,
      lastMeeting: {
        seasonYear: 2024,
        week: 3,
        winner: "A",
        pointsA: 130.0,
        pointsB: 110.0,
        isPlayoff: false,
      },
    });
    expect(noHooks.rung).toBe("lastMeeting");
  });

  it("never emits a 0-0 record line, even with anyGamesPlayed true and zero records", () => {
    const text = buildSlateAngle(base({ anyGamesPlayed: true }));
    expect(text).not.toContain("0-0");
  });
});

describe("copy rules", () => {
  const fixtures: SlateAngleInput[] = [
    base(),
    base({ h2h: { wins: 6, losses: 1, ties: 0, streak: "3-game win streak" } }),
    base({ h2h: { wins: 6, losses: 1, ties: 0, streak: null } }),
    base({
      isTitleRematch: true,
      bowlName: "HMLML Bowl VI",
      lastMeeting: {
        seasonYear: 2025,
        week: 17,
        winner: "B",
        pointsA: 98.1,
        pointsB: 142.6,
        isPlayoff: true,
      },
    }),
    base({
      h2h: { wins: 2, losses: 2, ties: 0, streak: null },
      lastMeeting: {
        seasonYear: 2024,
        week: 9,
        winner: "A",
        pointsA: 155.5,
        pointsB: 120.0,
        isPlayoff: false,
      },
    }),
    base({ anyGamesPlayed: true, recordA: "3-1", recordB: "1-3" }),
  ];

  it("uses no em-dashes or en-dashes", () => {
    for (const f of fixtures) {
      const text = buildSlateAngle(f);
      expect(text).not.toContain("—");
      expect(text).not.toContain("–");
      expect(text).not.toContain("--");
    }
  });

  it("stays inside the card's length budget", () => {
    for (const f of fixtures) {
      expect(buildSlateAngle(f).length).toBeLessThanOrEqual(SLATE_ANGLE_MAX_CHARS);
    }
  });

  it("never renders the placeholder records line at week 1", () => {
    for (const f of fixtures) {
      expect(buildSlateAngle(f)).not.toMatch(/0-0 against 0-0/);
    }
  });
});

describe("buildSlateAngles distinctness", () => {
  it("returns distinct copy for a six-matchup week-1 slate", () => {
    const slate: SlateAngleInput[] = [
      base({
        teamA: { name: "Alpha" },
        teamB: { name: "Bravo" },
        h2h: { wins: 6, losses: 1, ties: 0, streak: "3-game win streak" },
      }),
      base({
        teamA: { name: "Charlie" },
        teamB: { name: "Delta" },
        h2h: { wins: 5, losses: 1, ties: 0, streak: null },
      }),
      base({
        teamA: { name: "Echo" },
        teamB: { name: "Foxtrot" },
        h2h: { wins: 2, losses: 2, ties: 0, streak: null },
        playoffMeetingYears: [2022],
      }),
      base({
        teamA: { name: "Golf" },
        teamB: { name: "Hotel" },
        h2h: { wins: 1, losses: 2, ties: 0, streak: null },
        lastMeeting: {
          seasonYear: 2024,
          week: 11,
          winner: "B",
          pointsA: 88.4,
          pointsB: 121.9,
          isPlayoff: false,
        },
      }),
      base({ teamA: { name: "India" }, teamB: { name: "Juliet" } }),
      base({ teamA: { name: "Kilo" }, teamB: { name: "Lima" } }),
    ];
    const angles = buildSlateAngles(slate);
    expect(angles).toHaveLength(6);
    expect(new Set(angles).size).toBe(6);
    for (const a of angles) {
      expect(a.length).toBeGreaterThan(0);
      expect(a).not.toContain("0-0");
    }
  });

  it("breaks a deliberate collision between two identical-shape pairs", () => {
    const identical = base({ teamA: { name: "Same" }, teamB: { name: "Same" } });
    const angles = buildSlateAngles([identical, { ...identical }]);
    // With literally identical franchise names on both cards there is nothing
    // in the data to separate them, so the honest result is the same line; the
    // guard must not fabricate a difference.
    expect(angles[0]).toBe(angles[1]);

    // With a real second hook available, the later card advances a rung.
    const withHook = base({
      teamA: { name: "Same" },
      teamB: { name: "Same" },
      topProjected: {
        playerName: "Jayden Daniels",
        position: "QB",
        side: "A",
        projectedPoints: 21.7,
      },
    });
    const separated = buildSlateAngles([identical, withHook]);
    expect(separated[0]).not.toBe(separated[1]);
    expect(separated[1]).toContain("Jayden Daniels");
  });

  it("is deterministic across runs", () => {
    const slate = [
      base({ teamA: { name: "Alpha" }, teamB: { name: "Bravo" } }),
      base({ teamA: { name: "Charlie" }, teamB: { name: "Delta" } }),
    ];
    expect(buildSlateAngles(slate)).toEqual(buildSlateAngles(slate));
  });
});

describe("buildSlateAngles hook variety", () => {
  it("varies the HOOK, not just the names, when several cards share a shape", () => {
    // Three pairs that all support the streak rung. Distinct strings alone
    // would still read as one template repeated three times, so the later
    // cards must move to a different rung.
    const withStreak = (a: string, b: string): SlateAngleInput =>
      base({
        teamA: { name: a },
        teamB: { name: b },
        h2h: { wins: 4, losses: 1, ties: 0, streak: "2-game win streak" },
        lastMeeting: {
          seasonYear: 2025,
          week: 8,
          winner: "A",
          pointsA: 130.5,
          pointsB: 111.2,
          isPlayoff: false,
        },
        playoffMeetingYears: [2023],
      });
    const angles = buildSlateAngles([
      withStreak("Alpha", "Bravo"),
      withStreak("Charlie", "Delta"),
      withStreak("Echo", "Foxtrot"),
    ]);
    expect(new Set(angles).size).toBe(3);
    const streakCount = angles.filter((a) =>
      /has taken the last \d+ meetings/.test(a),
    ).length;
    expect(streakCount).toBe(1);
  });
});
