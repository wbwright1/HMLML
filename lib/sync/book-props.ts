import { db } from "@/lib/db";
import { bookProps, type NewBookProp } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { runAtomic } from "@/lib/db/atomic";
import {
  chooseBlowoutThreshold,
  chooseCeilingThreshold,
  encodePairSubject,
  findBiggestFavorite,
  findBiggestUnderdog,
  gradeBlowout,
  gradeCeilingWatch,
  gradeLeagueTotal,
  gradeMatchbet,
  gradeMercyLine,
  gradePlayerPoints,
  gradeTeamTotal,
  gradeUpset,
  MAX_WEEKLY_PROPS,
  parsePairSubject,
  PLAYER_UNCERTAINTY_SCALE,
  priceBlowoutSpecial,
  priceCeilingWatch,
  priceLeagueTotal,
  priceMatchbet,
  priceMercyLine,
  pricePlayerPoints,
  priceTeamTotal,
  priceUpsetSpecial,
  SCORE_UNCERTAINTY_SCALE,
  selectStickySubjects,
  type ProjectedPairing,
} from "@/lib/book/props";
import { BOOK_COPY } from "@/lib/book/shared";
import { getWeekProjectedTotals } from "@/lib/queries/book";
import { getRosterToFranchiseMap } from "@/lib/queries/franchise-mapping";
import {
  getExistingPropSubjects,
  getHistoricalMargins,
  getHistoricalWeeklyScores,
  getSeasonHighScore,
  getWeekActuals,
  getWeekPairings,
  getWeekPlayerActuals,
  getWeekStarterProjections,
  isWeekLocked,
  type StarterProjection,
} from "@/lib/queries/book-props";

/** How many rows each variable block aims for in a normal week. */
const PLAYER_PROP_TARGET = 5;
const TEAM_TOTAL_TARGET = 3;
const MATCHBET_TARGET = 1;


export interface PropRepriceResult {
  rowCount: number;
  locked: boolean;
}

/**
 * Generates (or reprices) the week's three props.
 *
 * Unlike book_lines, props lock as a WEEK, not per-game: once any NFL game
 * this fantasy week has kicked off, the whole set is left alone rather than
 * moved out from under a pick made before the first snap. Rows keep the SAME
 * id across repricing (upsert on the natural key), so book_prop_picks.propId
 * stays valid across a member's whole week even as the numbers move
 * hour-to-hour before lock.
 */
