import { db } from "@/lib/db";
import {
  draftPicks,
  franchiseSeasons,
  players,
  playerWeekPoints,
  rosterPlayers,
  seasons,
  transactions,
} from "@/lib/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { SNARKY_LABELS, type LabelTone } from "@/lib/content";
import { getMostTradedPlayers, getMostChurnedPlayers } from "@/lib/queries/player-lore";
import { getLeagueCornerstone } from "@/lib/queries/franchise-players";
import { getAllFranchises } from "@/lib/queries/franchises";

// ---------------------------------------------------------------------------
// League Lore: the 12-card "player story" module on the Hall of Fame page.
// Four single-game thrones (best started score at each of QB/RB/WR/TE), five
// flexible callouts resolved by dedupePieces against a ranked candidate list
// (Draft Steal, Waiver Miracle, Iron Man, Comet, Bust), and three carryover
// cards (League Cornerstone, The Wanderer, Waiver Yo-Yo). All scoring
// aggregates are restricted to seasons.status = 'complete' and started = true
// rows, so the in-progress season's synced placeholder-zero rows never leak
// into "best ever" claims.
// ---------------------------------------------------------------------------

export interface LoreFranchiseBadge {
  slug: string;
  name: string;
  abbreviation?: string | null;
  brandingColor?: string | null;
  avatarUrl?: string | null;
}

export interface LorePiece {
  key: string;
  title: string;
  tone: LabelTone;
  iconKey: string;
  playerId: string;
  playerName: string;
  position: string | null;
  statValue: string;
  story: string;
  franchiseBadge?: LoreFranchiseBadge | null;
  /**
   * Every franchise the player logged a player_week_points row for, ordered
   * by first season/week appearance. Only populated for The Wanderer and
   * Waiver Yo-Yo (the "teams they passed through" crest strip).
   */
  franchiseSequence?: LoreFranchiseBadge[];
  href?: string;
}

const THRONE_STORIES: Readonly<Record<string, string>> = Object.freeze({
  QB: "The biggest week any quarterback has ever slung.",
  RB: "No running back has ever carried a Sunday harder.",
  WR: "The ceiling every receiver is still chasing.",
  TE: "Proof a tight end can win you the week by himself.",
});

// ---------------------------------------------------------------------------
// Sub-queries: each is one batched aggregate query, try/catch to [] on failure.
// ---------------------------------------------------------------------------

export interface ThroneRow {
  playerId: string;
  playerName: string;
  position: string;
  points: number;
  week: number;
  seasonYear: number;
  franchiseId: string;
}

/**
 * Best started single-game score per position (QB/RB/WR/TE), all-time.
 * DISTINCT ON (position) ordered by points desc picks the single best row
 * per position in one query.
 */
export async function getSingleGameThrones(): Promise<ThroneRow[]> {
  try {
    const result = await db.execute(sql`
      SELECT DISTINCT ON (p.position)
        pwp.player_id AS player_id,
        p.full_name AS player_name,
        p.position AS position,
        pwp.points AS points,
        pwp.week AS week,
        s.season_year AS season_year,
        pwp.franchise_id AS franchise_id
      FROM player_week_points pwp
      INNER JOIN seasons s ON pwp.season_id = s.id
      INNER JOIN players p ON pwp.player_id = p.id
      WHERE pwp.started = true
        AND s.status = 'complete'
        AND p.position IN ('QB', 'RB', 'WR', 'TE')
      ORDER BY p.position, pwp.points DESC
    `);

    return (result.rows as Array<Record<string, unknown>>).map((r) => ({
      playerId: r.player_id as string,
      playerName: (r.player_name as string) ?? "Unknown Player",
      position: r.position as string,
      points: Number(r.points ?? 0),
      week: Number(r.week ?? 0),
      seasonYear: Number(r.season_year ?? 0),
      franchiseId: r.franchise_id as string,
    }));
  } catch (error) {
    console.error("[lore] getSingleGameThrones error:", error);
    return [];
  }
}

export interface CareerPointsRow {
  playerId: string;
  playerName: string;
  position: string | null;
  careerPts: number;
  careerStarts: number;
  seasonsCount: number;
}

/** Per-player career totals (sum of started points, start count, seasons touched). */
export async function getCareerPointsAggregate(): Promise<CareerPointsRow[]> {
  try {
    const rows = await db
      .select({
        playerId: playerWeekPoints.playerId,
        playerName: players.fullName,
        position: players.position,
        careerPts: sql<number>`SUM(${playerWeekPoints.points})`,
        careerStarts: sql<number>`COUNT(${playerWeekPoints.id})`,
        seasonsCount: sql<number>`COUNT(DISTINCT ${playerWeekPoints.seasonId})`,
      })
      .from(playerWeekPoints)
      .innerJoin(seasons, eq(playerWeekPoints.seasonId, seasons.id))
      .leftJoin(players, eq(playerWeekPoints.playerId, players.id))
      .where(and(eq(playerWeekPoints.started, true), eq(seasons.status, "complete")))
      .groupBy(playerWeekPoints.playerId, players.fullName, players.position);

    return rows.map((r) => ({
      playerId: r.playerId,
      playerName: r.playerName ?? "Unknown Player",
      position: r.position,
      careerPts: Number(r.careerPts ?? 0),
      careerStarts: Number(r.careerStarts ?? 0),
      seasonsCount: Number(r.seasonsCount ?? 0),
    }));
  } catch (error) {
    console.error("[lore] getCareerPointsAggregate error:", error);
    return [];
  }
}

export interface StartupPickRow {
  playerId: string;
  round: number;
  pickNumber: number;
  seasonYear: number;
  franchiseId: string | null;
}

/**
 * Startup-draft picks only (excludes rookie drafts), with the season year.
 * Restricted to the Sleeper era (`is_legacy_era = false`, i.e. the 2023
 * startup): the sole consumer, Draft Steal, is a value award like The Bust,
 * and the 2021 predecessor-league startup had a longer runway (5 completed
 * seasons vs 3) to accumulate points, which would give 2021 picks an unfair
 * edge over 2023 picks in a "most points scored" ranking. Verified against
 * the live DB (see getBustDraftPickPool) that `is_legacy_era` maps exactly
 * to 2021/2022 (`true`) vs 2023+ (`false`).
 */
