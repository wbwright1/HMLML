import { db } from "@/lib/db";
import { bookProps, type NewBookProp } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { runAtomic } from "@/lib/db/atomic";
import {
  chooseBlowoutThreshold,
  chooseCeilingThreshold,
  encodePairSubject,
  findBiggestFavorite,
  gradeBlowout,
  gradeCeilingWatch,
  gradeMatchbet,
  gradeMercyLine,
  gradeOverUnderLine,
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
  SCORE_UNCERTAINTY_SCALE,
  selectStickySubjects,
  type BiggestFavorite,
  type ProjectedPairing,
  type PropKind,
  type PropResult,
} from "@/lib/book/props";
import { BOOK_COPY } from "@/lib/book/shared";
import { getWeekProjectedTotals } from "@/lib/queries/book";
import { getRosterToFranchiseMap } from "@/lib/queries/franchise-mapping";
import {
  getExistingProps,
  getHistoricalOutcomes,
  getSeasonHighScore,
  getWeekActuals,
  getWeekPairings,
  getWeekPlayerActuals,
  getWeekPlayerProjections,
  isWeekLocked,
  type ExistingProp,
  type PlayerProjection,
  type WeekActuals,
} from "@/lib/queries/book-props";

/** How many rows each variable block aims for in a normal week. */
const PLAYER_PROP_TARGET = 5;
const TEAM_TOTAL_TARGET = 3;
const MATCHBET_TARGET = 1;

export interface PropRepriceResult {
  rowCount: number;
  locked: boolean;
}

/** The upsert's natural key, as a string, for "is this already posted" checks. */
function propKey(kind: string, subjectId: string | null): string {
  return `${kind}|${subjectId ?? ""}`;
}

/** The subject ids already posted for one kind, oldest first. */
function postedSubjects(existing: ExistingProp[], kind: PropKind): string[] {
  return existing
    .filter((row) => row.kind === kind && row.subjectId != null)
    .map((row) => row.subjectId as string);
}

/** A league-wide kind's already-posted row, if there is one. */
function postedRow(existing: ExistingProp[], kind: PropKind): ExistingProp | null {
  return existing.find((row) => row.kind === kind) ?? null;
}