export async function generateOrRepriceBookProps(
  seasonId: number,
  seasonYear: number,
  week: number,
): Promise<PropRepriceResult> {
  if (await isWeekLocked(seasonYear, week)) {
    return { rowCount: 0, locked: true };
  }

  const pairingRows = await getWeekPairings(seasonId, week);
  if (pairingRows.length === 0) {
    return { rowCount: 0, locked: false };
  }

  const projections = await getWeekProjectedTotals(seasonId, seasonYear, week);
  const rosterToFranchise = await getRosterToFranchiseMap(seasonId);

  const projectedTotals: number[] = [];
  for (const rosterId of rosterToFranchise.keys()) {
    const proj = projections.get(rosterId);
    if (proj != null) projectedTotals.push(proj);
  }
  // A pairing's rosters may not all appear in rosterToFranchise's iteration
  // order guarantees, so fall back to whatever projections exist at all.
  const totals = projectedTotals.length > 0 ? projectedTotals : [...projections.values()];

  if (totals.length === 0) {
    // No usable projections yet; nothing honest to price.
    return { rowCount: 0, locked: false };
  }

  const now = new Date();
  const rows: NewBookProp[] = [];

  // Prop 1: League Total
  const leagueTotal = priceLeagueTotal(totals);
  rows.push({
    seasonId,
    week,
    kind: "league_total",
    subjectType: "league",
    subjectId: null,
    question: "Combined points, all 12 teams",
    line: leagueTotal.line,
    overOdds: leagueTotal.overOdds,
    underOdds: leagueTotal.underOdds,
    snark: BOOK_COPY.leagueTotalSnark,
    updatedAt: now,
  });

  // Prop 2: Ceiling Watch
  const history = await getHistoricalWeeklyScores(seasonId);
  const threshold = chooseCeilingThreshold(history);
  const ceilingWatch = priceCeilingWatch(totals, threshold);
  const seasonHigh = await getSeasonHighScore(seasonId);
  const ceilingSnark = seasonHigh
    ? `Season high: ${seasonHigh.points.toFixed(1)}, Week ${seasonHigh.week}.`
    : "No games in the books yet this season.";
  rows.push({
    seasonId,
    week,
    kind: "ceiling_watch",
    subjectType: "league",
    subjectId: null,
    question: `Does anyone hang ${threshold}+ this week?`,
    line: threshold,
    overOdds: ceilingWatch.overOdds,
    underOdds: ceilingWatch.underOdds,
    snark: ceilingSnark,
    updatedAt: now,
  });

  // Prop 3: The Mercy Line
  const pairings: ProjectedPairing[] = pairingRows
    .map((p) => {
      const projA = projections.get(p.rosterA);
      const projB = projections.get(p.rosterB);
      if (projA == null || projB == null) return null;
      return { matchupId: p.matchupId, rosterA: p.rosterA, rosterB: p.rosterB, projA, projB };
    })
    .filter((p): p is ProjectedPairing => p !== null);

  const favorite = findBiggestFavorite(pairings);
  if (favorite) {
    const mercyLine = priceMercyLine(favorite.favoriteProjected, favorite.dogProjected);
    rows.push({
      seasonId,
      week,
      kind: "mercy_line",
      // Deliberate extension beyond the schema comment's documented
      // 'franchise' | 'player' | 'league' subjectTypes. That comment is
      // descriptive, not an enum or CHECK constraint (subject_type is plain
      // text). Grading must find the exact matchup regardless of any
      // roster/franchise reassignment mid-week, and storing just the
      // favorite's franchise id would not let grading locate the OTHER
      // side's actual score, so the matchup id is stored instead.
      subjectType: "matchup",
      subjectId: String(favorite.matchupId),
      question: "Projected doormat's margin of defeat",
      line: mercyLine.line,
      overOdds: -110,
      underOdds: -110,
      snark: "Under bettors believe in miracles.",
      updatedAt: now,
    });
  }

  // -------------------------------------------------------------------------
  // Prop 4: the Blowout Special (league-wide, any matchup)
  // -------------------------------------------------------------------------
  const marginHistory = await getHistoricalMargins(seasonId);
  const blowoutThreshold = chooseBlowoutThreshold(marginHistory);
  if (pairings.length > 0) {
    const blowout = priceBlowoutSpecial(pairings, blowoutThreshold);
    rows.push({
      seasonId,
      week,
      kind: "blowout_special",
      subjectType: "league",
      subjectId: null,
      question: `Does anyone win by ${blowoutThreshold}+ this week?`,
      line: blowoutThreshold,
      overOdds: blowout.overOdds,
      underOdds: blowout.underOdds,
      snark: BOOK_COPY.blowoutSnark(blowoutThreshold),
      updatedAt: now,
    });
  }

  // -------------------------------------------------------------------------
  // Prop 5: the Upset Special (the week's biggest dog, outright)
  // -------------------------------------------------------------------------
  const underdog = findBiggestUnderdog(pairings);
  if (underdog) {
    const upset = priceUpsetSpecial(underdog.favoriteProjected, underdog.dogProjected);
    rows.push({
      seasonId,
      week,
      kind: "upset_special",
      // Same reasoning as mercy_line's 'matchup' subjectType: grading needs
      // BOTH sides, and it needs to know which one was the dog, so the
      // composite id carries the matchup and the dog's roster together.
      subjectType: "matchup",
      subjectId: encodePairSubject(String(underdog.matchupId), underdog.dogRosterId),
      question: "Does the week's biggest underdog win outright?",
      line: 0,
      overOdds: upset.overOdds,
      underOdds: upset.underOdds,
      snark: BOOK_COPY.upsetSnark(),
      updatedAt: now,
    });
  }

  // -------------------------------------------------------------------------
  // The variable block: player over/unders, team totals, and the two matchbets.
  //
  // Every one of these goes through selectStickySubjects, because the natural
  // key includes subject_id: a subject that drops out of the ranking between
  // two hourly runs must STAY on the board, or its row is orphaned and any
  // pick on it points at a prop nobody can see.
  // -------------------------------------------------------------------------
  const starters = await getWeekStarterProjections(seasonId, week);
  const existing = await getExistingPropSubjects(seasonId, week);

  rows.push(
    ...buildPlayerPointRows({
      seasonId,
      week,
      now,
      starters,
      existing: existing.get("player_points") ?? [],
    }),
  );

  rows.push(
    ...buildTeamTotalRows({
      seasonId,
      week,
      now,
      projections,
      rosterToFranchise,
      existing: existing.get("team_total") ?? [],
    }),
  );

  const playerMatchbet = buildPlayerMatchbetRow({
    seasonId,
    week,
    now,
    starters,
    existing: existing.get("player_matchbet") ?? [],
  });
  if (playerMatchbet) rows.push(playerMatchbet);

  const franchiseMatchbet = buildFranchiseMatchbetRow({
    seasonId,
    week,
    now,
    pairings,
    projections,
    rosterToFranchise,
    existing: existing.get("franchise_matchbet") ?? [],
  });
  if (franchiseMatchbet) rows.push(franchiseMatchbet);

  // Cap the slate. Ordering above is deliberate (specials, players, teams,
  // matchbets), so a truncation trims the least load-bearing rows last.
  const slate = rows.slice(0, MAX_WEEKLY_PROPS);

  // One statement for the whole week, matching repriceBookLines's discipline:
  // a per-prop loop that dies halfway would leave some props on this hour's
  // numbers and some on last hour's.
  await db
    .insert(bookProps)
    .values(slate)
    .onConflictDoUpdate({
      target: [
        bookProps.seasonId,
        bookProps.week,
        bookProps.kind,
        bookProps.subjectType,
        bookProps.subjectId,
      ],
      set: {
        question: sql`excluded.question`,
        line: sql`excluded.line`,
        overOdds: sql`excluded.over_odds`,
        underOdds: sql`excluded.under_odds`,
        snark: sql`excluded.snark`,
        updatedAt: sql`excluded.updated_at`,
      },
    });

  return { rowCount: slate.length, locked: false };
}

