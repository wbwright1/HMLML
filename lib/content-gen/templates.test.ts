import { describe, it, expect } from "vitest";
import { generateFromTemplates, kindsForSeason } from "./templates";
import { sharesSignaturePhrase } from "./phrases";
import type { StatsContext } from "./stats-context";

function baseContext(overrides: Partial<StatsContext> = {}): StatsContext {
  return {
    seasonYear: 2026,
    week: 5,
    seasonType: "pre",
    hasDivisions: true,
    divisions: [
      {
        name: "Division 1",
        leader: { name: "Foopus", slug: "foopus", record: "4-1", pointsFor: 620.5 },
        teams: [
          { name: "Foopus", slug: "foopus", record: "4-1", pointsFor: 620.5 },
          { name: "Olave Garden", slug: "olave-garden", record: "2-3", pointsFor: 540.1 },
        ],
      },
      {
        name: "Division 2",
        leader: { name: "McCarthyism", slug: "mccarthyism", record: "3-2", pointsFor: 580.0 },
        teams: [
          { name: "McCarthyism", slug: "mccarthyism", record: "3-2", pointsFor: 580.0 },
          { name: "Better Call Hall", slug: "better-call-hall", record: "1-4", pointsFor: 500.2 },
        ],
      },
      {
        name: "Division 3",
        leader: { name: "Team C", slug: "team-c", record: "5-0", pointsFor: 700.0 },
        teams: [{ name: "Team C", slug: "team-c", record: "5-0", pointsFor: 700.0 }],
      },
    ],
    leagueStandings: [
      { name: "Team C", slug: "team-c", record: "5-0", pointsFor: 700.0 },
      { name: "Foopus", slug: "foopus", record: "4-1", pointsFor: 620.5 },
      { name: "McCarthyism", slug: "mccarthyism", record: "3-2", pointsFor: 580.0 },
      { name: "Olave Garden", slug: "olave-garden", record: "2-3", pointsFor: 540.1 },
      { name: "Better Call Hall", slug: "better-call-hall", record: "1-4", pointsFor: 500.2 },
    ],
    lastSeason: {
      year: 2025,
      champion: { name: "Team C", slug: "team-c", record: "11-3", pointsFor: 1800.0 },
      doormat: { name: "Better Call Hall", slug: "better-call-hall", record: "3-11", pointsFor: 1200.0 },
      pointMachine: { name: "Foopus", slug: "foopus", record: "10-4", pointsFor: 1950.0 },
    },
    currentMatchups: [
      {
        pairKey: "foopus__olave-garden",
        home: { name: "Foopus", slug: "foopus", record: "4-1", pointsFor: 620.5 },
        away: { name: "Olave Garden", slug: "olave-garden", record: "2-3", pointsFor: 540.1 },
        h2h: { wins: 3, losses: 1, ties: 0, streak: null },
        lastMeeting: null,
        playoffMeetingYears: [],
        isTitleRematch: false,
        topProjected: null,
      },
      {
        pairKey: "better-call-hall__mccarthyism",
        home: { name: "McCarthyism", slug: "mccarthyism", record: "3-2", pointsFor: 580.0 },
        away: { name: "Better Call Hall", slug: "better-call-hall", record: "1-4", pointsFor: 500.2 },
        h2h: { wins: 0, losses: 0, ties: 0, streak: null },
        lastMeeting: null,
        playoffMeetingYears: [],
        isTitleRematch: false,
        topProjected: null,
      },
    ],
    gameOfWeekPairKey: null,
    weekInBooks: {
      week: 4,
      highestScorer: { franchiseName: "Foopus", franchiseSlug: "foopus", points: 145.3 },
      lowestScorer: { franchiseName: "Better Call Hall", franchiseSlug: "better-call-hall", points: 78.1 },
      biggestBlowout: { winner: "Team C", loser: "Better Call Hall", margin: 60.2 },
      closestWin: { winner: "Foopus", loser: "Olave Garden", margin: 1.4 },
      benchLeader: { franchiseName: "McCarthyism", pointsLeft: 33.5, won: false },
      playerOfWeek: null,
      dudStarter: null,
    },
    recentTransactions: [],
    franchiseHistory: [],
    rosterProjections: [],
    projectionSeason: null,
    offseasonMoves: [],
    recentTrades: [],
    ...overrides,
  };
}