export async function getStartupDraftPicks(): Promise<StartupPickRow[]> {
  try {
    const rows = await db
      .select({
        playerId: draftPicks.playerId,
        round: draftPicks.round,
        pickNumber: draftPicks.pickNumber,
        seasonYear: seasons.seasonYear,
        franchiseId: draftPicks.franchiseId,
      })
      .from(draftPicks)
      .innerJoin(seasons, eq(draftPicks.seasonId, seasons.id))
      .where(and(eq(draftPicks.draftType, "startup"), eq(draftPicks.isLegacyEra, false)));

    return rows
      .filter((r): r is StartupPickRow & { playerId: string } => r.playerId != null)
      .map((r) => ({
        playerId: r.playerId,
        round: r.round,
        pickNumber: r.pickNumber,
        seasonYear: r.seasonYear,
        franchiseId: r.franchiseId,
      }));
  } catch (error) {
    console.error("[lore] getStartupDraftPicks error:", error);
    return [];
  }
}

export interface BustDraftPickRow {
  playerId: string;
  round: number;
  pickNumber: number;
  seasonYear: number;
  franchiseId: string | null;
  draftType: string;
}

/**
 * Draft picks from rounds 1-6 of ANY Sleeper-era draft (startup and rookie),
 * with the season year and draft type. Excludes `is_legacy_era` picks: The
 * Bust is scoped to 2023+ only, since the 2021/2022 predecessor-league
 * drafts had a longer runway to accumulate points (5 seasons vs 3) and
 * mixing eras would inflate the expectation baselines and unfairly punish
 * older picks. Verified against the live DB that `is_legacy_era` maps
 * exactly to the 2021 startup and 2022 rookie drafts (`true`) vs. 2023+
 * (`false`), so the flag is a reliable proxy for the season-year cutoff.
 * The Bust's eligible-round rule differs by draft type (startup rounds 1-6
 * count as premium capital; rookie drafts only round 1 does), so this
 * fetches the superset (round <= 6) and callers narrow with
 * `isBustEligibleRound`. Draft Steal stays startup-only and round >= 8 via
 * `getStartupDraftPicks`, so the two awards never compete for the same pick.
 */
export async function getBustDraftPickPool(): Promise<BustDraftPickRow[]> {
  try {
    const rows = await db
      .select({
        playerId: draftPicks.playerId,
        round: draftPicks.round,
        pickNumber: draftPicks.pickNumber,
        seasonYear: seasons.seasonYear,
        franchiseId: draftPicks.franchiseId,
        draftType: draftPicks.draftType,
      })
      .from(draftPicks)
      .innerJoin(seasons, eq(draftPicks.seasonId, seasons.id))
      .where(and(sql`${draftPicks.round} <= 6`, eq(draftPicks.isLegacyEra, false)));

    return rows
      .filter((r): r is typeof r & { playerId: string } => r.playerId != null)
      .map((r) => ({
        playerId: r.playerId,
        round: r.round,
        pickNumber: r.pickNumber,
        seasonYear: r.seasonYear,
        franchiseId: r.franchiseId,
        draftType: r.draftType,
      }));
  } catch (error) {
    console.error("[lore] getBustDraftPickPool error:", error);
    return [];
  }
}

/** The most recent season with status = 'complete', or null if none. */
export async function getLatestCompletedSeasonYear(): Promise<number | null> {
  try {
    const [row] = await db
      .select({ seasonYear: seasons.seasonYear })
      .from(seasons)
      .where(eq(seasons.status, "complete"))
      .orderBy(desc(seasons.seasonYear))
      .limit(1);
    return row?.seasonYear ?? null;
  } catch (error) {
    console.error("[lore] getLatestCompletedSeasonYear error:", error);
    return null;
  }
}

/** The most recent season's id, regardless of status (used for "is he still rostered" checks). */
export async function getLatestSeasonId(): Promise<number | null> {
  try {
    const [row] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .orderBy(desc(seasons.seasonYear))
      .limit(1);
    return row?.id ?? null;
  } catch (error) {
    console.error("[lore] getLatestSeasonId error:", error);
    return null;
  }
}

export interface TradeDropRow {
  playerId: string;
  rosterId: string;
  seasonId: number;
}

/**
 * Every (player, roster, season) drop attributed to a completed trade
 * transaction. `transactions.drops` maps player id -> the roster_id that
 * gave the player up (mirrors `adds`, parsed the same way as
 * `getMostTradedPlayers` in player-lore.ts). Combined with
 * `getRosterFranchiseMapRows` this resolves to "which franchise traded this
 * player away, and when," the direct linkage for exempting a redeemed Bust
 * pick (rather than a roster-presence proxy).
 */
export async function getTradeDrops(): Promise<TradeDropRow[]> {
  try {
    const rows = await db
      .select({ drops: transactions.drops, seasonId: transactions.seasonId })
      .from(transactions)
      .where(eq(transactions.type, "trade"));

    const result: TradeDropRow[] = [];
    for (const row of rows) {
      const drops = row.drops as Record<string, number> | null;
      if (!drops) continue;
      for (const [playerId, rosterId] of Object.entries(drops)) {
        result.push({ playerId, rosterId: String(rosterId), seasonId: row.seasonId });
      }
    }
    return result;
  } catch (error) {
    console.error("[lore] getTradeDrops error:", error);
    return [];
  }
}

export interface RosterFranchiseRow {
  seasonId: number;
  rosterId: string;
  franchiseId: string;
}

/** Every (season, roster_id) -> franchise_id row across league history. */
export async function getRosterFranchiseMapRows(): Promise<RosterFranchiseRow[]> {
  try {
    return await db
      .select({
        seasonId: franchiseSeasons.seasonId,
        rosterId: franchiseSeasons.rosterId,
        franchiseId: franchiseSeasons.franchiseId,
      })
      .from(franchiseSeasons);
  } catch (error) {
    console.error("[lore] getRosterFranchiseMapRows error:", error);
    return [];
  }
}