// ---------------------------------------------------------------------------
// The variable block's builders (pure assembly around the pure pricers)
// ---------------------------------------------------------------------------

interface BlockContext {
  seasonId: number;
  week: number;
  now: Date;
}

/**
 * Up to five player over/unders, at most ONE per franchise: without that rule
 * a juggernaut roster would own the whole block and the tab would read like a
 * single team's stat sheet.
 */
function buildPlayerPointRows(
  ctx: BlockContext & { starters: StarterProjection[]; existing: string[] },
): NewBookProp[] {
  const byPlayer = new Map<string, StarterProjection>();
  for (const s of ctx.starters) byPlayer.set(s.playerId, s);

  // Deterministic ranking: projection descending, player id as the tiebreak,
  // so a fresh week produces the same slate on every run of the hour.
  const ranked = [...ctx.starters].sort(
    (a, b) => b.projected - a.projected || a.playerId.localeCompare(b.playerId),
  );

  const usedFranchises = new Set<string>();
  for (const id of ctx.existing) {
    const s = byPlayer.get(id);
    if (s) usedFranchises.add(s.franchiseId);
  }

  const candidates: string[] = [];
  for (const s of ranked) {
    if (ctx.existing.includes(s.playerId)) continue;
    if (usedFranchises.has(s.franchiseId)) continue;
    usedFranchises.add(s.franchiseId);
    candidates.push(s.playerId);
  }

  const chosen = selectStickySubjects(ctx.existing, candidates, PLAYER_PROP_TARGET);

  const rows: NewBookProp[] = [];
  for (const playerId of chosen) {
    const s = byPlayer.get(playerId);
    // A kept subject with no projection this week cannot be repriced. Leaving
    // it out of the batch leaves its existing row exactly as it was, which is
    // the point: it is never deleted out from under a pick.
    if (!s) continue;
    const priced = pricePlayerPoints(s.projected);
    rows.push({
      seasonId: ctx.seasonId,
      week: ctx.week,
      kind: "player_points",
      subjectType: "player",
      subjectId: s.playerId,
      // Name-free on purpose: the display name resolves at read time, so a
      // stored question can never go stale.
      question: "Fantasy points, this week",
      line: priced.line,
      overOdds: priced.overOdds,
      underOdds: priced.underOdds,
      snark: BOOK_COPY.playerPropSnark(s.name),
      updatedAt: ctx.now,
    });
  }
  return rows;
}

