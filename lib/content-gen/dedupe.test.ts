import { describe, it, expect } from "vitest";
import {
  jaccard,
  trigramSet,
  extractAnchors,
  selectDiverseSubset,
  FRANCHISE_UNIQUE_KINDS,
  type CandidateRow,
} from "./dedupe";
import type { StatsContext } from "./stats-context";

function ctx(overrides: Partial<StatsContext> = {}): StatsContext {
  return {
    seasonYear: 2026,
    week: 1,
    seasonType: "pre",
    hasDivisions: true,
    divisions: [],
    leagueStandings: [
      { name: "Foopus", slug: "foopus", record: "0-0", pointsFor: 0 },
      { name: "Olave Garden", slug: "olave-garden", record: "0-0", pointsFor: 0 },
      { name: "Team C", slug: "team-c", record: "0-0", pointsFor: 0 },
    ],
    lastSeason: null,
    currentMatchups: [],
    gameOfWeekPairKey: null,
    weekInBooks: null,
    recentTransactions: [],
    franchiseHistory: [],
    rosterProjections: [
      {
        slug: "foopus",
        name: "Foopus",
        projectedStartingPoints: 1500,
        leagueRank: 1,
        topProjectedPlayer: { name: "Josh Allen", position: "QB", points: 380 },
      },
    ],
    projectionSeason: 2026,
    offseasonMoves: [],
    recentTrades: [],
    ...overrides,
  };
}

function row(body: string, opts: Partial<CandidateRow> = {}): CandidateRow {
  return { kind: "burning_question", refKey: null, body, extras: null, ...opts };
}

describe("jaccard / trigramSet", () => {
  it("is 1.0 for identical strings", () => {
    const a = trigramSet("Foopus projects to win it all this year");
    const b = trigramSet("Foopus projects to win it all this year");
    expect(jaccard(a, b)).toBe(1);
  });

  it("is 0 for completely disjoint strings", () => {
    const a = trigramSet("zzz");
    const b = trigramSet("qqq");
    expect(jaccard(a, b)).toBe(0);
  });

  it("is higher for near-identical phrasing than for unrelated phrasing", () => {
    const a = trigramSet("Foopus projects No. 1 in the league at 145.0 points");
    const b = trigramSet("Foopus projects No. 1 in the league at 145.0 starting points");
    const c = trigramSet("Better Call Hall torched the waiver wire again");
    expect(jaccard(a, b)).toBeGreaterThan(jaccard(a, c));
    expect(jaccard(a, b)).toBeGreaterThan(0.5);
  });
});

describe("extractAnchors", () => {
  it("derives franchiseKey from a matching refKey slug", () => {
    const r = row("Some receipt body.", { refKey: "foopus" });
    const a = extractAnchors(r, ctx());
    expect(a.franchiseKey).toBe("foopus");
  });

  it("derives franchiseKey from a franchise name mentioned in the body when refKey is absent", () => {
    const r = row("Foopus projects No. 1 in the league.");
    const a = extractAnchors(r, ctx());
    expect(a.franchiseKey).toBe("foopus");
  });

  it("extracts numbers from the body", () => {
    const r = row("Foopus projects 145.3 points and ranked No. 1.");
    const a = extractAnchors(r, ctx());
    expect(a.numbers).toEqual(expect.arrayContaining([145.3, 1]));
  });

  it("extracts known player names mentioned in the body", () => {
    const r = row("Josh Allen anchors this projected juggernaut.");
    const a = extractAnchors(r, ctx());
    expect(a.playerNames).toEqual(["Josh Allen"]);
  });

  it("returns no player names when none of the known players are mentioned", () => {
    const r = row("Nobody specific gets a mention here.");
    const a = extractAnchors(r, ctx());
    expect(a.playerNames).toEqual([]);
  });
});

