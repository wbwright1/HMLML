import { db } from "@/lib/db";
import {
  bookProps,
  bookPropPicks,
  franchises,
  franchiseSeasons,
  matchups,
  nflGames,
  players,
  playerWeekPoints,
  seasons,
} from "@/lib/db/schema";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { PropKind, PropResult, PropSide } from "@/lib/book/props";
import {
  formatPropActual,
  formatPropLine,
  parsePairSubject,
  PROP_GROUP,
  PROP_ORDER,
  propLineUnit,
  propSideLabels,
} from "@/lib/book/props";
import { formatMoneyline, payoutLabel } from "@/lib/book/pricing";
import {
  DEFAULT_STAKE,
  type BookPropEntity,
  type BookPropSubject,
  type BookPropView,
  type MemberPropPick,
} from "@/lib/book/shared";

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

/**
 * Trailing-two-season weekly matchup MARGINS, feeding chooseBlowoutThreshold's
 * percentile. Same window and the same complete-only discipline as
 * getHistoricalWeeklyScores, one value per matchup rather than per roster.
 */
export async function getHistoricalMargins(seasonId: number): Promise<number[]> {
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
    .select({
      seasonId: matchups.seasonId,
      week: matchups.week,
      matchupId: matchups.matchupId,
      points: matchups.points,
    })
    .from(matchups)
    .where(
      and(inArray(matchups.seasonId, seasonIds), eq(matchups.status, "complete")),
    );

  const sides = new Map<string, number[]>();
  for (const row of rows) {
    const key = `${row.seasonId}:${row.week}:${row.matchupId}`;
    const list = sides.get(key) ?? [];
    list.push(row.points ?? 0);
    sides.set(key, list);
  }

  const margins: number[] = [];
  for (const pair of sides.values()) {
    if (pair.length !== 2) continue;
    margins.push(Math.abs(pair[0] - pair[1]));
  }
  return margins;
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
  /** rosterId -> points. Team totals and the Upset Special read this. */
  pointsByRoster: Map<string, number>;
  /** franchiseId -> points. What a franchise-keyed prop grades against. */
  pointsByFranchise: Map<string, number>;
  /** matchupId -> both sides, so the Upset Special can tell them apart. */
  rosterPointsByMatchup: Map<number, [string, number][]>;
  /** The week's largest margin of victory. The Blowout Special's number. */
  maxMargin: number;
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
      franchiseId: matchups.franchiseId,
      points: matchups.points,
      status: matchups.status,
    })
    .from(matchups)
    .where(and(eq(matchups.seasonId, seasonId), eq(matchups.week, week)));

  if (rows.length === 0) {
    return {
      complete: false,
      totalPoints: 0,
      maxPoints: 0,
      marginByMatchup: new Map(),
      pointsByRoster: new Map(),
      pointsByFranchise: new Map(),
      rosterPointsByMatchup: new Map(),
      maxMargin: 0,
    };
  }

  const complete = rows.every((r) => r.status === "complete");

  const byMatchup = new Map<number, { rosterId: string; points: number }[]>();
  const pointsByRoster = new Map<string, number>();
  const pointsByFranchise = new Map<string, number>();
  for (const row of rows) {
    const list = byMatchup.get(row.matchupId) ?? [];
    list.push({ rosterId: row.rosterId, points: row.points ?? 0 });
    byMatchup.set(row.matchupId, list);
    // Every per-roster and per-franchise number comes off the SAME matchups
    // rows the league total and the week max do, so a team total can never
    // disagree with the League Total about what somebody scored.
    pointsByRoster.set(row.rosterId, row.points ?? 0);
    pointsByFranchise.set(row.franchiseId, row.points ?? 0);
  }

  let totalPoints = 0;
  let maxPoints = 0;
  for (const row of rows) {
    totalPoints += row.points ?? 0;
    maxPoints = Math.max(maxPoints, row.points ?? 0);
  }

  const marginByMatchup = new Map<number, number>();
  const rosterPointsByMatchup = new Map<number, [string, number][]>();
  let maxMargin = 0;
  for (const [matchupId, sides] of byMatchup) {
    rosterPointsByMatchup.set(
      matchupId,
      sides.map((s) => [s.rosterId, s.points] as [string, number]),
    );
    if (sides.length !== 2) continue;
    const margin = Math.abs(sides[0].points - sides[1].points);
    marginByMatchup.set(matchupId, margin);
    maxMargin = Math.max(maxMargin, margin);
  }

  return {
    complete,
    totalPoints,
    maxPoints,
    marginByMatchup,
    pointsByRoster,
    pointsByFranchise,
    rosterPointsByMatchup,
    maxMargin,
  };
}

/**
 * League-scored points for specific players in one week, keyed by player id.
 *
 * Deliberately NOT filtered by `started`: a player prop grades on what the
 * player scored, full stop. Voiding it because his manager benched him would
 * be a rule nobody can read on the card. A player with no row at all (dropped
 * and unrostered all week) simply does not appear, and grading skips him
 * rather than inventing a zero.
 */