/** Three team totals, priced off the same projected starter totals the board uses. */
function buildTeamTotalRows(
  ctx: BlockContext & {
    projections: Map<string, number>;
    rosterToFranchise: Map<string, string>;
    existing: string[];
  },
): NewBookProp[] {
  const byFranchise = new Map<string, number>();
  for (const [rosterId, franchiseId] of ctx.rosterToFranchise) {
    const proj = ctx.projections.get(rosterId);
    if (proj != null) byFranchise.set(franchiseId, proj);
  }

  const ranked = [...byFranchise.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([franchiseId]) => franchiseId);

  const chosen = selectStickySubjects(ctx.existing, ranked, TEAM_TOTAL_TARGET);

  const rows: NewBookProp[] = [];
  for (const franchiseId of chosen) {
    const projected = byFranchise.get(franchiseId);
    if (projected == null) continue;
    const priced = priceTeamTotal(projected);
    rows.push({
      seasonId: ctx.seasonId,
      week: ctx.week,
      kind: "team_total",
      subjectType: "franchise",
      subjectId: franchiseId,
      question: "Points scored, starters only",
      line: priced.line,
      overOdds: priced.overOdds,
      underOdds: priced.underOdds,
      snark: BOOK_COPY.teamTotalSnark(),
      updatedAt: ctx.now,
    });
  }
  return rows;
}

/**
 * One player-vs-player matchbet: the two highest-projected starters at the
 * same position on different franchises. Same position, because "does the QB
 * outscore the kicker" is not a bet, it is arithmetic.
 */
function buildPlayerMatchbetRow(
  ctx: BlockContext & { starters: StarterProjection[]; existing: string[] },
): NewBookProp | null {
  const byPlayer = new Map<string, StarterProjection>();
  for (const s of ctx.starters) byPlayer.set(s.playerId, s);

  const byPosition = new Map<string, StarterProjection[]>();
  for (const s of ctx.starters) {
    if (!s.position) continue;
    const list = byPosition.get(s.position) ?? [];
    list.push(s);
    byPosition.set(s.position, list);
  }

  let best: [StarterProjection, StarterProjection] | null = null;
  for (const list of byPosition.values()) {
    const sorted = [...list].sort(
      (a, b) => b.projected - a.projected || a.playerId.localeCompare(b.playerId),
    );
    const top = sorted[0];
    if (!top) continue;
    const rival = sorted.find((s) => s.franchiseId !== top.franchiseId);
    if (!rival) continue;
    const combined = top.projected + rival.projected;
    if (!best || combined > best[0].projected + best[1].projected) {
      best = [top, rival];
    }
  }

  const candidates = best ? [encodePairSubject(best[0].playerId, best[1].playerId)] : [];
  const chosen = selectStickySubjects(ctx.existing, candidates, MATCHBET_TARGET);
  const subjectId = chosen[0];
  if (!subjectId) return null;

  const pair = parsePairSubject(subjectId);
  if (!pair) return null;
  const a = byPlayer.get(pair[0]);
  const b = byPlayer.get(pair[1]);
  if (!a || !b) return null;

  const priced = priceMatchbet(a.projected, b.projected, PLAYER_UNCERTAINTY_SCALE);
  return {
    seasonId: ctx.seasonId,
    week: ctx.week,
    kind: "player_matchbet",
    subjectType: "player_pair",
    subjectId,
    question: "Who scores more this week?",
    line: 0,
    overOdds: priced.overOdds,
    underOdds: priced.underOdds,
    snark: BOOK_COPY.matchbetSnark(),
    updatedAt: ctx.now,
  };
}

/**
 * One franchise-vs-franchise matchbet between two rosters that are NOT playing
 * each other: a matchbet between the two sides of one matchup is just the
 * Board's spread wearing a costume.
 */
