import { db } from "@/lib/db";
import {
  bookProps,
  bookPropPicks,
  matchups,
  nflGames,
  seasons,
} from "@/lib/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { PropKind, PropResult, PropSide } from "@/lib/book/props";
import { formatPropLine, propSideLabels } from "@/lib/book/props";
import { formatMoneyline, payoutLabel } from "@/lib/book/pricing";
import { DEFAULT_STAKE, type BookPropView, type MemberPropPick } from "@/lib/book/shared";

// ---------------------------------------------------------------------------
// Lock state: props lock at the WEEK's first kickoff, not per-game like
// book_lines. A single true/false covers every prop on the board.
// ---------------------------------------------------------------------------

/**
 * True once ANY NFL game in this fantasy week has kicked off (or finished).
 * Read from real game status, never a points heuristic, same discipline as
 * getRosterKickoffStates in lib/queries/book.ts.
 */
export async function isWeekLocked(
  seasonYear: number,
  week: number,
): Promise<boolean> {
  const [row] = await db
    .select({
      started: sql<boolean>`bool_or(${nflGames.status} <> 'pre_game')`,
    })
    .from(nflGames)
    .where(and(eq(nflGames.seasonYear, seasonYear), eq(nflGames.week, week)));

  return Boolean(row?.started);
}

// ---------------------------------------------------------------------------
// History: what chooseCeilingThreshold and the Ceiling Watch snark line need
// ---------------------------------------------------------------------------

/**
 * Trailing-two-season weekly team scores (regular season and playoffs both
 * count; this is about scoring volatility, not standings), feeding
 * chooseCeilingThreshold's percentile. Only COMPLETE matchups count: a
 * scheduled or in-progress row's points are a snapshot, not a final score.
 */
export async function getHistoricalWeeklyScores(
  seasonId: number,
): Promise<number[]> {
  const [current] = await db
    .select({ seasonYear: seasons.seasonYear })
    .from(seasons)
    .where(eq(seasons.id, seasonId))
    .limit(1);
  if (!current) return [];

  const seasonRows = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(
      and(
        sql`${seasons.seasonYear} >= ${current.seasonYear - 2}`,
        sql`${seasons.seasonYear} <= ${current.seasonYear}`,
      ),
    );
  const seasonIds = seasonRows.map((r) => r.id);
  if (seasonIds.length === 0) return [];

  const rows = await db
    .select({ points: matchups.points })
    .from(matchups)
    .where(
      and(inArray(matchups.seasonId, seasonIds), eq(matchups.status, "complete")),
    );

  return rows.map((r) => r.points ?? 0);
}

/** This season's highest single-week team score, for the Ceiling Watch snark line. */
export async function getSeasonHighScore(
  seasonId: number,
): Promise<{ points: number; week: number; rosterId: string } | null> {
  const [row] = await db
    .select({
      points: matchups.points,
      week: matchups.week,
      rosterId: matchups.rosterId,
    })
    .from(matchups)
    .where(and(eq(matchups.seasonId, seasonId), eq(matchups.status, "complete")))
    .orderBy(desc(matchups.points))
    .limit(1);

  if (!row || row.points == null) return null;
  return { points: row.points, week: row.week, rosterId: row.rosterId };
}

// ---------------------------------------------------------------------------
// Week actuals: what gradeBookProps reads
// ---------------------------------------------------------------------------

export interface WeekActuals {
  /** True only when every matchup this week has finished. */
  complete: boolean;
  totalPoints: number;
  maxPoints: number;
  /** matchupId -> the winning side's margin of victory (always >= 0). */
  marginByMatchup: Map<number, number>;
}

/**
 * Actual results for one fantasy week, read from matchups. `complete` gates
 * grading: a week is only graded once every matchup in it is 'complete',
 * because a partial week's total/max/margins are not the real numbers yet.
 */
export async function getWeekActuals(
  seasonId: number,
  week: number,
): Promise<WeekActuals> {
  const rows = await db
    .select({
      matchupId: matchups.matchupId,
      rosterId: matchups.rosterId,
      points: matchups.points,
      status: matchups.status,
    })
    .from(matchups)
    .where(and(eq(matchups.seasonId, seasonId), eq(matchups.week, week)));

  if (rows.length === 0) {
    return { complete: false, totalPoints: 0, maxPoints: 0, marginByMatchup: new Map() };
  }

  const complete = rows.every((r) => r.status === "complete");

  const byMatchup = new Map<number, { rosterId: string; points: number }[]>();
  for (const row of rows) {
    const list = byMatchup.get(row.matchupId) ?? [];
    list.push({ rosterId: row.rosterId, points: row.points ?? 0 });
    byMatchup.set(row.matchupId, list);
  }

  let totalPoints = 0;
  let maxPoints = 0;
  for (const row of rows) {
    totalPoints += row.points ?? 0;
    maxPoints = Math.max(maxPoints, row.points ?? 0);
  }

  const marginByMatchup = new Map<number, number>();
  for (const [matchupId, sides] of byMatchup) {
    if (sides.length !== 2) continue;
    marginByMatchup.set(matchupId, Math.abs(sides[0].points - sides[1].points));
  }

  return { complete, totalPoints, maxPoints, marginByMatchup };
}