export async function getWeekPlayerActuals(
  seasonId: number,
  week: number,
  playerIds: string[],
): Promise<Map<string, number>> {
  if (playerIds.length === 0) return new Map();

  const rows = await db
    .select({
      playerId: playerWeekPoints.playerId,
      points: playerWeekPoints.points,
    })
    .from(playerWeekPoints)
    .where(
      and(
        eq(playerWeekPoints.seasonId, seasonId),
        eq(playerWeekPoints.week, week),
        inArray(playerWeekPoints.playerId, playerIds),
      ),
    );

  const map = new Map<string, number>();
  for (const row of rows) {
    // A player can only be on one roster in a week, so the key is unique in
    // practice; keeping the highest guards a mid-week roster move leaving two
    // rows behind rather than silently taking whichever came back first.
    const existing = map.get(row.playerId);
    if (existing == null || row.points > existing) map.set(row.playerId, row.points);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Slate inputs: what the generator needs to build the expanded week
// ---------------------------------------------------------------------------

export interface StarterProjection {
  playerId: string;
  rosterId: string;
  franchiseId: string;
  projected: number;
  name: string;
  position: string | null;
  nflTeam: string | null;
}

/**
 * Every projected STARTER for a week, with the player's identity attached.
 *
 * Starters only: a bench player's projection is not a bet anybody would take,
 * and the projection itself is what the whole slate is priced from.
 */
export async function getWeekStarterProjections(
  seasonId: number,
  week: number,
): Promise<StarterProjection[]> {
  const rows = await db
    .select({
      playerId: playerWeekPoints.playerId,
      rosterId: playerWeekPoints.rosterId,
      franchiseId: playerWeekPoints.franchiseId,
      projected: playerWeekPoints.projectedPoints,
      name: players.fullName,
      position: players.position,
      nflTeam: players.nflTeam,
    })
    .from(playerWeekPoints)
    .leftJoin(players, eq(players.id, playerWeekPoints.playerId))
    .where(
      and(
        eq(playerWeekPoints.seasonId, seasonId),
        eq(playerWeekPoints.week, week),
        eq(playerWeekPoints.started, true),
        isNotNull(playerWeekPoints.projectedPoints),
      ),
    );

  return rows
    .filter((r) => r.projected != null)
    .map((r) => ({
      playerId: r.playerId,
      rosterId: r.rosterId,
      franchiseId: r.franchiseId,
      projected: r.projected as number,
      name: r.name ?? `Player ${r.playerId}`,
      position: r.position,
      nflTeam: r.nflTeam,
    }));
}

/**
 * The subject ids already posted for each kind this week, in the order they
 * were first posted (row id ascending).
 *
 * This is the input that makes repricing sticky: whatever is already on the
 * board stays on the board, because a member may already have picked it.
 */
export async function getExistingPropSubjects(
  seasonId: number,
  week: number,
): Promise<Map<string, string[]>> {
  const rows = await db
    .select({ id: bookProps.id, kind: bookProps.kind, subjectId: bookProps.subjectId })
    .from(bookProps)
    .where(and(eq(bookProps.seasonId, seasonId), eq(bookProps.week, week)))
    .orderBy(bookProps.id);

  const map = new Map<string, string[]>();
  for (const row of rows) {
    if (row.subjectId == null) continue;
    const list = map.get(row.kind) ?? [];
    list.push(row.subjectId);
    map.set(row.kind, list);
  }
  return map;
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

/**
 * The kicker on each card. No ordinal numbering: the slate is 8 to 15 rows
 * deep now and grows or shrinks with the data, so a "Prop 04" printed on a
 * card would be wrong the first week a thin slate posted.
 */
const PROP_LABELS: Record<PropKind, string> = {
  league_total: "League Total",
  ceiling_watch: "Ceiling Watch",
  mercy_line: "The Mercy Line",
  blowout_special: "Blowout Special",
  upset_special: "Upset Special",
  player_points: "Player Points",
  team_total: "Team Total",
  player_matchbet: "Player Matchbet",
  franchise_matchbet: "Franchise Matchbet",
};

/** The subject ids one row refers to, whatever shape its kind stores them in. */
function subjectRefs(
  kind: PropKind,
  subjectId: string | null,
): { players: string[]; franchises: string[]; rosters: string[] } {
  const pair = parsePairSubject(subjectId);
  switch (kind) {
    case "player_points":
      return { players: subjectId ? [subjectId] : [], franchises: [], rosters: [] };
    case "team_total":
      return { players: [], franchises: subjectId ? [subjectId] : [], rosters: [] };
    case "player_matchbet":
      return { players: pair ? [pair[0], pair[1]] : [], franchises: [], rosters: [] };
    case "franchise_matchbet":
      return { players: [], franchises: pair ? [pair[0], pair[1]] : [], rosters: [] };
    case "upset_special":
      // Stored as "<matchupId>~<dogRosterId>": only the roster half names anyone.
      return { players: [], franchises: [], rosters: pair ? [pair[1]] : [] };
    default:
      return { players: [], franchises: [], rosters: [] };
  }
}

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
    .orderBy(bookProps.id);

  if (rows.length === 0) return [];

  // One batched lookup per entity type, resolved at read time so a rename
  // never leaves a stale name printed on a booked prop.
  const playerIds = new Set<string>();
  const franchiseIds = new Set<string>();
  const rosterIds = new Set<string>();
  for (const row of rows) {
    const refs = subjectRefs(row.kind as PropKind, row.subjectId);
    refs.players.forEach((id) => playerIds.add(id));
    refs.franchises.forEach((id) => franchiseIds.add(id));
    refs.rosters.forEach((id) => rosterIds.add(id));
  }

  const rosterToFranchise = new Map<string, string>();
  if (rosterIds.size > 0) {
    const mapRows = await db
      .select({
        rosterId: franchiseSeasons.rosterId,
        franchiseId: franchiseSeasons.franchiseId,
      })
      .from(franchiseSeasons)
      .where(
        and(
          eq(franchiseSeasons.seasonId, seasonId),
          inArray(franchiseSeasons.rosterId, [...rosterIds]),
        ),
      );
    for (const r of mapRows) {
      rosterToFranchise.set(r.rosterId, r.franchiseId);
      franchiseIds.add(r.franchiseId);
    }
  }

  const playerById = new Map<string, BookPropEntity>();
  if (playerIds.size > 0) {
    const playerRows = await db
      .select({
        id: players.id,
        fullName: players.fullName,
        position: players.position,
        nflTeam: players.nflTeam,
      })
      .from(players)
      .where(inArray(players.id, [...playerIds]));
    for (const p of playerRows) {
      playerById.set(p.id, {
        kind: "player",
        playerId: p.id,
        name: p.fullName ?? `Player ${p.id}`,
        position: p.position,
        nflTeam: p.nflTeam,
      });
    }
  }

  const franchiseById = new Map<string, BookPropEntity>();
  if (franchiseIds.size > 0) {
    const franchiseRows = await db
      .select({
        id: franchises.id,
        slug: franchises.slug,
        name: franchises.name,
        abbreviation: franchises.abbreviation,
        brandingColor: franchises.brandingColor,
      })
      .from(franchises)
      .where(inArray(franchises.id, [...franchiseIds]));
    for (const f of franchiseRows) {
      franchiseById.set(f.id, {
        kind: "franchise",
        franchiseId: f.id,
        slug: f.slug,
        name: f.name,
        abbreviation: f.abbreviation,
        brandingColor: f.brandingColor,
      });
    }
  }

  function resolveSubject(kind: PropKind, subjectId: string | null): BookPropSubject | null {
    const pair = parsePairSubject(subjectId);
    switch (kind) {
      case "player_points":
        return subjectId ? (playerById.get(subjectId) ?? null) : null;
      case "team_total":
        return subjectId ? (franchiseById.get(subjectId) ?? null) : null;
      case "player_matchbet": {
        if (!pair) return null;
        const a = playerById.get(pair[0]);
        const b = playerById.get(pair[1]);
        return a && b ? { kind: "pair", a, b } : null;
      }
      case "franchise_matchbet": {
        if (!pair) return null;
        const a = franchiseById.get(pair[0]);
        const b = franchiseById.get(pair[1]);
        return a && b ? { kind: "pair", a, b } : null;
      }
      case "upset_special": {
        if (!pair) return null;
        const franchiseId = rosterToFranchise.get(pair[1]);
        return franchiseId ? (franchiseById.get(franchiseId) ?? null) : null;
      }
      default:
        return null;
    }
  }

  const views: BookPropView[] = rows.map((row) => {
    const kind = row.kind as PropKind;
    const labels = propSideLabels(kind);
    const subject = resolveSubject(kind, row.subjectId);
    const result = (row.result as PropResult | null) ?? null;

    // A matchbet's two sides ARE the two subjects, so the buttons say their
    // names rather than "Over" and "Under", which would mean nothing here.
    const pairSides =
      subject && subject.kind === "pair"
        ? { over: subject.a.name, under: subject.b.name }
        : labels;

    return {
      id: row.id,
      kind,
      group: PROP_GROUP[kind] ?? "specials",
      label: PROP_LABELS[kind] ?? row.kind,
      question: row.question,
      lineDisplay: formatPropLine(kind, row.line),
      lineUnit: propLineUnit(kind),
      subject,
      overLabel: pairSides.over,
      underLabel: pairSides.under,
      overOdds: formatMoneyline(row.overOdds),
      underOdds: formatMoneyline(row.underOdds),
      overPayout: payoutLabel(row.overOdds, DEFAULT_STAKE),
      underPayout: payoutLabel(row.underOdds, DEFAULT_STAKE),
      snark: row.snark,
      result,
      actualDisplay:
        row.actualValue == null ? null : formatPropActual(kind, row.actualValue, result),
    };
  });

  // Stable, kind-driven order: the tab must not reshuffle itself every hour
  // just because repricing touched rows in a different sequence.
  return views.sort((a, b) => {
    const byKind = (PROP_ORDER[a.kind] ?? 99) - (PROP_ORDER[b.kind] ?? 99);
    return byKind !== 0 ? byKind : a.id - b.id;
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