/** Whether `playerId` is on `franchiseId`'s roster for `seasonId`. */
export async function isPlayerOnFranchiseRoster(
  seasonId: number,
  franchiseId: string,
  playerId: string,
): Promise<boolean> {
  try {
    const rows = await db
      .select({ id: rosterPlayers.id })
      .from(rosterPlayers)
      .where(
        and(
          eq(rosterPlayers.seasonId, seasonId),
          eq(rosterPlayers.franchiseId, franchiseId),
          eq(rosterPlayers.playerId, playerId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch (error) {
    console.error("[lore] isPlayerOnFranchiseRoster error:", error);
    return false;
  }
}

export interface WaiverAddedSeason {
  playerId: string;
  seasonYear: number;
}

/**
 * Every distinct (player, season) pair where the player was added via a
 * waiver or free-agent transaction that season. `transactions.season_id`
 * ties each add directly to a season, so this is a straight join, not a
 * player+season presence inference. Used to scope the Waiver Miracle to a
 * single season's pickup, not a player's career-wide waiver history.
 */
export async function getWaiverAddedPlayerSeasons(): Promise<WaiverAddedSeason[]> {
  try {
    const rows = await db
      .select({ adds: transactions.adds, seasonYear: seasons.seasonYear })
      .from(transactions)
      .innerJoin(seasons, eq(transactions.seasonId, seasons.id))
      .where(sql`${transactions.type} IN ('waiver', 'free_agent')`);

    const pairs = new Map<string, WaiverAddedSeason>();
    for (const row of rows) {
      const adds = row.adds as Record<string, number> | null;
      if (!adds) continue;
      for (const playerId of Object.keys(adds)) {
        pairs.set(`${playerId}:${row.seasonYear}`, { playerId, seasonYear: row.seasonYear });
      }
    }
    return Array.from(pairs.values());
  } catch (error) {
    console.error("[lore] getWaiverAddedPlayerSeasons error:", error);
    return [];
  }
}

export interface SeasonPointsRow {
  playerId: string;
  playerName: string;
  position: string | null;
  seasonYear: number;
  seasonPoints: number;
}

/** Per player+season sum of started points, ranked desc, limited to `limit`. */
export async function getBiggestSeasons(limit = 15): Promise<SeasonPointsRow[]> {
  try {
    const rows = await db
      .select({
        playerId: playerWeekPoints.playerId,
        playerName: players.fullName,
        position: players.position,
        seasonYear: seasons.seasonYear,
        seasonPoints: sql<number>`SUM(${playerWeekPoints.points})`,
      })
      .from(playerWeekPoints)
      .innerJoin(seasons, eq(playerWeekPoints.seasonId, seasons.id))
      .leftJoin(players, eq(playerWeekPoints.playerId, players.id))
      .where(and(eq(playerWeekPoints.started, true), eq(seasons.status, "complete")))
      .groupBy(playerWeekPoints.playerId, players.fullName, players.position, seasons.seasonYear)
      .orderBy(sql`SUM(${playerWeekPoints.points}) DESC`)
      .limit(limit);

    return rows.map((r) => ({
      playerId: r.playerId,
      playerName: r.playerName ?? "Unknown Player",
      position: r.position,
      seasonYear: r.seasonYear,
      seasonPoints: Number(r.seasonPoints ?? 0),
    }));
  } catch (error) {
    console.error("[lore] getBiggestSeasons error:", error);
    return [];
  }
}

export interface PlayerFranchiseWeekRow {
  playerId: string;
  franchiseId: string;
  seasonYear: number;
  week: number;
  started: boolean;
  points: number;
}

/**
 * Every player_week_points row (started or benched) for a small set of
 * candidate player ids, restricted to completed seasons. One batched query,
 * reused to attribute franchise credit for the Comet, Waiver Miracle, Iron
 * Man, Wanderer, and Waiver Yo-Yo cards.
 */
export async function getPlayerFranchiseWeeks(
  playerIds: readonly string[],
): Promise<PlayerFranchiseWeekRow[]> {
  if (playerIds.length === 0) return [];
  try {
    const rows = await db
      .select({
        playerId: playerWeekPoints.playerId,
        franchiseId: playerWeekPoints.franchiseId,
        seasonYear: seasons.seasonYear,
        week: playerWeekPoints.week,
        started: playerWeekPoints.started,
        points: playerWeekPoints.points,
      })
      .from(playerWeekPoints)
      .innerJoin(seasons, eq(playerWeekPoints.seasonId, seasons.id))
      .where(
        and(
          inArray(playerWeekPoints.playerId, Array.from(playerIds)),
          eq(seasons.status, "complete"),
        ),
      );

    return rows.map((r) => ({
      playerId: r.playerId,
      franchiseId: r.franchiseId,
      seasonYear: r.seasonYear,
      week: r.week,
      started: r.started,
      points: Number(r.points ?? 0),
    }));
  } catch (error) {
    console.error("[lore] getPlayerFranchiseWeeks error:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Pure franchise-attribution helpers, each scoped to one player's rows
// (caller filters getPlayerFranchiseWeeks by playerId first). Unit-tested in
// lore.test.ts.
// ---------------------------------------------------------------------------

/**
 * Which franchise started this player most in the given season (mode of
 * franchiseId among started=true rows), ties broken by total points scored
 * for that franchise that season. Null when the player has no started rows
 * that season.
 */
export function pickSeasonFranchise(
  rows: readonly PlayerFranchiseWeekRow[],
  seasonYear: number,
): string | null {
  const buckets = new Map<string, { starts: number; points: number }>();
  for (const r of rows) {
    if (!r.started || r.seasonYear !== seasonYear) continue;
    const b = buckets.get(r.franchiseId) ?? { starts: 0, points: 0 };
    b.starts += 1;
    b.points += r.points;
    buckets.set(r.franchiseId, b);
  }
  let best: string | null = null;
  let bestBucket = { starts: -1, points: -1 };
  for (const [franchiseId, b] of buckets) {
    if (b.starts > bestBucket.starts || (b.starts === bestBucket.starts && b.points > bestBucket.points)) {
      best = franchiseId;
      bestBucket = b;
    }
  }
  return best;
}

/**
 * The dominant franchise for this player in the given season (via
 * `pickSeasonFranchise`), paired with the started points that franchise
 * actually got out of him that season. Null when the player has no started
 * rows that season. Used to scope a single-season pickup (Waiver Miracle) to
 * the one team that rostered him that year, not points he scored for
 * whoever else had him in other seasons.
 */
export function pickSeasonFranchiseAndPoints(
  rows: readonly PlayerFranchiseWeekRow[],
  seasonYear: number,
): { franchiseId: string; points: number } | null {
  const franchiseId = pickSeasonFranchise(rows, seasonYear);
  if (!franchiseId) return null;
  let points = 0;
  for (const r of rows) {
    if (r.started && r.seasonYear === seasonYear && r.franchiseId === franchiseId) points += r.points;
  }
  return { franchiseId, points };
}

/** Franchise that reaped the most total started points from this player, career-wide. */
export function pickTopFranchiseByPoints(rows: readonly PlayerFranchiseWeekRow[]): string | null {
  const totals = new Map<string, number>();
  for (const r of rows) {
    if (!r.started) continue;
    totals.set(r.franchiseId, (totals.get(r.franchiseId) ?? 0) + r.points);
  }
  let best: string | null = null;
  let bestPoints = -1;
  for (const [franchiseId, points] of totals) {
    if (points > bestPoints) {
      best = franchiseId;
      bestPoints = points;
    }
  }
  return best;
}

/**
 * Total started points this player scored while rostered by ONE specific
 * franchise. Used to scope value-award rankings (Draft Steal, The Bust) to
 * "points in the drafting team's colors" rather than career-wide totals, so
 * a player traded away long ago doesn't credit points he scored for whoever
 * picked him up later.
 */
export function scopedFranchisePoints(
  rows: readonly PlayerFranchiseWeekRow[],
  franchiseId: string,
): number {
  let total = 0;
  for (const r of rows) {
    if (r.started && r.franchiseId === franchiseId) total += r.points;
  }
  return total;
}

/**
 * The single franchise that got the most started points out of this player,
 * paired with that points total. Unlike career-wide totals, this is what a
 * franchise can actually brag about (or eat) for one player: the best (or
 * only) haul any one roster got from him. Null when the player has no
 * started rows for any franchise.
 */
export function pickBestFranchiseAndPoints(
  rows: readonly PlayerFranchiseWeekRow[],
): { franchiseId: string; points: number } | null {
  const franchiseId = pickTopFranchiseByPoints(rows);
  if (!franchiseId) return null;
  return { franchiseId, points: scopedFranchisePoints(rows, franchiseId) };
}

/** Franchise with the most career starts of this player. */
export function pickTopFranchiseByStarts(rows: readonly PlayerFranchiseWeekRow[]): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.started) continue;
    counts.set(r.franchiseId, (counts.get(r.franchiseId) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = -1;
  for (const [franchiseId, count] of counts) {
    if (count > bestCount) {
      best = franchiseId;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Every distinct franchise this player logged a week (started or benched)
 * for, ordered by first (seasonYear, week) appearance.
 */
export function franchiseSequenceFor(rows: readonly PlayerFranchiseWeekRow[]): string[] {
  const firstSeen = new Map<string, [number, number]>();
  for (const r of rows) {
    const key: [number, number] = [r.seasonYear, r.week];
    const existing = firstSeen.get(r.franchiseId);
    if (!existing || key[0] < existing[0] || (key[0] === existing[0] && key[1] < existing[1])) {
      firstSeen.set(r.franchiseId, key);
    }
  }
  return Array.from(firstSeen.entries())
    .sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1])
    .map(([franchiseId]) => franchiseId);
}

/**
 * A round-1 pick has had time to bust once at least two completed seasons
 * of runway (including the draft year itself) have passed: drafted in
 * `seasonYear`, eligible once the latest completed season is `seasonYear + 1`
 * or later.
 */
export function isBustEligible(seasonYear: number, latestCompletedSeasonYear: number): boolean {
  return seasonYear <= latestCompletedSeasonYear - 1;
}

/**
 * Which draft rounds carry Bust-eligible capital. Startup rounds 1-6 all
 * qualify (premium startup investment); rookie drafts only round 1 does,
 * since a rookie pick's capital tapers off far faster than a startup pick's.
 * Startup rounds 8+ are Draft Steal's territory (see `getStartupDraftPicks`
 * usage), so this deliberately stops at round 6 to avoid double-booking a
 * pick for both awards.
 */
export function isBustEligibleRound(draftType: string, round: number): boolean {
  return draftType === "startup" ? round >= 1 && round <= 6 : round === 1;
}

/**
 * The group a pick's "expected return" is benchmarked against: one bucket
 * per startup round (1-6), and a single bucket for all rookie round-1 picks.
 */
export function bustGroupKey(draftType: string, round: number): string {
  return draftType === "startup" ? `startup:${round}` : "rookie:1";
}

/** Standard median: average of the two middle values on an even-length list. 0 for an empty list. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface BustBaselineEntry {
  groupKey: string;
  scopedPts: number;
}

/**
 * Expected return per Bust group (startup round 1-6, or rookie round 1):
 * the median points a pick of that group has actually delivered to its
 * drafting franchise, across every eligible-round pick ever made in that
 * group (including picks later traded away or too recent to be Bust
 * candidates themselves, since they still show what the round CAN deliver).
 */
export function computeBustExpectations(
  baseline: readonly BustBaselineEntry[],
): Map<string, number> {
  const grouped = new Map<string, number[]>();
  for (const entry of baseline) {
    if (!grouped.has(entry.groupKey)) grouped.set(entry.groupKey, []);
    grouped.get(entry.groupKey)!.push(entry.scopedPts);
  }
  const result = new Map<string, number>();
  for (const [groupKey, points] of grouped) {
    result.set(groupKey, median(points));
  }
  return result;
}

/** How far below (positive) or above (negative) expectation a pick's actual return fell. */
export function bustShortfall(expectedPts: number, actualPts: number): number {
  return expectedPts - actualPts;
}

/**
 * The Wanderer card's season-span nugget: when every trade fell inside a
 * single season, name it directly ("all inside 2022"); when trades span
 * multiple seasons, give the count instead ("across 4 seasons") since
 * listing every year would blow the card's line-clamp. Empty input (no
 * season data resolved) yields no nugget at all.
 */
export function wandererSeasonNugget(seasonYears: readonly number[]): string | null {
  const distinct = Array.from(new Set(seasonYears));
  if (distinct.length === 0) return null;
  if (distinct.length === 1) return `all inside ${distinct[0]}`;
  return `across ${distinct.length} seasons`;
}

/**
 * Builds the set of "this franchise traded this player away" pairs (as
 * `${playerId}:${franchiseId}` keys) from raw trade-drop rows and the
 * roster->franchise map, both scoped by season since roster_id is only
 * unique within a season.
 */
export function buildTradedAwayPairs(
  tradeDrops: readonly TradeDropRow[],
  rosterFranchiseRows: readonly RosterFranchiseRow[],
): Set<string> {
  const rosterToFranchise = new Map<string, string>();
  for (const r of rosterFranchiseRows) {
    rosterToFranchise.set(`${r.seasonId}:${r.rosterId}`, r.franchiseId);
  }
  const pairs = new Set<string>();
  for (const d of tradeDrops) {
    const franchiseId = rosterToFranchise.get(`${d.seasonId}:${d.rosterId}`);
    if (franchiseId) pairs.add(`${d.playerId}:${franchiseId}`);
  }
  return pairs;
}

/** Whether `franchiseId` traded `playerId` away at some point (per `buildTradedAwayPairs`). */
export function wasTradedAwayByDrafter(
  tradedAwayPairs: ReadonlySet<string>,
  playerId: string,
  franchiseId: string,
): boolean {
  return tradedAwayPairs.has(`${playerId}:${franchiseId}`);
}

export type BustOutcome = "rostered" | "dropped";

/** Turns "is he still on the drafting franchise's roster" into the Bust story branch. */
export function classifyBustOutcome(stillRostered: boolean): BustOutcome {
  return stillRostered ? "rostered" : "dropped";
}

// ---------------------------------------------------------------------------
// Pure dedup: claims fixed-card player ids first, then walks each flexible
// candidate list in order, picking the first not-yet-claimed player and
// adding it to the claimed set before moving to the next list. Generic over
// any candidate shape carrying a playerId, so it stays independent of the
// specific card data. Unit-tested in lore.test.ts.
// ---------------------------------------------------------------------------
export function dedupePieces<
  TLists extends readonly (readonly { playerId: string }[])[],
>(
  claimedIds: ReadonlySet<string> | readonly string[],
  ...flexibleLists: TLists
): { [K in keyof TLists]: TLists[K][number] | null } {
  const claimed = new Set(claimedIds);
  const results: unknown[] = [];
  for (const list of flexibleLists) {
    const pick = list.find((candidate) => !claimed.has(candidate.playerId)) ?? null;
    if (pick) claimed.add(pick.playerId);
    results.push(pick);
  }
  return results as { [K in keyof TLists]: TLists[K][number] | null };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

const THRONE_SLOTS: readonly { position: string; labelKey: keyof typeof SNARKY_LABELS; iconKey: string }[] =
  [
    { position: "QB", labelKey: "SINGLE_GAME_QB", iconKey: "best qb" },
    { position: "RB", labelKey: "SINGLE_GAME_RB", iconKey: "best rb" },
    { position: "WR", labelKey: "SINGLE_GAME_WR", iconKey: "best wr" },
    { position: "TE", labelKey: "SINGLE_GAME_TE", iconKey: "best te" },
  ];

export async function getLeagueLore(): Promise<LorePiece[]> {
  const [
    thrones,
    careerRows,
    startupPicks,
    bustPickPool,
    latestCompletedSeasonYear,
    tradeDrops,
    rosterFranchiseRows,
    waiverAddedSeasons,
    biggestSeasons,
    tradedTop,
    churnedTop,
    cornerstone,
    franchisesList,
  ] = await Promise.all([
    getSingleGameThrones(),
    getCareerPointsAggregate(),
    getStartupDraftPicks(),
    getBustDraftPickPool(),
    getLatestCompletedSeasonYear(),
    getTradeDrops(),
    getRosterFranchiseMapRows(),
    getWaiverAddedPlayerSeasons(),
    getBiggestSeasons(15),
    getMostTradedPlayers(1),
    getMostChurnedPlayers(1),
    getLeagueCornerstone(),
    getAllFranchises(),
  ]);

  const tradedAwayPairs = buildTradedAwayPairs(tradeDrops, rosterFranchiseRows);

  const franchiseById = new Map(
    (franchisesList ?? []).map((f) => [
      f.id,
      {
        slug: f.slug,
        name: f.name,
        abbreviation: f.abbreviation,
        brandingColor: f.brandingColor,
        avatarUrl: f.avatarUrl,
      } satisfies LoreFranchiseBadge,
    ]),
  );
  const careerByPlayerId = new Map(careerRows.map((r) => [r.playerId, r]));
  const throneByPosition = new Map(thrones.map((t) => [t.position, t]));

  const pieces: LorePiece[] = [];
  const claimedIds = new Set<string>();

  // --- Row 1: the four single-game thrones -------------------------------
  for (const slot of THRONE_SLOTS) {
    const row = throneByPosition.get(slot.position);
    if (!row) continue;
    const label = SNARKY_LABELS[slot.labelKey];
    const crest = franchiseById.get(row.franchiseId) ?? null;
    const throneStory =
      THRONE_STORIES[slot.position] ??
      "The best single game the position has ever posted.";
    pieces.push({
      key: label.key,
      title: label.displayText,
      tone: label.tone,
      iconKey: slot.iconKey,
      playerId: row.playerId,
      playerName: row.playerName,
      position: row.position,
      statValue: `${row.points.toFixed(1)} pts`,
      story:
        `${row.points.toFixed(1)} pts, Week ${row.week} of ${row.seasonYear}. ` +
        throneStory,
      franchiseBadge: crest,
    });
    claimedIds.add(row.playerId);
  }

  // --- Fixed carryover cards: Cornerstone, Wanderer, Waiver Yo-Yo --------
  let cornerstonePiece: LorePiece | null = null;
  if (cornerstone) {
    const label = SNARKY_LABELS.LEAGUE_CORNERSTONE;
    const crest = franchiseById.get(cornerstone.franchiseId) ?? null;
    const pts = Math.round(cornerstone.franchisePoints);
    cornerstonePiece = {
      key: label.key,
      title: label.displayText,
      tone: label.tone,
      iconKey: label.displayText,
      playerId: cornerstone.playerId,
      playerName: cornerstone.playerName,
      position: cornerstone.position,
      statValue: `${pts} pts`,
      story: `${pts} pts in one uniform${crest ? `, ${crest.name}` : ""}.`,
      franchiseBadge: crest,
      href: crest ? `/teams/${crest.slug}` : undefined,
    };
    claimedIds.add(cornerstone.playerId);
  }

  const wanderer = tradedTop[0] ?? null;
  let wandererPiece: LorePiece | null = null;
  if (wanderer) {
    const label = SNARKY_LABELS.THE_WANDERER;
    const seasonNugget = wandererSeasonNugget(wanderer.seasonYears);
    wandererPiece = {
      key: label.key,
      title: label.displayText,
      tone: label.tone,
      iconKey: label.displayText,
      playerId: wanderer.playerId,
      playerName: wanderer.playerName,
      position: wanderer.position,
      statValue: `${wanderer.count}x traded`,
      story:
        `Traded ${wanderer.count}x, most in league history` +
        (seasonNugget ? `, ${seasonNugget}` : "") +
        (wanderer.position ? ` (${wanderer.position})` : "") +
        ".",
    };
    claimedIds.add(wanderer.playerId);
  }

  const yoyo = churnedTop[0] ?? null;
  let yoyoPiece: LorePiece | null = null;
  if (yoyo) {
    const label = SNARKY_LABELS.WAIVER_YO_YO;
    yoyoPiece = {
      key: label.key,
      title: label.displayText,
      tone: label.tone,
      iconKey: label.displayText,
      playerId: yoyo.playerId,
      playerName: yoyo.playerName,
      position: yoyo.position,
      statValue: `${yoyo.count}x added`,
      story:
        `Added ${yoyo.count}x off waivers and free agency, most in league history` +
        (yoyo.position ? ` (${yoyo.position})` : "") +
        ".",
    };
    claimedIds.add(yoyo.playerId);
  }

  // --- Five flexible cards, resolved against ranked candidate lists ------
  //
  // Draft Steal, The Bust, and Waiver Miracle rank on points scored WHILE
  // ON the relevant franchise, not career-wide totals: a value award is
  // about what one roster got out of a player, not what he did after he
  // left. Career totals here are only a cheap prefilter to keep the
  // franchise-week fetch small (a player's franchise-scoped total can never
  // exceed his career total, so ranking candidates by career points first
  // is a safe superset before the real, scoped ranking).
  interface DraftCandidate extends StartupPickRow {
    careerPts: number;
  }
  const draftStealPrefilter: DraftCandidate[] = startupPicks
    .filter((p) => p.round >= 8 && p.franchiseId != null)
    .map((p) => ({ ...p, careerPts: careerByPlayerId.get(p.playerId)?.careerPts ?? 0 }))
    .sort((a, b) => b.careerPts - a.careerPts)
    .slice(0, 30);

  // The Bust's eligible-round pool: startup rounds 1-6, or rookie round 1
  // (isBustEligibleRound), already restricted to the Sleeper era (2023+) by
  // getBustDraftPickPool. This full pool (not yet runway/trade filtered) is
  // also the baseline population for "what does this round normally
  // deliver," so traded-away and too-recent picks stay in it; only the
  // runway + trade-exemption filters below narrow it to picks that can
  // actually WIN the award.
  const bustPoolAll: BustDraftPickRow[] = bustPickPool.filter(
    (p) => p.franchiseId != null && isBustEligibleRound(p.draftType, p.round),
  );
  const bustCandidatePool: BustDraftPickRow[] =
    latestCompletedSeasonYear == null
      ? []
      : bustPoolAll
          .filter((p) => isBustEligible(p.seasonYear, latestCompletedSeasonYear))
          .filter((p) => !wasTradedAwayByDrafter(tradedAwayPairs, p.playerId, p.franchiseId!));

  const cometCandidates: SeasonPointsRow[] = biggestSeasons.slice(0, 15);

  const ironManCandidates: CareerPointsRow[] = [...careerRows]
    .sort((a, b) => b.careerStarts - a.careerStarts)
    .slice(0, 15);

  // One batched fetch covering every candidate that needs franchise-scoped
  // attribution: the Draft Steal / Bust / Waiver Miracle prefiltered pools,
  // plus Wanderer and Waiver Yo-Yo (already-known fixed-card winners) whose
  // crest strips are resolved below. Comet and Iron Man winners aren't known
  // yet (they fall out of dedupePieces), so they're picked up in a second,
  // much smaller fetch after ranking.
  const scopingCandidateIds = Array.from(
    new Set(
      [
        ...draftStealPrefilter.map((p) => p.playerId),
        ...bustPoolAll.map((p) => p.playerId),
        ...waiverAddedSeasons.map((r) => r.playerId),
        wanderer?.playerId,
        yoyo?.playerId,
      ].filter((id): id is string => id != null),
    ),
  );
  const scopingWeeks = await getPlayerFranchiseWeeks(scopingCandidateIds);
  const franchiseWeeksByPlayer = new Map<string, PlayerFranchiseWeekRow[]>();
  for (const row of scopingWeeks) {
    if (!franchiseWeeksByPlayer.has(row.playerId)) franchiseWeeksByPlayer.set(row.playerId, []);
    franchiseWeeksByPlayer.get(row.playerId)!.push(row);
  }
  const weeksFor = (playerId: string) => franchiseWeeksByPlayer.get(playerId) ?? [];

  interface ScopedDraftCandidate extends DraftCandidate {
    scopedPts: number;
  }
  // Draft Steal: highest points scored for the drafting franchise. Never
  // lead the card with a possibly-zero number, so a scoped sum of 0 (pick
  // never played a snap for the team that drafted him) is ineligible.
  const draftStealCandidates: ScopedDraftCandidate[] = draftStealPrefilter
    .map((p) => ({ ...p, scopedPts: scopedFranchisePoints(weeksFor(p.playerId), p.franchiseId!) }))
    .filter((p) => p.scopedPts > 0)
    .sort((a, b) => b.scopedPts - a.scopedPts);

  // Expected return per Bust group (startup round 1-6 / rookie round 1):
  // the median points ALL eligible-round picks in that group have actually
  // delivered to their drafting franchise, computed from the full pool
  // (bustPoolAll), not just the runway/trade-filtered candidate pool. Higher
  // rounds cost less capital and are expected to deliver less, so ranking
  // must be against the round's own baseline, not a flat points floor.
  const bustExpectations = computeBustExpectations(
    bustPoolAll.map((p) => ({
      groupKey: bustGroupKey(p.draftType, p.round),
      scopedPts: scopedFranchisePoints(weeksFor(p.playerId), p.franchiseId!),
    })),
  );

  interface ScopedBustCandidate extends BustDraftPickRow {
    scopedPts: number;
    expectedPts: number;
    shortfall: number;
  }
  // The Bust: ranked by shortfall against the round's own expectation
  // (largest shortfall = biggest bust), not raw fewest points, so a cheap
  // round-6 pick doesn't trivially "win" just for costing less draft
  // capital than a round-1 pick. A true zero-point pick still ranks highest
  // among its peers since its shortfall is the full expected value.
  const bustCandidates: ScopedBustCandidate[] = bustCandidatePool
    .map((p) => {
      const scopedPts = scopedFranchisePoints(weeksFor(p.playerId), p.franchiseId!);
      const expectedPts = bustExpectations.get(bustGroupKey(p.draftType, p.round)) ?? 0;
      return { ...p, scopedPts, expectedPts, shortfall: bustShortfall(expectedPts, scopedPts) };
    })
    .sort((a, b) => b.shortfall - a.shortfall);

  interface ScopedWaiverCandidate {
    playerId: string;
    playerName: string;
    position: string | null;
    seasonYear: number;
    scopedPts: number;
    scopedFranchiseId: string;
  }
  // Waiver Miracle: the single best SEASON a waiver/free-agent pickup ever
  // gave the franchise that rostered him that year, compared across every
  // (player, season) waiver-add ever logged. Not a career total: a player
  // added off waivers in multiple seasons is scored separately per season,
  // and only his best one competes.
  const waiverMiracleCandidates: ScopedWaiverCandidate[] = waiverAddedSeasons
    .map((add) => {
      const info = careerByPlayerId.get(add.playerId);
      const seasonBest = pickSeasonFranchiseAndPoints(weeksFor(add.playerId), add.seasonYear);
      if (!seasonBest) return null;
      return {
        playerId: add.playerId,
        playerName: info?.playerName ?? "Unknown Player",
        position: info?.position ?? null,
        seasonYear: add.seasonYear,
        scopedPts: seasonBest.points,
        scopedFranchiseId: seasonBest.franchiseId,
      } satisfies ScopedWaiverCandidate;
    })
    .filter((r): r is ScopedWaiverCandidate => r != null && r.scopedPts > 0)
    .sort((a, b) => b.scopedPts - a.scopedPts);

  const [draftStealWinner, waiverMiracleWinner, cometWinner, ironManWinner, bustWinner] =
    dedupePieces(
      claimedIds,
      draftStealCandidates,
      waiverMiracleCandidates,
      cometCandidates,
      ironManCandidates,
      bustCandidates,
    );

  // --- Franchise attribution for Comet/Iron Man: a second, small batched
  // query for the two winners not covered by the scoping fetch above (their
  // candidate pools don't need per-franchise scoping to rank, only their
  // eventual winner needs a crest resolved).
  const secondaryFranchiseWeekPlayerIds = Array.from(
    new Set(
      [cometWinner?.playerId, ironManWinner?.playerId].filter(
        (id): id is string => id != null && !franchiseWeeksByPlayer.has(id),
      ),
    ),
  );
  if (secondaryFranchiseWeekPlayerIds.length > 0) {
    const secondaryWeeks = await getPlayerFranchiseWeeks(secondaryFranchiseWeekPlayerIds);
    for (const row of secondaryWeeks) {
      if (!franchiseWeeksByPlayer.has(row.playerId)) franchiseWeeksByPlayer.set(row.playerId, []);
      franchiseWeeksByPlayer.get(row.playerId)!.push(row);
    }
  }

  function franchiseSequenceBadges(playerId: string): LoreFranchiseBadge[] {
    const rows = franchiseWeeksByPlayer.get(playerId) ?? [];
    const badges: LoreFranchiseBadge[] = [];
    for (const franchiseId of franchiseSequenceFor(rows)) {
      const badge = franchiseById.get(franchiseId);
      if (badge) badges.push(badge);
    }
    return badges;
  }

  if (wandererPiece && wanderer) {
    const sequence = franchiseSequenceBadges(wanderer.playerId);
    if (sequence.length > 0) wandererPiece.franchiseSequence = sequence;
  }
  if (yoyoPiece && yoyo) {
    const sequence = franchiseSequenceBadges(yoyo.playerId);
    if (sequence.length > 0) yoyoPiece.franchiseSequence = sequence;
  }

  let draftStealPiece: LorePiece | null = null;
  if (draftStealWinner) {
    const label = SNARKY_LABELS.THE_DRAFT_STEAL;
    const info = careerByPlayerId.get(draftStealWinner.playerId);
    const pts = Math.round(draftStealWinner.scopedPts);
    const crest = draftStealWinner.franchiseId
      ? franchiseById.get(draftStealWinner.franchiseId) ?? null
      : null;
    draftStealPiece = {
      key: label.key,
      title: label.displayText,
      tone: label.tone,
      iconKey: label.displayText,
      playerId: draftStealWinner.playerId,
      playerName: info?.playerName ?? "Unknown Player",
      position: info?.position ?? null,
      statValue: `${pts.toLocaleString()} pts`,
      story:
        `Round ${draftStealWinner.round}, pick ${draftStealWinner.pickNumber} of the ` +
        `${draftStealWinner.seasonYear} startup${crest ? ` by ${crest.name}` : ""}. ` +
        `${pts.toLocaleString()} points in their colors. Larceny.`,
      franchiseBadge: crest,
    };
  }

  let waiverMiraclePiece: LorePiece | null = null;
  if (waiverMiracleWinner) {
    const label = SNARKY_LABELS.THE_WAIVER_MIRACLE;
    const pts = Math.round(waiverMiracleWinner.scopedPts);
    const crest = franchiseById.get(waiverMiracleWinner.scopedFranchiseId) ?? null;
    waiverMiraclePiece = {
      key: label.key,
      title: label.displayText,
      tone: label.tone,
      iconKey: label.displayText,
      playerId: waiverMiracleWinner.playerId,
      playerName: waiverMiracleWinner.playerName,
      position: waiverMiracleWinner.position,
      statValue: `${pts.toLocaleString()} pts`,
      story:
        `${pts.toLocaleString()} points in ${waiverMiracleWinner.seasonYear} for ` +
        `${crest ? crest.name : "one franchise"}, straight off the wire. Free money.`,
      franchiseBadge: crest,
    };
  }

  let ironManPiece: LorePiece | null = null;
  if (ironManWinner) {
    const label = SNARKY_LABELS.THE_IRON_MAN;
    const topFranchiseId = pickTopFranchiseByStarts(
      franchiseWeeksByPlayer.get(ironManWinner.playerId) ?? [],
    );
    const crest = topFranchiseId ? franchiseById.get(topFranchiseId) ?? null : null;
    ironManPiece = {
      key: label.key,
      title: label.displayText,
      tone: label.tone,
      iconKey: label.displayText,
      playerId: ironManWinner.playerId,
      playerName: ironManWinner.playerName,
      position: ironManWinner.position,
      statValue: `${ironManWinner.careerStarts} starts`,
      story:
        `${ironManWinner.careerStarts} career starts across ${ironManWinner.seasonsCount} seasons. ` +
        "Never off the field.",
      franchiseBadge: crest,
    };
  }

  let cometPiece: LorePiece | null = null;
  if (cometWinner) {
    const label = SNARKY_LABELS.THE_COMET;
    const seasonFranchiseId = pickSeasonFranchise(
      franchiseWeeksByPlayer.get(cometWinner.playerId) ?? [],
      cometWinner.seasonYear,
    );
    const crest = seasonFranchiseId ? franchiseById.get(seasonFranchiseId) ?? null : null;
    cometPiece = {
      key: label.key,
      title: label.displayText,
      tone: label.tone,
      iconKey: label.displayText,
      playerId: cometWinner.playerId,
      playerName: cometWinner.playerName,
      position: cometWinner.position,
      statValue: `${cometWinner.seasonPoints.toFixed(1)} pts`,
      story:
        `${cometWinner.seasonPoints.toFixed(1)} points in ${cometWinner.seasonYear}` +
        `${crest ? ` for ${crest.name}` : ""}. The single greatest fantasy season this league has witnessed.`,
      franchiseBadge: crest,
    };
  }

  let bustPiece: LorePiece | null = null;
  if (bustWinner) {
    const label = SNARKY_LABELS.THE_BUST;
    const info = careerByPlayerId.get(bustWinner.playerId);
    const pts = Math.round(bustWinner.scopedPts);
    const crest = bustWinner.franchiseId ? franchiseById.get(bustWinner.franchiseId) ?? null : null;
    const draftLabel = bustWinner.draftType === "startup" ? "startup" : "rookie draft";
    const expectedPts = Math.round(bustWinner.expectedPts);

    const latestSeasonId = await getLatestSeasonId();
    const stillRostered =
      latestSeasonId != null && bustWinner.franchiseId != null
        ? await isPlayerOnFranchiseRoster(latestSeasonId, bustWinner.franchiseId, bustWinner.playerId)
        : false;
    const outcome = classifyBustOutcome(stillRostered);

    const story =
      outcome === "rostered"
        ? `Round ${bustWinner.round}, pick ${bustWinner.pickNumber} of the ${bustWinner.seasonYear} ${draftLabel}. ` +
          `${pts.toLocaleString()} points where the round demands ${expectedPts}. Still on the roster, waiting continues.`
        : `Round ${bustWinner.round}, pick ${bustWinner.pickNumber} of the ${bustWinner.seasonYear} ${draftLabel}. ` +
          `${pts.toLocaleString()} points where the round demands ${expectedPts}. Then cut for nothing. Woof.`;

    bustPiece = {
      key: label.key,
      title: label.displayText,
      tone: label.tone,
      iconKey: label.displayText,
      playerId: bustWinner.playerId,
      playerName: info?.playerName ?? "Unknown Player",
      position: info?.position ?? null,
      statValue: `${pts.toLocaleString()} pts`,
      story,
      franchiseBadge: crest,
    };
  }

  // Final slot order: 4 thrones, Draft Steal, Waiver Miracle, Cornerstone,
  // Iron Man, Wanderer, Waiver Yo-Yo, Comet, Bust (last).
  const rest = [
    draftStealPiece,
    waiverMiraclePiece,
    cornerstonePiece,
    ironManPiece,
    wandererPiece,
    yoyoPiece,
    cometPiece,
    bustPiece,
  ].filter((p): p is LorePiece => p != null);

  return [...pieces, ...rest];
}