// ---------------------------------------------------------------------------
// Projected pairings: what generateOrRepriceBookProps feeds findBiggestFavorite
// ---------------------------------------------------------------------------

export interface WeekPairing {
  matchupId: number;
  rosterA: string;
  rosterB: string;
}

/** Every matchup pairing for a week, as (rosterA, rosterB). */
export async function getWeekPairings(
  seasonId: number,
  week: number,
): Promise<WeekPairing[]> {
  const rows = await db
    .select({ matchupId: matchups.matchupId, rosterId: matchups.rosterId })
    .from(matchups)
    .where(and(eq(matchups.seasonId, seasonId), eq(matchups.week, week)));

  const byMatchup = new Map<number, string[]>();
  for (const row of rows) {
    const list = byMatchup.get(row.matchupId) ?? [];
    list.push(row.rosterId);
    byMatchup.set(row.matchupId, list);
  }

  const pairings: WeekPairing[] = [];
  for (const [matchupId, rosterIds] of byMatchup) {
    if (rosterIds.length !== 2) continue;
    pairings.push({ matchupId, rosterA: rosterIds[0], rosterB: rosterIds[1] });
  }
  return pairings;
}

// ---------------------------------------------------------------------------
// Read side: the Props tab
// ---------------------------------------------------------------------------

const PROP_LABELS: Record<PropKind, string> = {
  league_total: "Prop 01 · League Total",
  ceiling_watch: "Prop 02 · Ceiling Watch",
  mercy_line: "Prop 03 · The Mercy Line",
};

/**
 * The Props tab's data, formatted from the stored book_props rows.
 *
 * Reads only; generation and repricing happen in lib/sync/book-props.ts. A
 * week with no props yet (not synced) returns an empty array, same contract
 * as getBookBoard for book_lines.
 */
export async function getBookProps(
  seasonId: number,
  week: number,
): Promise<BookPropView[]> {
  const rows = await db
    .select()
    .from(bookProps)
    .where(and(eq(bookProps.seasonId, seasonId), eq(bookProps.week, week)))
    .orderBy(bookProps.kind);

  return rows.map((row) => {
    const kind = row.kind as PropKind;
    const labels = propSideLabels(kind);

    return {
      id: row.id,
      kind,
      label: PROP_LABELS[kind] ?? row.kind,
      question: row.question,
      lineDisplay: formatPropLine(kind, row.line),
      overLabel: labels.over,
      underLabel: labels.under,
      overOdds: formatMoneyline(row.overOdds),
      underOdds: formatMoneyline(row.underOdds),
      overPayout: payoutLabel(row.overOdds, DEFAULT_STAKE),
      underPayout: payoutLabel(row.underOdds, DEFAULT_STAKE),
      snark: row.snark,
      result: (row.result as PropResult | null) ?? null,
    };
  });
}

/** One prop row, as the server action needs it to book a pick. */
export async function getBookPropById(propId: number) {
  const [row] = await db
    .select()
    .from(bookProps)
    .where(eq(bookProps.id, propId))
    .limit(1);
  return row ?? null;
}

/** One member's prop picks for a week, keyed by prop id. */
export async function getMemberPropPicksForWeek(
  memberId: number,
  seasonId: number,
  week: number,
): Promise<MemberPropPick[]> {
  const rows = await db
    .select({
      propId: bookPropPicks.propId,
      side: bookPropPicks.side,
      oddsAtPick: bookPropPicks.oddsAtPick,
      lockedAt: bookPropPicks.lockedAt,
    })
    .from(bookPropPicks)
    .innerJoin(bookProps, eq(bookProps.id, bookPropPicks.propId))
    .where(
      and(
        eq(bookPropPicks.memberId, memberId),
        eq(bookProps.seasonId, seasonId),
        eq(bookProps.week, week),
      ),
    );

  return rows.map((r) => ({
    propId: r.propId,
    side: (r.side === "under" ? "under" : "over") as PropSide,
    oddsAtPick: r.oddsAtPick,
    lockedAt: r.lockedAt ? r.lockedAt.toISOString() : null,
  }));
}

// ---------------------------------------------------------------------------
// Locking guard support (mirrors book_picks' "slip has a locked row" check)
// ---------------------------------------------------------------------------

/** Any of this member's prop picks locked this week, so the props panel is closed. */
export async function memberHasLockedPropPick(
  memberId: number,
  seasonId: number,
  week: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: bookPropPicks.id })
    .from(bookPropPicks)
    .innerJoin(bookProps, eq(bookProps.id, bookPropPicks.propId))
    .where(
      and(
        eq(bookPropPicks.memberId, memberId),
        eq(bookProps.seasonId, seasonId),
        eq(bookProps.week, week),
        sql`${bookPropPicks.lockedAt} IS NOT NULL`,
      ),
    )
    .limit(1);
  return Boolean(row);
}