/**
 * Generates (or reprices) the week's slate of props.
 *
 * Unlike book_lines, props lock as a WEEK, not per-game: once any NFL game
 * this fantasy week has kicked off, the whole set is left alone rather than
 * moved out from under a pick made before the first snap. Rows keep the SAME
 * id across repricing (upsert on the natural key), so book_prop_picks.propId
 * stays valid across a member's whole week even as the numbers move
 * hour-to-hour before lock.
 *
 * Two rules hold the whole thing together, and every kind obeys both:
 *  1. A subject already posted this week stays posted and gets repriced. New
 *     subjects only ever FILL up to target. Nothing is deleted mid-week, and
 *     no kind ever posts a SECOND row because its subject moved.
 *  2. A threshold is chosen once, on the run that creates the row, and reused
 *     from the stored line after that. A late stat correction must not move a
 *     line under a pick that was booked against it.
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

  // Read first: it decides whether the multi-season history scan is needed at
  // all, and it is one small single-week query.
  const existing = await getExistingProps(seasonId, week);
  const postedCeiling = postedRow(existing, "ceiling_watch");
  const postedBlowout = postedRow(existing, "blowout_special");
  const needHistory = postedCeiling === null || postedBlowout === null;

  const [projections, rosterToFranchise, seasonHigh, playerProjections, history] =
    await Promise.all([
      getWeekProjectedTotals(seasonId, seasonYear, week),
      getRosterToFranchiseMap(seasonId),
      getSeasonHighScore(seasonId),
      getWeekPlayerProjections(seasonId, week),
      // Thousands of rows over Neon HTTP, and only the creating run needs it.
      needHistory
        ? getHistoricalOutcomes(seasonId)
        : Promise.resolve({ scores: [], margins: [] }),
    ]);

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
  const threshold = postedCeiling
    ? postedCeiling.line
    : chooseCeilingThreshold(history.scores);
  const ceilingWatch = priceCeilingWatch(totals, threshold);
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

  // Both matchup-keyed specials name the same pairing, and both must keep
  // naming the SAME one all week: their subject_id is part of the upsert key,
  // so re-deriving it from moving projections would post a second card and
  // strand any pick already sitting on the first.
  const postedMercy = postedRow(existing, "mercy_line");
  const postedUpset = postedRow(existing, "upset_special");
  const liveFavorite = findBiggestFavorite(pairings);
  const mercyFavorite = postedMercy
    ? favoriteForMatchup(pairings, Number(postedMercy.subjectId))
    : liveFavorite;
  const upsetPair = parsePairSubject(postedUpset?.subjectId ?? null);
  const upsetFavorite = upsetPair
    ? favoriteForMatchup(pairings, Number(upsetPair[0]), upsetPair[1])
    : liveFavorite;

  if (mercyFavorite) {
    const mercyLine = priceMercyLine(
      mercyFavorite.favoriteProjected,
      mercyFavorite.dogProjected,
    );
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
      subjectId: String(mercyFavorite.matchupId),
      question: "Projected doormat's margin of defeat",
      line: postedMercy ? postedMercy.line : mercyLine.line,
      overOdds: -110,
      underOdds: -110,
      snark: "Under bettors believe in miracles.",
      updatedAt: now,
    });
  }

  // Prop 4: the Blowout Special (league-wide, any matchup)
  const blowoutThreshold = postedBlowout
    ? postedBlowout.line
    : chooseBlowoutThreshold(history.margins);
  if (pairings.length > 0) {
    const blowout = priceBlowoutSpecial(pairings, blowoutThreshold);
    rows.push({
      seasonId,
      week,
      kind: "blowout_special",
      subjectType: "league",
      subjectId: null,
      // Numeral-free: the threshold renders on the card's line, in the mono
      // face, per CLAUDE.md's three-font rule. Baking it into prose would set
      // it in Geist.
      question: "Does anyone win by a landslide this week?",
      line: blowoutThreshold,
      overOdds: blowout.overOdds,
      underOdds: blowout.underOdds,
      snark: BOOK_COPY.blowoutSnark(),
      updatedAt: now,
    });
  }

  // Prop 5: the Upset Special (the week's biggest dog, outright). No pricer of
  // its own: it is a matchbet with the dog as side A.
  if (upsetFavorite) {
    const upset = priceMatchbet(
      upsetFavorite.dogProjected,
      upsetFavorite.favoriteProjected,
      SCORE_UNCERTAINTY_SCALE,
    );
    rows.push({
      seasonId,
      week,
      kind: "upset_special",
      // Same reasoning as mercy_line's 'matchup' subjectType: grading needs
      // BOTH sides, and it needs to know which one was the dog, so the
      // composite id carries the matchup and the dog's roster together.
      subjectType: "matchup",
      subjectId: encodePairSubject(
        String(upsetFavorite.matchupId),
        upsetFavorite.dogRosterId,
      ),
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
  // -------------------------------------------------------------------------
  const scheduledRosters = new Set<string>();
  for (const p of pairingRows) {
    scheduledRosters.add(p.rosterA);
    scheduledRosters.add(p.rosterB);
  }

  rows.push(
    ...buildPlayerPointRows({
      seasonId,
      week,
      now,
      playerProjections,
      existing: postedSubjects(existing, "player_points"),
    }),
  );

  const franchiseProjections = new Map<string, number>();
  for (const [rosterId, franchiseId] of rosterToFranchise) {
    // A franchise with no matchup this week (eliminated from the playoff
    // bracket) has no points row to grade against, so it is never posted.
    if (!scheduledRosters.has(rosterId)) continue;
    const proj = projections.get(rosterId);
    if (proj != null) franchiseProjections.set(franchiseId, proj);
  }

  rows.push(
    ...buildTeamTotalRows({
      seasonId,
      week,
      now,
      franchiseProjections,
      existing: postedSubjects(existing, "team_total"),
    }),
  );

  const playerMatchbet = buildPlayerMatchbetRow({
    seasonId,
    week,
    now,
    playerProjections,
    existing: postedSubjects(existing, "player_matchbet"),
  });
  if (playerMatchbet) rows.push(playerMatchbet);

  const franchiseMatchbet = buildFranchiseMatchbetRow({
    seasonId,
    week,
    now,
    pairings,
    rosterToFranchise,
    franchiseProjections,
    existing: postedSubjects(existing, "franchise_matchbet"),
  });
  if (franchiseMatchbet) rows.push(franchiseMatchbet);

  // Cap NEW additions only. A row that is already posted is always repriced,
  // even if the slate has outgrown the cap: dropping it from the batch would
  // freeze its odds at whatever hour it fell off, on a card members can still
  // see and may already have picked.
  const posted = new Set(existing.map((row) => propKey(row.kind, row.subjectId)));
  const stickyCount = rows.filter((row) =>
    posted.has(propKey(row.kind, row.subjectId ?? null)),
  ).length;
  let allowance = Math.max(0, MAX_WEEKLY_PROPS - stickyCount);
  const slate: NewBookProp[] = [];
  for (const row of rows) {
    if (posted.has(propKey(row.kind, row.subjectId ?? null))) {
      slate.push(row);
      continue;
    }
    if (allowance === 0) continue;
    allowance--;
    slate.push(row);
  }

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

/**
 * The favorite/dog split for ONE already-named matchup, so a posted
 * matchup-keyed special reprices against the pairing it was posted on rather
 * than against whoever is the biggest favorite right now. `dogRosterId` pins
 * which side was the dog when the row was created, because a projection swing
 * can flip who the favorite is without changing who the card is about. Null
 * when that matchup is not in this week's pairings at all, which leaves the
 * posted row untouched.
 */