describe("selectDiverseSubset", () => {
  it("drops a row that shares a franchise + overlapping number with an already-kept row (primary hook signal)", () => {
    const burning = row("Foopus projects No. 1 in the league at 145.0 points.", {
      kind: "burning_question",
    });
    const duplicateReceipt = row(
      "Is Foopus really the best team at 145.0 points, or is that just math?",
      { kind: "offseason_receipt" },
    );
    // A spare, non-duplicate candidate so offseason_receipt's target (1) can
    // still be reached WITHOUT falling back to the duplicate via coverage
    // relaxation: this isolates the primary-hook drop from the "never ship an
    // empty module" relaxation behavior tested separately below.
    const cleanReceipt = row("Better Call Hall went 3-11 last year and everyone noticed.", {
      kind: "offseason_receipt",
    });
    const result = selectDiverseSubset(
      { burning_question: [burning], offseason_receipt: [duplicateReceipt, cleanReceipt] },
      ctx(),
      { maxPerFranchise: 2, similarityThreshold: 0.9, targetCountsByKind: { offseason_receipt: 1 } },
    );
    // duplicateReceipt shares franchiseKey "foopus" AND the number 145.0 with
    // burning: killed regardless of phrasing; cleanReceipt fills the target instead.
    expect(result.kept).toHaveLength(2);
    expect(result.kept).toContain(burning);
    expect(result.kept).toContain(cleanReceipt);
    expect(result.kept).not.toContain(duplicateReceipt);
    expect(
      result.dropped.some((d) => d.row === duplicateReceipt && d.reason === "duplicate"),
    ).toBe(true);
  });

  it("keeps two rows about the same franchise when they cite different numbers (no shared hook)", () => {
    const candidates: CandidateRow[] = [
      row("Foopus projects No. 1 in the league at 145.0 points.", { kind: "burning_question" }),
      row("Foopus went 11-3 last year and everyone still doubts them.", {
        kind: "offseason_receipt",
      }),
    ];
    const result = selectDiverseSubset(
      { burning_question: [candidates[0]], offseason_receipt: [candidates[1]] },
      ctx(),
      { maxPerFranchise: 2, similarityThreshold: 0.9 },
    );
    expect(result.kept).toHaveLength(2);
  });

  it("drops near-identical phrasing via the trigram threshold even without a shared franchise anchor", () => {
    const first = row("Somebody in this field starts flat and blames the schedule.", {
      kind: "burning_question",
    });
    const nearDuplicate = row(
      "Somebody in this field starts flat and blames the schedule again.",
      { kind: "bold_prediction" },
    );
    const cleanPrediction = row("Better Call Hall keeps the bottom-third streak alive this year.", {
      kind: "bold_prediction",
    });
    const result = selectDiverseSubset(
      { burning_question: [first], bold_prediction: [nearDuplicate, cleanPrediction] },
      ctx(),
      { similarityThreshold: 0.5, targetCountsByKind: { bold_prediction: 1 } },
    );
    expect(result.kept).toContain(first);
    expect(result.kept).toContain(cleanPrediction);
    expect(result.kept).not.toContain(nearDuplicate);
  });

  it("caps rows per franchise (within a kind) at maxPerFranchise", () => {
    const candidates: CandidateRow[] = [
      row("Foopus takes the division by a mile.", { refKey: "foopus" }),
      row("Foopus also looks primed for a bye week run.", { refKey: "foopus" }),
      row("Foopus, believe it or not, might go undefeated.", { refKey: "foopus" }),
    ];
    // targetCountsByKind pinned to the cap-limited achievable count so the
    // "never ship an empty module" relaxation doesn't need to fire: the pool
    // had a 3rd Foopus candidate on offer, but only 2 make it into `kept`,
    // proving the cap (not just the target) is what's limiting the count.
    const result = selectDiverseSubset({ bold_prediction: candidates }, ctx(), {
      maxPerFranchise: 2,
      similarityThreshold: 0.99,
      targetCountsByKind: { bold_prediction: 2 },
    });
    expect(result.kept).toHaveLength(2);
    expect(result.relaxedKinds).toEqual([]);
  });

  it("caps rows per player at maxPerPlayer, scoped within a kind", () => {
    const candidates: CandidateRow[] = [
      row("Josh Allen anchors a scary-good Foopus roster.", { kind: "bold_prediction" }),
      row("Josh Allen might be even better than last year for this roster.", {
        kind: "bold_prediction",
      }),
      row("Better Call Hall keeps the bottom-third streak alive this year.", {
        kind: "bold_prediction",
      }),
    ];
    const result = selectDiverseSubset({ bold_prediction: candidates }, ctx(), {
      maxPerPlayer: 1,
      similarityThreshold: 0.99,
      targetCountsByKind: { bold_prediction: 2 },
    });
    expect(result.kept).toHaveLength(2);
    expect(result.kept).toContain(candidates[0]);
    expect(result.kept).not.toContain(candidates[1]);
    expect(result.kept).toContain(candidates[2]);
  });

  it("relaxes a kind's target rather than shipping it empty when every candidate would otherwise be dropped", () => {
    // offseason_receipt has MORE candidates (2) than its target (1) so the
    // keep-all bypass does not apply, and both candidates are duplicates of
    // burning_question's row. An empty offseason_receipt module is worse
    // than the mild echo, so one is kept anyway and the kind is flagged.
    const candidates: CandidateRow[] = [
      row("Foopus projects No. 1 in the league at 145.0 points.", { kind: "burning_question" }),
      row("Foopus projects No. 1 in the league at 145.0 points, seriously.", {
        kind: "offseason_receipt",
      }),
      row("Foopus projects No. 1 in the league at 145.0 points, believe it.", {
        kind: "offseason_receipt",
      }),
    ];
    const result = selectDiverseSubset(
      { burning_question: [candidates[0]], offseason_receipt: [candidates[1], candidates[2]] },
      ctx(),
      { targetCountsByKind: { offseason_receipt: 1 }, similarityThreshold: 0.5 },
    );
    expect(result.kept.filter((r) => r.kind === "offseason_receipt")).toHaveLength(1);
    expect(result.relaxedKinds).toContain("offseason_receipt");
  });

  it("skips the duplicate gate entirely for keep-all kinds (target >= candidate count)", () => {
    // matchup_angle boilerplate: near-identical skeletons with unique pairKeys.
    const angles: CandidateRow[] = [
      row("Foopus (0-0) hosts Olave Garden (0-0). First-ever meeting between these two.", {
        kind: "matchup_angle",
        refKey: "foopus__olave-garden",
      }),
      row("Team C (0-0) hosts Foopus (0-0). First-ever meeting between these two.", {
        kind: "matchup_angle",
        refKey: "foopus__team-c",
      }),
    ];
    const result = selectDiverseSubset(
      { matchup_angle: angles },
      ctx(),
      { targetCountsByKind: { matchup_angle: 2 }, similarityThreshold: 0.5 },
    );
    expect(result.kept).toHaveLength(2);
    expect(result.dropped).toEqual([]);
    expect(result.relaxedKinds).toEqual([]);
  });

  it("franchiseUniqueKinds: caps a kind at one row per franchise even under relaxation, when candidates cluster on fewer franchises than the target", () => {
    // 4 offseason_receipt candidates but only 2 distinct franchises (foopus,
    // olave-garden); target is 4. Without franchiseUniqueKinds the coverage
    // relaxation would re-add a 2nd row per franchise to hit 4; with it,
    // relaxation must skip those and the kind stays under target rather than
    // duplicating a franchise.
    const candidates: CandidateRow[] = [
      row("Foopus reached for a punter in round 2, allegedly.", {
        kind: "offseason_receipt",
        refKey: "foopus",
      }),
      row("Foopus also flipped two firsts for a kicker rumor.", {
        kind: "offseason_receipt",
        refKey: "foopus",
      }),
      row("Olave Garden torched the FAAB budget on day one.", {
        kind: "offseason_receipt",
        refKey: "olave-garden",
      }),
      row("Olave Garden kept chasing upside well past sensible.", {
        kind: "offseason_receipt",
        refKey: "olave-garden",
      }),
    ];
    const result = selectDiverseSubset(
      { offseason_receipt: candidates },
      ctx(),
      {
        targetCountsByKind: { offseason_receipt: 4 },
        similarityThreshold: 0.99,
        franchiseUniqueKinds: FRANCHISE_UNIQUE_KINDS,
      },
    );
    const refKeys = result.kept.map((r) => r.refKey);
    expect(new Set(refKeys).size).toBe(refKeys.length);
    expect(refKeys.length).toBeLessThanOrEqual(2);
  });

  it("franchiseUniqueKinds: keeps exactly the target count, all distinct franchises, when enough distinct franchises are on offer", () => {
    const candidates: CandidateRow[] = [
      row("Foopus reached for a punter in round 2, allegedly.", {
        kind: "offseason_receipt",
        refKey: "foopus",
      }),
      row("Olave Garden torched the FAAB budget on day one.", {
        kind: "offseason_receipt",
        refKey: "olave-garden",
      }),
      row("Team C shipped out its whole receiving corps.", {
        kind: "offseason_receipt",
        refKey: "team-c",
      }),
      row("Team D quietly rebuilt around two rookies.", {
        kind: "offseason_receipt",
        refKey: "team-d",
      }),
      row("Team E made a panic trade nobody asked for.", {
        kind: "offseason_receipt",
        refKey: "team-e",
      }),
    ];
    const testCtx = ctx({
      leagueStandings: [
        { name: "Foopus", slug: "foopus", record: "0-0", pointsFor: 0 },
        { name: "Olave Garden", slug: "olave-garden", record: "0-0", pointsFor: 0 },
        { name: "Team C", slug: "team-c", record: "0-0", pointsFor: 0 },
        { name: "Team D", slug: "team-d", record: "0-0", pointsFor: 0 },
        { name: "Team E", slug: "team-e", record: "0-0", pointsFor: 0 },
      ],
    });
    const result = selectDiverseSubset(
      { offseason_receipt: candidates },
      testCtx,
      {
        targetCountsByKind: { offseason_receipt: 4 },
        similarityThreshold: 0.99,
        franchiseUniqueKinds: FRANCHISE_UNIQUE_KINDS,
      },
    );
    const refKeys = result.kept.map((r) => r.refKey);
    expect(refKeys).toHaveLength(4);
    expect(new Set(refKeys).size).toBe(4);
  });

  it("is deterministic: identical input yields identical output across repeated calls", () => {
    const candidates: CandidateRow[] = [
      row("Foopus takes the division by a mile.", { kind: "bold_prediction" }),
      row("Better Call Hall keeps the bottom-third streak alive.", { kind: "bold_prediction" }),
      row("Team C makes a leap nobody saw coming.", { kind: "bold_prediction" }),
    ];
    const opts = { maxPerFranchise: 2, similarityThreshold: 0.5 };
    const first = selectDiverseSubset({ bold_prediction: candidates }, ctx(), opts);
    const second = selectDiverseSubset({ bold_prediction: candidates }, ctx(), opts);
    expect(first.kept.map((r) => r.body)).toEqual(second.kept.map((r) => r.body));
    expect(first.dropped.map((d) => d.row.body)).toEqual(second.dropped.map((d) => d.row.body));
  });
});