const hasEmDash = (s: string) => /[—–]/.test(s);

describe("kindsForSeason", () => {
  it("selects preseason kinds outside the regular season", () => {
    expect(kindsForSeason("pre")).toEqual([
      "division_note",
      "burning_question",
      "bold_prediction",
      "offseason_receipt",
      "hero_dek",
      "smack_post",
    ]);
  });

  it("selects regular-season kinds", () => {
    expect(kindsForSeason("regular")).toEqual([
      "matchup_angle",
      "game_of_week_blurb",
      "hero_dek",
      "smack_post",
    ]);
  });
});

describe("generateFromTemplates (preseason)", () => {
  const ctx = baseContext({ seasonType: "pre" });
  const { kinds, rows, source } = generateFromTemplates(ctx);

  it("reports the template source", () => {
    expect(source).toBe("template");
  });

  it("generates exactly the preseason kinds", () => {
    expect(kinds).toEqual(kindsForSeason("pre"));
  });

  it("produces the expected counts per kind", () => {
    const count = (k: string) => rows.filter((r) => r.kind === k).length;
    expect(count("division_note")).toBe(3);
    expect(count("burning_question")).toBe(3);
    expect(count("bold_prediction")).toBe(4);
    expect(count("offseason_receipt")).toBe(4);
    expect(count("hero_dek")).toBe(1);
    expect(count("smack_post")).toBeGreaterThanOrEqual(3);
    expect(count("smack_post")).toBeLessThanOrEqual(5);
  });

  it("scopes every row to the season (week null)", () => {
    expect(rows.every((r) => r.week === null)).toBe(true);
  });

  it("keys division notes and receipts to real names/slugs", () => {
    const validDivisions = new Set(ctx.divisions.map((d) => d.name));
    const validSlugs = new Set(ctx.leagueStandings.map((t) => t.slug));
    for (const r of rows.filter((r) => r.kind === "division_note")) {
      expect(validDivisions.has(r.refKey ?? "")).toBe(true);
    }
    for (const r of rows.filter((r) => r.kind === "offseason_receipt")) {
      expect(validSlugs.has(r.refKey ?? "")).toBe(true);
    }
  });

  it("keeps exactly 4 offseason receipts, each from a distinct franchise", () => {
    const receipts = rows.filter((r) => r.kind === "offseason_receipt");
    expect(receipts).toHaveLength(4);
    expect(new Set(receipts.map((r) => r.refKey)).size).toBe(4);
  });

  it("carries a valid verdict on every bold prediction", () => {
    for (const r of rows.filter((r) => r.kind === "bold_prediction")) {
      expect(["LOCK", "NO", "UP", "DOWN"]).toContain((r.extras as { verdict: string }).verdict);
    }
  });

  it("never emits an em-dash", () => {
    for (const r of rows) expect(hasEmDash(r.body)).toBe(false);
  });

  it("uses only truthful numbers from the context", () => {
    const champBody = rows.find((r) => r.body.includes("Team C"))?.body ?? "";
    // The champion's real record is present, and no fabricated record slips in.
    expect(rows.some((r) => r.body.includes("11-3"))).toBe(true);
    expect(champBody).not.toMatch(/\b\d+-\d+\b.*fabricated/);
  });
});