function favoriteForMatchup(
  pairings: ProjectedPairing[],
  matchupId: number,
  dogRosterId?: string,
): BiggestFavorite | null {
  const pairing = pairings.find((p) => p.matchupId === matchupId);
  if (!pairing) return null;
  const aIsDog = dogRosterId
    ? pairing.rosterA === dogRosterId
    : pairing.projA < pairing.projB;
  return aIsDog
    ? {
        matchupId,
        favoriteRosterId: pairing.rosterB,
        dogRosterId: pairing.rosterA,
        favoriteProjected: pairing.projB,
        dogProjected: pairing.projA,
      }
    : {
        matchupId,
        favoriteRosterId: pairing.rosterA,
        dogRosterId: pairing.rosterB,
        favoriteProjected: pairing.projA,
        dogProjected: pairing.projB,
      };
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
  ctx: BlockContext & { playerProjections: PlayerProjection[]; existing: string[] },
): NewBookProp[] {
  const byPlayer = new Map<string, PlayerProjection>();
  for (const p of ctx.playerProjections) byPlayer.set(p.playerId, p);

  // Deterministic ranking: projection descending, player id as the tiebreak,
  // so a fresh week produces the same slate on every run of the hour. Only
  // starters are candidates; a bench projection is not a bet anybody would take.
  const ranked = ctx.playerProjections
    .filter((p) => p.started)
    .sort((a, b) => b.projected - a.projected || a.playerId.localeCompare(b.playerId));

  // Every franchise with a player ALREADY posted is spoken for, whether or not
  // that player is still in the lineup: the posted row is sticky and never
  // deleted, so letting a benched player's teammate through would give that
  // franchise two props.
  const usedFranchises = new Set<string>();
  for (const id of ctx.existing) {
    const p = byPlayer.get(id);
    if (p) usedFranchises.add(p.franchiseId);
  }

  const candidates: string[] = [];
  for (const p of ranked) {
    if (ctx.existing.includes(p.playerId)) continue;
    if (usedFranchises.has(p.franchiseId)) continue;
    usedFranchises.add(p.franchiseId);
    candidates.push(p.playerId);
  }

  const chosen = selectStickySubjects(ctx.existing, candidates, PLAYER_PROP_TARGET);

  const rows: NewBookProp[] = [];
  for (const playerId of chosen) {
    const p = byPlayer.get(playerId);
    // A kept subject with no projection this week cannot be repriced. Leaving
    // it out of the batch leaves its existing row exactly as it was, which is
    // the point: it is never deleted out from under a pick.
    if (!p) continue;
    const priced = pricePlayerPoints(p.projected);
    rows.push({
      seasonId: ctx.seasonId,
      week: ctx.week,
      kind: "player_points",
      subjectType: "player",
      subjectId: p.playerId,
      // Name-free on purpose: the display name resolves at read time, so a
      // stored question can never go stale.
      question: "Fantasy points, this week",
      line: priced.line,
      overOdds: priced.overOdds,
      underOdds: priced.underOdds,
      snark: BOOK_COPY.playerPropSnark(p.name),
      updatedAt: ctx.now,
    });
  }
  return rows;
}