describe("keep-all kinds still reject an identical body", () => {
  const angle = (body: string, refKey: string): CandidateRow => ({
    kind: "matchup_angle",
    refKey,
    body,
    extras: null,
  });

  it("keeps two differently-worded angles even though keep-all skips the similarity gate", () => {
    const a = angle("Foopus has taken the last three from Olave Garden.", "a__b");
    const b = angle("Team C and Olave Garden have never played before.", "c__b");
    const result = selectDiverseSubset({ matchup_angle: [a, b] }, ctx(), {
      maxPerFranchise: 2,
      similarityThreshold: 0.5,
    });
    expect(result.kept).toHaveLength(2);
  });

  it("drops a second angle whose body is character-identical to the first", () => {
    const body = "Somebody's number moves this week.";
    const a = angle(body, "a__b");
    const b = angle(body, "c__b");
    const result = selectDiverseSubset({ matchup_angle: [a, b] }, ctx(), {
      maxPerFranchise: 2,
      similarityThreshold: 0.5,
    });
    // One angle printed twice is not two angles. The dropped row leaves the
    // kind short so topUpShortKinds refills that pair from the builder.
    expect(result.kept).toHaveLength(1);
    expect(result.kept).toContain(a);
    expect(
      result.dropped.some((d) => d.row === b && d.reason === "duplicate"),
    ).toBe(true);
  });

  it("treats casing and whitespace differences as the same body", () => {
    const a = angle("Somebody's number moves this week.", "a__b");
    const b = angle("  SOMEBODY'S   NUMBER MOVES THIS WEEK.  ", "c__b");
    const result = selectDiverseSubset({ matchup_angle: [a, b] }, ctx(), {
      maxPerFranchise: 2,
      similarityThreshold: 0.5,
    });
    expect(result.kept).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Signature-phrase signal + explicit keepAllKinds (issue #274)
// ---------------------------------------------------------------------------

describe("signature-phrase duplicate signal", () => {
  it("treats two rows sharing only a stock idiom as duplicates", () => {
    // No shared franchise, no shared number, no shared player, and trigram
    // similarity far below the 0.5 threshold: the ONLY thing these have in
    // common is the idiom, which is exactly the case that used to slip
    // through.
    const dek = row(
      "Week 1 is set. 6 matchups and a week of receipts to settle by Sunday.",
      { kind: "hero_dek" },
    );
    const gotw = row(
      "Foopus and Olave Garden headline it. There are receipts to settle by Thursday night.",
      { kind: "game_of_week_blurb" },
    );
    const result = selectDiverseSubset(
      { game_of_week_blurb: [gotw], hero_dek: [dek] },
      ctx({ seasonType: "regular", week: 1 }),
      {
        targetCountsByKind: { game_of_week_blurb: 1, hero_dek: 1 },
        kindPriority: ["game_of_week_blurb", "hero_dek"],
        keepAllKinds: new Set(["matchup_angle", "trade_verdict"]),
      },
    );
    expect(result.kept).toContain(gotw);
    // hero_dek is phrase-strict: the echo is dropped for good rather than
    // handed back by the relaxation pass, which is what makes the gate real
    // for a kind shipping one candidate.
    expect(result.kept).not.toContain(dek);
    expect(
      result.dropped.some((d) => d.row === dek && d.reason === "phrase-echo"),
    ).toBe(true);
  });

  it("re-admits an echo for a non-strict kind, but only after every clean candidate", () => {
    // Coverage still wins for kinds with no downstream fallback: the echo
    // comes back, just last.
    const gotw = row("There are receipts to settle by Thursday night.", {
      kind: "game_of_week_blurb",
    });
    const echo = row("Somebody has receipts to settle after that one.", {
      kind: "smack_post",
    });
    const clean = row("Somebody left 33.5 on the bench and lost anyway.", {
      kind: "smack_post",
    });
    const result = selectDiverseSubset(
      { game_of_week_blurb: [gotw], smack_post: [echo, clean] },
      ctx({ seasonType: "regular", week: 1 }),
      {
        targetCountsByKind: { game_of_week_blurb: 1, smack_post: 2 },
        kindPriority: ["game_of_week_blurb", "smack_post"],
        keepAllKinds: new Set(["matchup_angle", "trade_verdict"]),
      },
    );
    const smack = result.kept.filter((r) => r.kind === "smack_post");
    expect(smack).toHaveLength(2);
    // The clean row was admitted by the strict pass, the echo only by
    // relaxation, so the clean one comes first.
    expect(smack[0]).toBe(clean);
    expect(smack[1]).toBe(echo);
  });

  it("lets a phrase-free alternative take the slot instead", () => {
    const gotw = row(
      "Foopus and Olave Garden headline it. There are receipts to settle by Thursday night.",
      { kind: "game_of_week_blurb" },
    );
    const echo = row("A week of receipts to settle by Sunday.", { kind: "hero_dek" });
    const clean = row(
      "Six games, twelve rosters, and nobody hiding behind a projection.",
      { kind: "hero_dek" },
    );
    const result = selectDiverseSubset(
      { game_of_week_blurb: [gotw], hero_dek: [echo, clean] },
      ctx({ seasonType: "regular", week: 1 }),
      {
        targetCountsByKind: { game_of_week_blurb: 1, hero_dek: 1 },
        kindPriority: ["game_of_week_blurb", "hero_dek"],
        keepAllKinds: new Set(["matchup_angle", "trade_verdict"]),
      },
    );
    expect(result.kept.filter((r) => r.kind === "hero_dek")).toEqual([clean]);
    expect(result.relaxedKinds).not.toContain("hero_dek");
    expect(
      result.dropped.some((d) => d.row === echo && d.reason === "phrase-echo"),
    ).toBe(true);
  });
});

describe("explicit keepAllKinds", () => {
  const gotw = row(
    "Foopus and Olave Garden headline it. There are receipts to settle by Thursday night.",
    { kind: "game_of_week_blurb" },
  );
  const dek = row("A week of receipts to settle by Sunday.", { kind: "hero_dek" });

  it("no longer lets a single-candidate kind bypass the gate", () => {
    const result = selectDiverseSubset(
      { game_of_week_blurb: [gotw], hero_dek: [dek] },
      ctx({ seasonType: "regular", week: 1 }),
      {
        targetCountsByKind: { game_of_week_blurb: 1, hero_dek: 1 },
        kindPriority: ["game_of_week_blurb", "hero_dek"],
        keepAllKinds: new Set(["matchup_angle", "trade_verdict"]),
      },
    );
    // And with no alternative it ships NOTHING for that kind rather than the
    // echo: fillMissingKinds backfills hero_dek from the template pool, and
    // the hub falls back to HERO_DEK_FALLBACK if even that collides.
    expect(result.kept.filter((r) => r.kind === "hero_dek")).toEqual([]);
    expect(result.relaxedKinds).not.toContain("hero_dek");
  });

  it("keeps the legacy derived behavior when the option is omitted", () => {
    const result = selectDiverseSubset(
      { game_of_week_blurb: [gotw], hero_dek: [dek] },
      ctx({ seasonType: "regular", week: 1 }),
      {
        targetCountsByKind: { game_of_week_blurb: 1, hero_dek: 1 },
        kindPriority: ["game_of_week_blurb", "hero_dek"],
      },
    );
    expect(result.dropped).toEqual([]);
    expect(result.relaxedKinds).toEqual([]);
  });

  it("still keeps every matchup_angle row and reports no relaxation", () => {
    // The regression this option most risks: matchup_angle boilerplate must
    // keep going through untouched, with no spurious drop-then-relax cycle,
    // even when every angle shares a signature phrase.
    const angles: CandidateRow[] = [
      row(
        "Foopus (0-0) hosts Olave Garden (0-0). First meeting, and first place is on the line.",
        { kind: "matchup_angle", refKey: "foopus__olave-garden" },
      ),
      row(
        "Team C (0-0) hosts Foopus (0-0). First meeting, and first place is on the line too.",
        { kind: "matchup_angle", refKey: "foopus__team-c" },
      ),
    ];
    const result = selectDiverseSubset({ matchup_angle: angles }, ctx(), {
      targetCountsByKind: { matchup_angle: 2 },
      keepAllKinds: new Set(["matchup_angle", "trade_verdict"]),
    });
    expect(result.kept).toHaveLength(2);
    expect(result.dropped).toEqual([]);
    expect(result.relaxedKinds).toEqual([]);
  });

  it("never lets keepAllKinds override franchiseUniqueKinds", () => {
    const a = row("Foopus torched its FAAB budget in March.", {
      kind: "offseason_receipt",
      refKey: "foopus",
      extras: { category: "WAIVERS" },
    });
    const b = row("Foopus also shipped out two veterans for picks.", {
      kind: "offseason_receipt",
      refKey: "foopus",
      extras: { category: "FIRE_SALE" },
    });
    const result = selectDiverseSubset({ offseason_receipt: [a, b] }, ctx(), {
      targetCountsByKind: { offseason_receipt: 2 },
      franchiseUniqueKinds: FRANCHISE_UNIQUE_KINDS,
      keepAllKinds: new Set(["matchup_angle", "trade_verdict", "offseason_receipt"]),
    });
    expect(result.kept).toHaveLength(1);
  });
});
