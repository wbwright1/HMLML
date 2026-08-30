import { db } from "@/lib/db";
import { bookProps, type NewBookProp } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { runAtomic } from "@/lib/db/atomic";
import {
  chooseCeilingThreshold,
  findBiggestFavorite,
  gradeCeilingWatch,
  gradeLeagueTotal,
  gradeMercyLine,
  priceCeilingWatch,
  priceLeagueTotal,
  priceMercyLine,
  type ProjectedPairing,
} from "@/lib/book/props";
import { BOOK_COPY } from "@/lib/book/shared";
import { getWeekProjectedTotals } from "@/lib/queries/book";
import { getRosterToFranchiseMap } from "@/lib/queries/franchise-mapping";
import {
  getHistoricalWeeklyScores,
  getSeasonHighScore,
  getWeekActuals,
  getWeekPairings,
  isWeekLocked,
} from "@/lib/queries/book-props";

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

  // One statement for the whole week, matching repriceBookLines's discipline:
  // a per-prop loop that dies halfway would leave some props on this hour's
  // numbers and some on last hour's.
  await db
    .insert(bookProps)
    .values(rows)
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

  return { rowCount: rows.length, locked: false };
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