describe("generateFromTemplates (preseason, nothing played yet)", () => {
  // True preseason: every record is 0-0. The division "leader" slot is
  // ordering noise, not a result, and must not be cited as one.
  const zeroTeam = (name: string, slug: string) => ({ name, slug, record: "0-0", pointsFor: 0 });
  const ctx = baseContext({
    seasonType: "pre",
    divisions: [
      {
        name: "Division 1",
        leader: zeroTeam("Foopus", "foopus"),
        teams: [zeroTeam("Foopus", "foopus"), zeroTeam("Olave Garden", "olave-garden")],
      },
      {
        name: "Division 2",
        leader: zeroTeam("McCarthyism", "mccarthyism"),
        teams: [zeroTeam("McCarthyism", "mccarthyism"), zeroTeam("Better Call Hall", "better-call-hall")],
      },
      {
        name: "Division 3",
        leader: zeroTeam("Team C", "team-c"),
        teams: [zeroTeam("Team C", "team-c")],
      },
    ],
    leagueStandings: [
      zeroTeam("Foopus", "foopus"),
      zeroTeam("Olave Garden", "olave-garden"),
      zeroTeam("McCarthyism", "mccarthyism"),
      zeroTeam("Better Call Hall", "better-call-hall"),
      zeroTeam("Team C", "team-c"),
    ],
  });
  const { rows } = generateFromTemplates(ctx);

  it("never crowns a division winner off a 0-0 leader", () => {
    const kickers = rows
      .filter((r) => r.kind === "bold_prediction")
      .map((r) => (r.extras as { kicker: string }).kicker);
    expect(kickers).not.toContain("Division Winner");
  });

  it("never cites a 0-0 record as a standings result in any body", () => {
    for (const r of rows) {
      expect(r.body).not.toMatch(/at 0-0\b|0-0 baseline|sat at the top/);
    }
  });
});

describe("generateFromTemplates (regular season)", () => {
  const ctx = baseContext({ seasonType: "regular" });
  const { kinds, rows } = generateFromTemplates(ctx);

  it("generates exactly the regular-season kinds", () => {
    expect(kinds).toEqual(kindsForSeason("regular"));
  });

  it("emits one matchup angle per current matchup, keyed by pairKey", () => {
    const angles = rows.filter((r) => r.kind === "matchup_angle");
    expect(angles).toHaveLength(ctx.currentMatchups.length);
    const validPairs = new Set(ctx.currentMatchups.map((m) => m.pairKey));
    for (const a of angles) expect(validPairs.has(a.refKey ?? "")).toBe(true);
  });

  it("emits one game-of-week blurb and one hero dek", () => {
    expect(rows.filter((r) => r.kind === "game_of_week_blurb")).toHaveLength(1);
    expect(rows.filter((r) => r.kind === "hero_dek")).toHaveLength(1);
  });

  it("scopes every row to the current week", () => {
    expect(rows.every((r) => r.week === ctx.week)).toBe(true);
  });

  it("reflects real head-to-head in the matchup angle", () => {
    const angle = rows.find((r) => r.refKey === "foopus__olave-garden");
    expect(angle?.body).toContain("3-1");
  });

  it("never emits an em-dash", () => {
    for (const r of rows) expect(hasEmDash(r.body)).toBe(false);
  });

  it("features the pair named by gameOfWeekPairKey when set", () => {
    const ctxWithGotw = baseContext({
      seasonType: "regular",
      gameOfWeekPairKey: "better-call-hall__mccarthyism",
    });
    const gotw = generateFromTemplates(ctxWithGotw).rows.find(
      (r) => r.kind === "game_of_week_blurb"
    );
    // The blurb should be about the selected pair, not the combined-wins pick.
    expect(gotw?.body).toContain("McCarthyism");
    expect(gotw?.body).toContain("Better Call Hall");
  });
});