function buildFranchiseMatchbetRow(
  ctx: BlockContext & {
    pairings: ProjectedPairing[];
    projections: Map<string, number>;
    rosterToFranchise: Map<string, string>;
    existing: string[];
  },
): NewBookProp | null {
  const opponent = new Map<string, string>();
  for (const p of ctx.pairings) {
    opponent.set(p.rosterA, p.rosterB);
    opponent.set(p.rosterB, p.rosterA);
  }

  const franchiseToRoster = new Map<string, string>();
  const projByFranchise = new Map<string, number>();
  for (const [rosterId, franchiseId] of ctx.rosterToFranchise) {
    const proj = ctx.projections.get(rosterId);
    if (proj == null) continue;
    franchiseToRoster.set(franchiseId, rosterId);
    projByFranchise.set(franchiseId, proj);
  }

  const ranked = [...projByFranchise.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );

  let candidate: string | null = null;
  outer: for (let i = 0; i < ranked.length; i++) {
    for (let j = i + 1; j < ranked.length; j++) {
      const rosterI = franchiseToRoster.get(ranked[i][0]);
      const rosterJ = franchiseToRoster.get(ranked[j][0]);
      if (!rosterI || !rosterJ) continue;
      if (opponent.get(rosterI) === rosterJ) continue;
      candidate = encodePairSubject(ranked[i][0], ranked[j][0]);
      break outer;
    }
  }

  const chosen = selectStickySubjects(
    ctx.existing,
    candidate ? [candidate] : [],
    MATCHBET_TARGET,
  );
  const subjectId = chosen[0];
  if (!subjectId) return null;

  const pair = parsePairSubject(subjectId);
  if (!pair) return null;
  const projA = projByFranchise.get(pair[0]);
  const projB = projByFranchise.get(pair[1]);
  if (projA == null || projB == null) return null;

  const priced = priceMatchbet(projA, projB, SCORE_UNCERTAINTY_SCALE);
  return {
    seasonId: ctx.seasonId,
    week: ctx.week,
    kind: "franchise_matchbet",
    subjectType: "franchise_pair",
    subjectId,
    question: "Who scores more this week?",
    line: 0,
    overOdds: priced.overOdds,
    underOdds: priced.underOdds,
    snark: BOOK_COPY.matchbetSnark(),
    updatedAt: ctx.now,
  };
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

export interface PropGradeResult {
  weeksGraded: number;
  propsGraded: number;
  skipped: number;
}

/**
 * Grades every ungraded prop for weeks whose actuals are complete.
 *
 * Finds DISTINCT (season, week) pairs in book_props with result IS NULL
 * rather than guessing "current week - 1" against Sleeper's own Tuesday
 * week-bump timing, then grades each week only once getWeekActuals reports
 * it complete.
 */
export async function gradeBookProps(seasonId: number): Promise<PropGradeResult> {
  const ungradedWeeks = await db
    .select({ week: bookProps.week })
    .from(bookProps)
    .where(and(eq(bookProps.seasonId, seasonId), isNull(bookProps.result)))
    .groupBy(bookProps.week);

  let weeksGraded = 0;
  let propsGraded = 0;
  let skipped = 0;

  for (const { week } of ungradedWeeks) {
    const result = await gradeWeekProps(seasonId, week);
    if (result.graded > 0) weeksGraded++;
    propsGraded += result.graded;
    skipped += result.skipped;
  }

  return { weeksGraded, propsGraded, skipped };
}

async function gradeWeekProps(
  seasonId: number,
  week: number,
): Promise<{ graded: number; skipped: number }> {
  const actuals = await getWeekActuals(seasonId, week);
  if (!actuals.complete) return { graded: 0, skipped: 0 };

  const rows = await db
    .select()
    .from(bookProps)
    .where(
      and(eq(bookProps.seasonId, seasonId), eq(bookProps.week, week), isNull(bookProps.result)),
    );
  if (rows.length === 0) return { graded: 0, skipped: 0 };

  // Every player id this week's ungraded slate needs, in one read.
  const neededPlayerIds = new Set<string>();
  for (const row of rows) {
    if (row.kind === "player_points" && row.subjectId) {
      neededPlayerIds.add(row.subjectId);
    } else if (row.kind === "player_matchbet") {
      const pair = parsePairSubject(row.subjectId);
      if (pair) {
        neededPlayerIds.add(pair[0]);
        neededPlayerIds.add(pair[1]);
      }
    }
  }
  const playerActuals = await getWeekPlayerActuals(seasonId, week, [
    ...neededPlayerIds,
  ]);

  const now = new Date();
  const updates: { id: number; result: string; actualValue: number }[] = [];
  let skipped = 0;

  for (const row of rows) {
    if (row.kind === "league_total") {
      updates.push({
        id: row.id,
        result: gradeLeagueTotal(actuals.totalPoints, row.line),
        actualValue: actuals.totalPoints,
      });
    } else if (row.kind === "ceiling_watch") {
      updates.push({
        id: row.id,
        result: gradeCeilingWatch(actuals.maxPoints, row.line),
        actualValue: actuals.maxPoints,
      });
    } else if (row.kind === "mercy_line") {
      const matchupId = row.subjectId ? Number(row.subjectId) : NaN;
      const margin = actuals.marginByMatchup.get(matchupId);
      if (margin == null) {
        // Two-sided data missing for this matchup; skip rather than throw.
        skipped++;
        continue;
      }
      updates.push({
        id: row.id,
        result: gradeMercyLine(margin, row.line),
        actualValue: margin,
      });
    } else if (row.kind === "blowout_special") {
      updates.push({
        id: row.id,
        result: gradeBlowout(actuals.maxMargin, row.line),
        actualValue: actuals.maxMargin,
      });
    } else if (row.kind === "upset_special") {
      const pair = parsePairSubject(row.subjectId);
      const sides = pair ? actuals.rosterPointsByMatchup.get(Number(pair[0])) : undefined;
      if (!pair || !sides || sides.length !== 2) {
        skipped++;
        continue;
      }
      const dog = sides.find(([rosterId]) => rosterId === pair[1]);
      const favorite = sides.find(([rosterId]) => rosterId !== pair[1]);
      if (!dog || !favorite) {
        skipped++;
        continue;
      }
      updates.push({
        id: row.id,
        result: gradeUpset(dog[1], favorite[1]),
        actualValue: dog[1] - favorite[1],
      });
    } else if (row.kind === "player_points") {
      const points = row.subjectId ? playerActuals.get(row.subjectId) : undefined;
      if (points == null) {
        // No row for this player at all (dropped and unrostered all week).
        // Stays ungraded until the data appears rather than grading a zero
        // nobody can verify.
        skipped++;
        continue;
      }
      updates.push({
        id: row.id,
        result: gradePlayerPoints(points, row.line),
        actualValue: points,
      });
    } else if (row.kind === "team_total") {
      const points = row.subjectId
        ? actuals.pointsByFranchise.get(row.subjectId)
        : undefined;
      if (points == null) {
        skipped++;
        continue;
      }
      updates.push({
        id: row.id,
        result: gradeTeamTotal(points, row.line),
        actualValue: points,
      });
    } else if (row.kind === "player_matchbet" || row.kind === "franchise_matchbet") {
      const pair = parsePairSubject(row.subjectId);
      const source =
        row.kind === "player_matchbet"
          ? (id: string) => playerActuals.get(id)
          : (id: string) => actuals.pointsByFranchise.get(id);
      const pointsA = pair ? source(pair[0]) : undefined;
      const pointsB = pair ? source(pair[1]) : undefined;
      if (pointsA == null || pointsB == null) {
        skipped++;
        continue;
      }
      updates.push({
        id: row.id,
        // Exact equality pushes: two real scores can be genuinely equal, and
        // pretending otherwise would hand somebody a win they did not get.
        result: gradeMatchbet(pointsA, pointsB),
        actualValue: pointsA - pointsB,
      });
    } else {
      skipped++;
    }
  }

  if (updates.length === 0) return { graded: 0, skipped };

  // One batch of per-row updates, all-or-nothing per grading pass (atomic per
  // data type), not a loop of separately awaited statements. runAtomic's
  // BatchArg is a non-empty TUPLE type (batch() requires at least one
  // statement); `updates` is only known non-empty at runtime (checked above),
  // so the map's plain array result needs an explicit cast to satisfy it.
  await runAtomic((executor) => {
    const statements = updates.map((u) =>
      executor
        .update(bookProps)
        .set({ result: u.result, actualValue: u.actualValue, gradedAt: now, updatedAt: now })
        .where(eq(bookProps.id, u.id)),
    );
    return statements as unknown as Parameters<typeof executor.batch>[0];
  });

  return { graded: updates.length, skipped };
}