/** Three team totals, priced off the same projected starter totals the board uses. */
function buildTeamTotalRows(
  ctx: BlockContext & {
    franchiseProjections: Map<string, number>;
    existing: string[];
  },
): NewBookProp[] {
  const ranked = [...ctx.franchiseProjections.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([franchiseId]) => franchiseId);

  const chosen = selectStickySubjects(ctx.existing, ranked, TEAM_TOTAL_TARGET);

  const rows: NewBookProp[] = [];
  for (const franchiseId of chosen) {
    const projected = ctx.franchiseProjections.get(franchiseId);
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
 * One matchbet row, whichever flavour. The sticky rule and the pricing tail
 * live here once: the callers' only job is to nominate this week's candidate
 * pair and to say how to look a subject's projection up.
 */
function buildMatchbetRow(
  ctx: BlockContext & {
    kind: "player_matchbet" | "franchise_matchbet";
    subjectType: string;
    scale: number;
    existing: string[];
    candidate: string | null;
    projectionFor: (subjectId: string) => number | undefined;
  },
): NewBookProp | null {
  const chosen = selectStickySubjects(
    ctx.existing,
    ctx.candidate ? [ctx.candidate] : [],
    MATCHBET_TARGET,
  );
  const subjectId = chosen[0];
  if (!subjectId) return null;

  const pair = parsePairSubject(subjectId);
  if (!pair) return null;
  const projA = ctx.projectionFor(pair[0]);
  const projB = ctx.projectionFor(pair[1]);
  // A posted pair one of whose sides has no projection this week is left
  // exactly as it is rather than repriced or replaced.
  if (projA == null || projB == null) return null;

  const priced = priceMatchbet(projA, projB, ctx.scale);
  return {
    seasonId: ctx.seasonId,
    week: ctx.week,
    kind: ctx.kind,
    subjectType: ctx.subjectType,
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
 * One player-vs-player matchbet: the two highest-projected starters at the
 * same position on different franchises. Same position, because "does the QB
 * outscore the kicker" is not a bet, it is arithmetic.
 */
function buildPlayerMatchbetRow(
  ctx: BlockContext & { playerProjections: PlayerProjection[]; existing: string[] },
): NewBookProp | null {
  const byPlayer = new Map<string, PlayerProjection>();
  for (const p of ctx.playerProjections) byPlayer.set(p.playerId, p);

  const byPosition = new Map<string, PlayerProjection[]>();
  for (const p of ctx.playerProjections) {
    if (!p.started || !p.position) continue;
    const list = byPosition.get(p.position) ?? [];
    list.push(p);
    byPosition.set(p.position, list);
  }

  let best: [PlayerProjection, PlayerProjection] | null = null;
  for (const list of byPosition.values()) {
    const sorted = [...list].sort(
      (a, b) => b.projected - a.projected || a.playerId.localeCompare(b.playerId),
    );
    const top = sorted[0];
    if (!top) continue;
    const rival = sorted.find((p) => p.franchiseId !== top.franchiseId);
    if (!rival) continue;
    const combined = top.projected + rival.projected;
    if (!best || combined > best[0].projected + best[1].projected) {
      best = [top, rival];
    }
  }

  return buildMatchbetRow({
    ...ctx,
    kind: "player_matchbet",
    subjectType: "player_pair",
    scale: PLAYER_UNCERTAINTY_SCALE,
    candidate: best ? encodePairSubject(best[0].playerId, best[1].playerId) : null,
    projectionFor: (id) => byPlayer.get(id)?.projected,
  });
}

/**
 * One franchise-vs-franchise matchbet between two rosters that are NOT playing
 * each other: a matchbet between the two sides of one matchup is just the
 * Board's spread wearing a costume.
 */
function buildFranchiseMatchbetRow(
  ctx: BlockContext & {
    pairings: ProjectedPairing[];
    rosterToFranchise: Map<string, string>;
    franchiseProjections: Map<string, number>;
    existing: string[];
  },
): NewBookProp | null {
  const opponent = new Map<string, string>();
  for (const p of ctx.pairings) {
    opponent.set(p.rosterA, p.rosterB);
    opponent.set(p.rosterB, p.rosterA);
  }

  const franchiseToRoster = new Map<string, string>();
  for (const [rosterId, franchiseId] of ctx.rosterToFranchise) {
    if (ctx.franchiseProjections.has(franchiseId)) {
      franchiseToRoster.set(franchiseId, rosterId);
    }
  }

  const ranked = [...ctx.franchiseProjections.entries()].sort(
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

  return buildMatchbetRow({
    ...ctx,
    kind: "franchise_matchbet",
    subjectType: "franchise_pair",
    scale: SCORE_UNCERTAINTY_SCALE,
    candidate,
    projectionFor: (id) => ctx.franchiseProjections.get(id),
  });
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

interface GradeContext {
  line: number;
  subjectId: string | null;
  actuals: WeekActuals;
  playerPoints: Map<string, number>;
}

/** A graded outcome, or null when this week genuinely cannot settle the row. */
type GradeOutcome = { result: PropResult; actualValue: number } | null;

/**
 * A prop whose subject has no number this week (a player who was dropped and
 * never rostered, a franchise with no matchup) settles as a PUSH rather than
 * hanging ungraded forever. The week is already complete when this runs, so
 * the number is not coming later, and a pick nobody can ever settle is worse
 * than a void: it sits "Pending" on the tab for the rest of the season.
 */
const VOID_PUSH: GradeOutcome = { result: "push", actualValue: 0 };

/** Both sides of a pair subject, from one lookup, or null if either is missing. */
function pairPoints(
  subjectId: string | null,
  lookup: (id: string) => number | undefined,
): [number, number] | null {
  const pair = parsePairSubject(subjectId);
  if (!pair) return null;
  const a = lookup(pair[0]);
  const b = lookup(pair[1]);
  if (a == null || b == null) return null;
  return [a, b];
}

/**
 * One grader per kind, keyed by the kind registry rather than an if/else
 * ladder with a silent final `else`. A kind added to PropKind without a
 * grader is a COMPILE error, not a prop that prices and renders all week and
 * then never settles while sync_log reports success.
 *
 * Returning null means "cannot settle from this week's data", which is
 * reserved for the matchup-keyed props: a matchup id that is not in this
 * week's actuals means the row is pointing at something that is not there, and
 * that should stay visible as a skip rather than be quietly voided.
 */
const PROP_GRADERS: Record<PropKind, (ctx: GradeContext) => GradeOutcome> = {
  league_total: (ctx) => ({
    result: gradeOverUnderLine(ctx.actuals.totalPoints, ctx.line),
    actualValue: ctx.actuals.totalPoints,
  }),

  ceiling_watch: (ctx) => ({
    result: gradeCeilingWatch(ctx.actuals.maxPoints, ctx.line),
    actualValue: ctx.actuals.maxPoints,
  }),

  blowout_special: (ctx) => ({
    result: gradeBlowout(ctx.actuals.maxMargin, ctx.line),
    actualValue: ctx.actuals.maxMargin,
  }),

  mercy_line: (ctx) => {
    const matchupId = ctx.subjectId ? Number(ctx.subjectId) : NaN;
    const margin = ctx.actuals.marginByMatchup.get(matchupId);
    if (margin == null) return null;
    return { result: gradeMercyLine(margin, ctx.line), actualValue: margin };
  },

  upset_special: (ctx) => {
    const pair = parsePairSubject(ctx.subjectId);
    const sides = pair ? ctx.actuals.rosterPointsByMatchup.get(Number(pair[0])) : undefined;
    if (!pair || !sides || sides.length !== 2) return null;
    const dog = sides.find(([rosterId]) => rosterId === pair[1]);
    const favorite = sides.find(([rosterId]) => rosterId !== pair[1]);
    if (!dog || !favorite) return null;
    // The Upset Special IS a matchbet with the dog as side A, ties included.
    return { result: gradeMatchbet(dog[1], favorite[1]), actualValue: dog[1] - favorite[1] };
  },

  player_points: (ctx) => {
    const points = ctx.subjectId ? ctx.playerPoints.get(ctx.subjectId) : undefined;
    if (points == null) return VOID_PUSH;
    return { result: gradeOverUnderLine(points, ctx.line), actualValue: points };
  },

  team_total: (ctx) => {
    const points = ctx.subjectId
      ? ctx.actuals.pointsByFranchise.get(ctx.subjectId)
      : undefined;
    if (points == null) return VOID_PUSH;
    return { result: gradeOverUnderLine(points, ctx.line), actualValue: points };
  },

  player_matchbet: (ctx) => {
    const points = pairPoints(ctx.subjectId, (id) => ctx.playerPoints.get(id));
    if (!points) return VOID_PUSH;
    // Exact equality pushes: two real scores can be genuinely equal, and
    // pretending otherwise would hand somebody a win they did not get.
    return {
      result: gradeMatchbet(points[0], points[1]),
      actualValue: points[0] - points[1],
    };
  },

  franchise_matchbet: (ctx) => {
    const points = pairPoints(ctx.subjectId, (id) =>
      ctx.actuals.pointsByFranchise.get(id),
    );
    if (!points) return VOID_PUSH;
    return {
      result: gradeMatchbet(points[0], points[1]),
      actualValue: points[0] - points[1],
    };
  },
};

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
  const playerPoints = await getWeekPlayerActuals(seasonId, week, [...neededPlayerIds]);

  const now = new Date();
  const updates: { id: number; result: string; actualValue: number }[] = [];
  let skipped = 0;

  for (const row of rows) {
    const grader = PROP_GRADERS[row.kind as PropKind];
    if (!grader) {
      // A kind in the database that this build does not know about (a rollback
      // after a new kind shipped). Left ungraded rather than guessed at.
      skipped++;
      continue;
    }
    const outcome = grader({
      line: row.line,
      subjectId: row.subjectId,
      actuals,
      playerPoints,
    });
    if (!outcome) {
      skipped++;
      continue;
    }
    updates.push({ id: row.id, result: outcome.result, actualValue: outcome.actualValue });
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