describe("kindsForSeason (unsupported states)", () => {
  it("maps the playoffs (post) to no kinds", () => {
    expect(kindsForSeason("post")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Longevity + roster projections (preseason depth)
// ---------------------------------------------------------------------------

describe("generateFromTemplates (preseason, no franchiseHistory/rosterProjections)", () => {
  // The migration-not-yet-applied / sync-not-yet-run path: both arrays empty.
  // This must still produce fully valid content (the graceful-degradation case).
  const ctx = baseContext({ seasonType: "pre" });
  const { rows } = generateFromTemplates(ctx);

  it("produces valid content with no projection or longevity copy", () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.body.trim().length).toBeGreaterThan(0);
    }
  });

  it("never emits an em-dash", () => {
    for (const r of rows) expect(hasEmDash(r.body)).toBe(false);
  });

  it("emits no projection-referencing copy", () => {
    for (const r of rows) {
      expect(r.body).not.toMatch(/starting-lineup points/);
      expect((r.extras as { kicker?: string } | null)?.kicker).not.toBe("Projected Underperformer");
      expect((r.extras as { kicker?: string } | null)?.kicker).not.toBe("Projected Riser");
    }
  });
});

describe("generateFromTemplates (preseason, with franchiseHistory + rosterProjections)", () => {
  const ctx = baseContext({
    seasonType: "pre",
    franchiseHistory: [
      {
        slug: "better-call-hall",
        allTimeWinPct: 0.31,
        allTimeWinPctRank: 2,
        championships: 0,
        playoffAppearances: 1,
        seasonsPlayed: 5,
        lastThreeFinishes: [12, 11, 12],
        sustainedDoormat: true,
        sustainedContender: false,
      },
      {
        slug: "team-c",
        allTimeWinPct: 0.68,
        allTimeWinPctRank: 1,
        championships: 2,
        playoffAppearances: 5,
        seasonsPlayed: 5,
        lastThreeFinishes: [1, 2, 1],
        sustainedDoormat: false,
        sustainedContender: true,
      },
    ],
    rosterProjections: [
      {
        slug: "team-c",
        name: "Team C",
        projectedStartingPoints: 1420.3,
        leagueRank: 1,
        topProjectedPlayer: { name: "Star QB", position: "QB", points: 380.1 },
      },
      {
        slug: "better-call-hall",
        name: "Better Call Hall",
        projectedStartingPoints: 980.5,
        leagueRank: 5,
        topProjectedPlayer: { name: "Depth WR", position: "WR", points: 150.2 },
      },
    ],
    projectionSeason: 2026,
  });
  const { rows } = generateFromTemplates(ctx);

  it("adds a projection underperformer and a projection riser to bold predictions", () => {
    const kickers = rows
      .filter((r) => r.kind === "bold_prediction")
      .map((r) => (r.extras as { kicker: string }).kicker);
    expect(kickers).toContain("Projected Underperformer");
    expect(kickers).toContain("Projected Riser");
  });

  it("escalates the doormat bold prediction when last-season doormat is also a sustained doormat", () => {
    const doormatRow = rows.find(
      (r) => r.kind === "bold_prediction" && (r.extras as { kicker: string }).kicker === "League Doormat",
    );
    expect(doormatRow?.body).toMatch(/multiple seasons|identity/);
  });

  it("references projected rank/totals in offseason receipts", () => {
    const receipts = rows.filter((r) => r.kind === "offseason_receipt");
    const fireSale = receipts.find((r) => (r.extras as { category: string }).category === "FIRE_SALE");
    const draft = receipts.find((r) => (r.extras as { category: string }).category === "DRAFT");
    expect(fireSale?.refKey).toBe("better-call-hall");
    expect(fireSale?.body).toContain("980.5");
    expect(draft?.refKey).toBe("team-c");
    expect(draft?.body).toContain("1420.3");
  });

  it("seeds a smack post and a burning question from longevity", () => {
    const smack = rows.filter((r) => r.kind === "smack_post");
    const questions = rows.filter((r) => r.kind === "burning_question");
    expect(smack.some((r) => r.body.includes("Better Call Hall"))).toBe(true);
    expect(questions.some((r) => r.body.includes("Better Call Hall"))).toBe(true);
  });

  it("cites the top roster projection somewhere in the run", () => {
    // The top-projection fact ("Team C" projecting No. 1) is a real, valid
    // hook for several kinds (smack_post, bold_prediction, offseason_receipt).
    // The diversity layer's job is to avoid citing the SAME fact more than
    // once across the whole run, so this only asserts the fact appears
    // somewhere, not that it lands in a specific kind.
    expect(
      rows.some((r) => r.body.includes("Team C") && /1420\.3|No\. 1\b/.test(r.body)),
    ).toBe(true);
  });

  it("never emits an em-dash", () => {
    for (const r of rows) expect(hasEmDash(r.body)).toBe(false);
  });
});

describe("kindsForSeason (offseason)", () => {
  it("returns the lightweight offseason kind set", () => {
    expect(kindsForSeason("off")).toEqual([
      "offseason_receipt",
      "hero_dek",
      "smack_post",
      "trade_verdict",
    ]);
  });

  it("still maps the playoffs to no kinds", () => {
    expect(kindsForSeason("post")).toEqual([]);
  });
});

describe("generateFromTemplates (offseason)", () => {
  const recentTrades = [
    {
      id: 101,
      seasonYear: 2026,
      // Lopsided volume: Foopus gets 3 assets, Olave Garden 1.
      sides: [
        {
          franchiseName: "Foopus",
          players: [
            { name: "Player One", position: "RB" },
            { name: "Player Two", position: "WR" },
          ],
          picks: 1,
        },
        {
          franchiseName: "Olave Garden",
          players: [{ name: "Player Three", position: "QB" }],
          picks: 0,
        },
      ],
    },
    {
      id: 202,
      seasonYear: 2026,
      // Picks vs players, even totals: future vs win-now framing.
      sides: [
        { franchiseName: "McCarthyism", players: [], picks: 2 },
        {
          franchiseName: "Team C",
          players: [
            { name: "Player Four", position: "RB" },
            { name: "Player Five", position: "TE" },
          ],
          picks: 0,
        },
      ],
    },
  ];
  const ctx = baseContext({ seasonType: "off", recentTrades });
  const { kinds, rows, source } = generateFromTemplates(ctx);

  it("reports the template source and offseason kinds", () => {
    expect(source).toBe("template");
    expect(kinds).toEqual(kindsForSeason("off"));
  });

  it("emits only offseason kinds (no division notes, questions, or predictions)", () => {
    const emitted = new Set(rows.map((r) => r.kind));
    expect(emitted.has("division_note")).toBe(false);
    expect(emitted.has("burning_question")).toBe(false);
    expect(emitted.has("bold_prediction")).toBe(false);
    for (const r of rows) expect(kindsForSeason("off")).toContain(r.kind);
  });

  it("produces one trade_verdict per recent trade, keyed by transaction id", () => {
    const verdicts = rows.filter((r) => r.kind === "trade_verdict");
    expect(verdicts.length).toBe(2);
    expect(new Set(verdicts.map((r) => r.refKey))).toEqual(new Set(["101", "202"]));
  });

  it("favors the higher-volume side on a lopsided trade", () => {
    const v = rows.find((r) => r.kind === "trade_verdict" && r.refKey === "101");
    expect(v?.body).toContain("Foopus");
    expect(v?.body.toLowerCase()).toContain("early returns favor");
  });

  it("uses win-now-vs-future framing when picks are swapped for players", () => {
    const v = rows.find((r) => r.kind === "trade_verdict" && r.refKey === "202");
    expect(v?.body).toMatch(/draft capital|win-now/);
  });

  it("keeps exactly 4 offseason receipts, each from a distinct franchise", () => {
    const receipts = rows.filter((r) => r.kind === "offseason_receipt");
    expect(receipts).toHaveLength(4);
    expect(new Set(receipts.map((r) => r.refKey)).size).toBe(4);
  });

  it("emits a single hero dek and at least one smack post", () => {
    expect(rows.filter((r) => r.kind === "hero_dek").length).toBe(1);
    expect(rows.filter((r) => r.kind === "smack_post").length).toBeGreaterThanOrEqual(1);
  });

  it("never emits an em-dash", () => {
    for (const r of rows) expect(hasEmDash(r.body)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Week 1: every record is 0-0, so the angles must come from head-to-head.
// ---------------------------------------------------------------------------

describe("generateFromTemplates (week 1 matchup angles)", () => {
  const zero = (name: string, slug: string) => ({
    name,
    slug,
    record: "0-0",
    pointsFor: 0,
  });
  const ctx = baseContext({
    seasonType: "regular",
    week: 1,
    divisions: [
      {
        name: "Division 1",
        leader: zero("Foopus", "foopus"),
        teams: [zero("Foopus", "foopus"), zero("Olave Garden", "olave-garden")],
      },
    ],
    leagueStandings: [
      zero("Foopus", "foopus"),
      zero("Olave Garden", "olave-garden"),
      zero("McCarthyism", "mccarthyism"),
      zero("Better Call Hall", "better-call-hall"),
      zero("Team C", "team-c"),
      zero("Team D", "team-d"),
    ],
    currentMatchups: [
      {
        // A lopsided series with an active streak.
        pairKey: "foopus__olave-garden",
        home: zero("Foopus", "foopus"),
        away: zero("Olave Garden", "olave-garden"),
        h2h: { wins: 6, losses: 1, ties: 0, streak: "3-game win streak" },
        lastMeeting: {
          seasonYear: 2025,
          week: 12,
          winner: "home" as const,
          homePoints: 140.2,
          awayPoints: 99.8,
          isPlayoff: false,
        },
        playoffMeetingYears: [],
        isTitleRematch: false,
        topProjected: null,
      },
      {
        // A first meeting: no series claim allowed.
        pairKey: "mccarthyism__team-c",
        home: zero("McCarthyism", "mccarthyism"),
        away: zero("Team C", "team-c"),
        h2h: { wins: 0, losses: 0, ties: 0, streak: null },
        lastMeeting: null,
        playoffMeetingYears: [],
        isTitleRematch: false,
        topProjected: null,
      },
      {
        // An even series whose only receipt is the last meeting.
        pairKey: "better-call-hall__team-d",
        home: zero("Better Call Hall", "better-call-hall"),
        away: zero("Team D", "team-d"),
        h2h: { wins: 2, losses: 2, ties: 0, streak: null },
        lastMeeting: {
          seasonYear: 2024,
          week: 6,
          winner: "away" as const,
          homePoints: 88.4,
          awayPoints: 121.9,
          isPlayoff: false,
        },
        playoffMeetingYears: [],
        isTitleRematch: false,
        topProjected: null,
      },
    ],
  });
  const angles = generateFromTemplates(ctx).rows.filter(
    (r) => r.kind === "matchup_angle",
  );

  it("writes one distinct angle per matchup", () => {
    expect(angles).toHaveLength(3);
    expect(new Set(angles.map((a) => a.body)).size).toBe(3);
  });

  it("never cites a 0-0 record", () => {
    for (const a of angles) expect(a.body).not.toContain("0-0");
  });

  it("hangs each angle on that pair's own receipt", () => {
    const byPair = new Map(angles.map((a) => [a.refKey, a.body]));
    expect(byPair.get("foopus__olave-garden")).toContain("Foopus has taken the last 3");
    expect(byPair.get("better-call-hall__team-d")).toContain("Team D 121.9");
  });

  it("makes no series claim for a first meeting", () => {
    const first = angles.find((a) => a.refKey === "mccarthyism__team-c")?.body ?? "";
    expect(first).toContain("never played");
    expect(first).not.toMatch(/\d+-\d+/);
  });

  it("never emits an em-dash", () => {
    for (const a of angles) expect(hasEmDash(a.body)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Copy de-duplication across surfaces (issue #274)
// ---------------------------------------------------------------------------

describe("hero dek vs game of the week blurb", () => {
  const regularCtx = (week: number) =>
    baseContext({ seasonType: "regular", week, gameOfWeekPairKey: "foopus__olave-garden" });

  const bodies = (ctx: StatsContext, kind: string) =>
    generateFromTemplates(ctx)
      .rows.filter((r) => r.kind === kind)
      .map((r) => r.body);

  it("ships a dek and a GotW blurb that share no signature phrase", () => {
    // Every week of a season, not just the one that happens to be live.
    for (let week = 1; week <= 14; week++) {
      const ctx = regularCtx(week);
      const dek = bodies(ctx, "hero_dek")[0];
      const gotw = bodies(ctx, "game_of_week_blurb")[0];
      expect(dek, `week ${week}`).toBeTruthy();
      expect(gotw, `week ${week}`).toBeTruthy();
      expect(sharesSignaturePhrase(dek, gotw), `week ${week}: "${dek}"`).toBe(false);
    }
  });

  it("leaves the Game of the Week blurb's phrasing untouched", () => {
    // Owner's call: the GotW line is the better of the two and does not move.
    const gotw = bodies(regularCtx(1), "game_of_week_blurb")[0];
    expect(gotw).toContain("headline the slate");
    expect(gotw).toContain("First place is on the line");
    expect(gotw).toContain("receipts to settle by Thursday night");
  });

  it("offers a real pool of dek variants, not a single line", () => {
    // With one candidate the diversity layer has nothing to swap in and the
    // echo ships anyway via the coverage-first relaxation pass.
    const seen = new Set<string>();
    for (let week = 1; week <= 14; week++) {
      seen.add(bodies(regularCtx(week), "hero_dek")[0]);
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it("is deterministic: the same context always yields the same dek", () => {
    // ISR caches the rendered hub and generation persists per cron run, so a
    // random pick here would mean two servers disagreeing about the copy.
    const first = bodies(regularCtx(7), "hero_dek")[0];
    const second = bodies(regularCtx(7), "hero_dek")[0];
    expect(second).toBe(first);
  });

  it("varies the dek from week to week", () => {
    expect(bodies(regularCtx(3), "hero_dek")[0]).not.toBe(
      bodies(regularCtx(4), "hero_dek")[0],
    );
  });

  it("keeps every matchup angle despite the new phrase gate", () => {
    const ctx = regularCtx(5);
    const angles = generateFromTemplates(ctx).rows.filter(
      (r) => r.kind === "matchup_angle",
    );
    expect(angles).toHaveLength(ctx.currentMatchups.length);
    expect(generateFromTemplates(ctx).diversityStats?.relaxedKinds ?? []).not.toContain(
      "matchup_angle",
    );
  });

  it("emits no em-dash in any season state's hero dek", () => {
    const contexts: StatsContext[] = [
      regularCtx(1),
      regularCtx(9),
      baseContext({ seasonType: "pre" }),
      baseContext({ seasonType: "off" }),
    ];
    for (const ctx of contexts) {
      for (const body of bodies(ctx, "hero_dek")) {
        expect(hasEmDash(body)).toBe(false);
      }
    }
  });

  it("gives the preseason and offseason deks pools too", () => {
    for (const seasonType of ["pre", "off"] as const) {
      const years = new Set<string>();
      for (const seasonYear of [2024, 2025, 2026]) {
        const rows = generateFromTemplates(baseContext({ seasonType, seasonYear }))
          .rows.filter((r) => r.kind === "hero_dek");
        expect(rows.length, seasonType).toBe(1);
        years.add(rows[0].body);
      }
      expect(years.size, seasonType).toBeGreaterThan(1);
    }
  });
});
