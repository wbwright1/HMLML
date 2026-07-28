import { db } from "@/lib/db";
import {
  players,
  playerWeekPoints,
  playerWeekStats,
  draftPicks,
  transactions,
  franchiseSeasons,
  franchises,
  matchups,
  seasons,
} from "@/lib/db/schema";
import { and, eq, gt, inArray } from "drizzle-orm";
import { getPlayerById, type PlayerSearchResult } from "@/lib/queries/players";
import { compareEventKeys } from "@/lib/queries/franchise-players";
import {
  getValueSeriesForAsset,
  type ValueSeriesPoint,
} from "@/lib/queries/player-values";
import { getAwardsForPlayer } from "@/lib/queries/awards";
import type { AwardEntry } from "@/lib/queries/awards";

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export interface PlayerProfileIdentity extends PlayerSearchResult {
  /** COUNT(DISTINCT season) the player appears in player_week_points. */
  yearsInLeague: number;
  /** Season YEARS the player has any player_week_points row, sorted desc (for the season picker). */
  seasonsPresent: number[];
  /**
   * Latest season year with actual scoring (points > 0), falling back to the
   * latest present season. Preseason projection rows make the current season
   * "present" before any games are played; defaulting the picker there would
   * open every profile on an empty table until week 1.
   */
  defaultSeason: number | null;
}

/**
 * Identity + league-tenure facts for a player. Reuses getPlayerById for the bio
 * + current-owner fields, then adds yearsInLeague (distinct seasons scored) and
 * seasonsPresent (season years, desc) for the profile's season picker. Returns
 * null when the player is unknown.
 */
export async function getPlayerProfileIdentity(
  playerId: string,
): Promise<PlayerProfileIdentity | null> {
  try {
    const base = await getPlayerById(playerId);
    if (!base) return null;

    const rows = await db
      .selectDistinct({ seasonId: playerWeekPoints.seasonId })
      .from(playerWeekPoints)
      .where(eq(playerWeekPoints.playerId, playerId));

    const scoredRows = await db
      .selectDistinct({ seasonId: playerWeekPoints.seasonId })
      .from(playerWeekPoints)
      .where(
        and(eq(playerWeekPoints.playerId, playerId), gt(playerWeekPoints.points, 0)),
      );

    let seasonsPresent: number[] = [];
    let seasonsScored: number[] = [];
    if (rows.length > 0) {
      const seasonRows = await db
        .select({ id: seasons.id, seasonYear: seasons.seasonYear })
        .from(seasons)
        .where(
          inArray(
            seasons.id,
            rows.map((r) => r.seasonId),
          ),
        );
      const yearBySeasonId = new Map(seasonRows.map((s) => [s.id, s.seasonYear]));
      seasonsPresent = seasonRows
        .map((s) => s.seasonYear)
        .sort((a, b) => b - a);
      seasonsScored = scoredRows
        .map((r) => yearBySeasonId.get(r.seasonId))
        .filter((y): y is number => y != null)
        .sort((a, b) => b - a);
    }

    return {
      ...base,
      yearsInLeague: seasonsPresent.length,
      seasonsPresent,
      defaultSeason: seasonsScored[0] ?? seasonsPresent[0] ?? null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export interface TimelineFranchiseRef {
  id: string;
  name: string;
  slug: string;
}

export type TimelineEventType =
  | "drafted"
  | "trade_in"
  | "trade_out"
  | "waiver_add"
  | "drop"
  | "award"
  | "stint";

export interface TimelineEvent {
  type: TimelineEventType;
  seasonYear: number;
  /** Week the event occurred, when known (null for drafts, stints, awards). */
  week: number | null;
  /** Sleeper created-at ms, when known (transactions only) — for date display. */
  sleeperMs: number | null;
  /** Franchise involved (null when unresolvable, e.g. a roster with no franchise mapping). */
  franchise: TimelineFranchiseRef | null;
  /** Transaction id for deep links (trade_in/out, waiver_add, drop). */
  transactionId: string | null;
  /**
   * The transactions table's serial PK, distinct from transactionId (Sleeper's
   * text id) — this is what /trades#trade-{id} anchors on (see trade-card.tsx).
   * Only set for trade_in/trade_out events; null otherwise.
   */
  tradeDbId: number | null;
  // draft specifics
  draftType: string | null;
  draftRound: number | null;
  draftPickNumber: number | null;
  // award specifics
  awardType: string | null;
  awardNote: string | null;
  // stint specifics: a continuous run of presence with one franchise.
  stintEndSeasonYear: number | null;
}

/** Internal sort key: [seasonYear, weekForOrder, msForOrder]. */
function orderKey(e: TimelineEvent): [number, number, number] {
  switch (e.type) {
    case "stint":
      return [e.seasonYear, -2, -Infinity];
    case "drafted":
      return [e.seasonYear, -1, -Infinity];
    case "award":
      return [e.seasonYear, 99, Infinity];
    default:
      return [e.seasonYear, e.week ?? 0, e.sleeperMs ?? 0];
  }
}

interface TransactionTimelineRow {
  id: number;
  transactionId: string;
  seasonId: number;
  seasonYear: number;
  week: number | null;
  type: string;
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  createdAtSleeper: number | null;
}

/**
 * The full career timeline for a player: draft, trades in/out, waiver adds,
 * drops, league awards, and rostered stints, most recent first. Each event
 * carries its season year, week/date when known, the franchise involved (id +
 * name + slug for crests), and a transactionId on transaction-derived events
 * for deep links. Returns [] when the player has no events / on error.
 */
export async function getPlayerTimeline(
  playerId: string,
): Promise<TimelineEvent[]> {
  try {
    // Franchise id -> {name, slug} for crest resolution.
    const franchiseRows = await db
      .select({
        id: franchises.id,
        name: franchises.name,
        slug: franchises.slug,
      })
      .from(franchises);
    const franchiseById = new Map<string, TimelineFranchiseRef>();
    for (const f of franchiseRows) franchiseById.set(f.id, f);

    // season id -> year.
    const seasonRows = await db
      .select({ id: seasons.id, seasonYear: seasons.seasonYear })
      .from(seasons);
    const yearBySeasonId = new Map(seasonRows.map((s) => [s.id, s.seasonYear]));

    // roster_id -> franchise id, per season (to resolve adds/drops).
    const fsRows = await db
      .select({
        seasonId: franchiseSeasons.seasonId,
        rosterId: franchiseSeasons.rosterId,
        franchiseId: franchiseSeasons.franchiseId,
      })
      .from(franchiseSeasons);
    const franchiseBySeasonRoster = new Map<string, string>();
    for (const fs of fsRows) {
      franchiseBySeasonRoster.set(
        `${fs.seasonId}:${fs.rosterId}`,
        fs.franchiseId,
      );
    }

    const events: TimelineEvent[] = [];

    // --- Draft events ---
    const draftRows = await db
      .select({
        seasonId: draftPicks.seasonId,
        draftType: draftPicks.draftType,
        round: draftPicks.round,
        pickNumber: draftPicks.pickNumber,
        franchiseId: draftPicks.franchiseId,
      })
      .from(draftPicks)
      .where(eq(draftPicks.playerId, playerId));

    for (const d of draftRows) {
      const year = yearBySeasonId.get(d.seasonId);
      if (year === undefined) continue;
      events.push({
        type: "drafted",
        seasonYear: year,
        week: null,
        sleeperMs: null,
        franchise: d.franchiseId
          ? franchiseById.get(d.franchiseId) ?? null
          : null,
        transactionId: null,
        tradeDbId: null,
        draftType: d.draftType,
        draftRound: d.round,
        draftPickNumber: d.pickNumber,
        awardType: null,
        awardNote: null,
        stintEndSeasonYear: null,
      });
    }

    // --- Transaction events (trade in/out, waiver add, drop) ---
    const txRows = (await db
      .select({
        id: transactions.id,
        transactionId: transactions.transactionId,
        seasonId: transactions.seasonId,
        seasonYear: seasons.seasonYear,
        week: transactions.week,
        type: transactions.type,
        adds: transactions.adds,
        drops: transactions.drops,
        createdAtSleeper: transactions.createdAtSleeper,
      })
      .from(transactions)
      .innerJoin(
        seasons,
        eq(transactions.seasonId, seasons.id),
      )) as unknown as TransactionTimelineRow[];

    for (const tx of txRows) {
      const addRoster = tx.adds?.[playerId];
      if (addRoster !== undefined) {
        const franchiseId = franchiseBySeasonRoster.get(
          `${tx.seasonId}:${addRoster}`,
        );
        events.push({
          type: tx.type === "trade" ? "trade_in" : "waiver_add",
          seasonYear: tx.seasonYear,
          week: tx.week ?? null,
          sleeperMs: tx.createdAtSleeper ?? null,
          franchise: franchiseId
            ? franchiseById.get(franchiseId) ?? null
            : null,
          transactionId: tx.transactionId,
          tradeDbId: tx.type === "trade" ? tx.id : null,
          draftType: null,
          draftRound: null,
          draftPickNumber: null,
          awardType: null,
          awardNote: null,
          stintEndSeasonYear: null,
        });
      }

      const dropRoster = tx.drops?.[playerId];
      if (dropRoster !== undefined) {
        const franchiseId = franchiseBySeasonRoster.get(
          `${tx.seasonId}:${dropRoster}`,
        );
        events.push({
          type: tx.type === "trade" ? "trade_out" : "drop",
          seasonYear: tx.seasonYear,
          week: tx.week ?? null,
          sleeperMs: tx.createdAtSleeper ?? null,
          franchise: franchiseId
            ? franchiseById.get(franchiseId) ?? null
            : null,
          transactionId: tx.transactionId,
          tradeDbId: tx.type === "trade" ? tx.id : null,
          draftType: null,
          draftRound: null,
          draftPickNumber: null,
          awardType: null,
          awardNote: null,
          stintEndSeasonYear: null,
        });
      }
    }

    // --- Award events ---
    const awards = await getAwardsForPlayer(playerId);
    for (const a of awards) {
      events.push({
        type: "award",
        seasonYear: a.seasonYear,
        week: null,
        sleeperMs: null,
        franchise: a.franchise
          ? { id: a.franchise.id, name: a.franchise.name, slug: a.franchise.slug }
          : null,
        transactionId: null,
        tradeDbId: null,
        draftType: null,
        draftRound: null,
        draftPickNumber: null,
        awardType: a.awardType,
        awardNote: a.note,
        stintEndSeasonYear: null,
      });
    }

    // --- Stint events: contiguous runs of presence with one franchise ---
    const presenceRows = await db
      .selectDistinct({
        franchiseId: playerWeekPoints.franchiseId,
        seasonId: playerWeekPoints.seasonId,
      })
      .from(playerWeekPoints)
      .where(eq(playerWeekPoints.playerId, playerId));

    const yearsByFranchise = new Map<string, number[]>();
    for (const p of presenceRows) {
      const year = yearBySeasonId.get(p.seasonId);
      if (year === undefined) continue;
      const list = yearsByFranchise.get(p.franchiseId) ?? [];
      list.push(year);
      yearsByFranchise.set(p.franchiseId, list);
    }

    for (const [franchiseId, years] of yearsByFranchise) {
      const sorted = [...new Set(years)].sort((a, b) => a - b);
      let runStart = sorted[0];
      let prev = sorted[0];
      const flush = (endYear: number) => {
        events.push({
          type: "stint",
          seasonYear: runStart,
          week: null,
          sleeperMs: null,
          franchise: franchiseById.get(franchiseId) ?? null,
          transactionId: null,
          tradeDbId: null,
          draftType: null,
          draftRound: null,
          draftPickNumber: null,
          awardType: null,
          awardNote: null,
          stintEndSeasonYear: endYear,
        });
      };
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === prev + 1) {
          prev = sorted[i];
          continue;
        }
        flush(prev);
        runStart = sorted[i];
        prev = sorted[i];
      }
      flush(prev);
    }

    // Most recent first.
    events.sort((a, b) => compareEventKeys(orderKey(b), orderKey(a)));
    return events;
  } catch (error) {
    console.error("[player-profile] getPlayerTimeline error:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Weekly points (per season)
// ---------------------------------------------------------------------------

export interface PlayerWeeklyPointRow {
  week: number;
  points: number;
  projectedPoints: number | null;
  slot: string | null;
  started: boolean;
  franchiseId: string;
  matchupId: number | null;
  opponentFranchiseId: string | null;
  opponentFranchiseName: string | null;
  opponentFranchiseSlug: string | null;
}

/**
 * Every player_week_points row for a player in one season year, week-ascending,
 * with the opponent franchise resolved from the matchups table (same season /
 * week / matchupId, the other franchise). Returns [] when the season isn't
 * loaded or the player has no rows.
 */
export async function getPlayerWeeklyPoints(
  playerId: string,
  seasonYear: number,
): Promise<PlayerWeeklyPointRow[]> {
  try {
    const [season] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.seasonYear, seasonYear));
    if (!season) return [];

    const rows = await db
      .select({
        week: playerWeekPoints.week,
        points: playerWeekPoints.points,
        projectedPoints: playerWeekPoints.projectedPoints,
        slot: playerWeekPoints.slot,
        started: playerWeekPoints.started,
        franchiseId: playerWeekPoints.franchiseId,
        matchupId: playerWeekPoints.matchupId,
      })
      .from(playerWeekPoints)
      .where(
        and(
          eq(playerWeekPoints.playerId, playerId),
          eq(playerWeekPoints.seasonId, season.id),
        ),
      );

    if (rows.length === 0) return [];

    // Resolve opponents: all matchup rows for this season, joined to franchises.
    const matchupRows = await db
      .select({
        week: matchups.week,
        matchupId: matchups.matchupId,
        franchiseId: matchups.franchiseId,
        franchiseName: franchises.name,
        franchiseSlug: franchises.slug,
      })
      .from(matchups)
      .innerJoin(franchises, eq(matchups.franchiseId, franchises.id))
      .where(eq(matchups.seasonId, season.id));

    // (week|matchupId) -> list of {franchiseId, name, slug}
    const pairByKey = new Map<
      string,
      { franchiseId: string; name: string; slug: string }[]
    >();
    for (const m of matchupRows) {
      const key = `${m.week}|${m.matchupId}`;
      const list = pairByKey.get(key) ?? [];
      list.push({
        franchiseId: m.franchiseId,
        name: m.franchiseName,
        slug: m.franchiseSlug,
      });
      pairByKey.set(key, list);
    }

    return rows
      .map((r) => {
        let opponentFranchiseId: string | null = null;
        let opponentFranchiseName: string | null = null;
        let opponentFranchiseSlug: string | null = null;
        if (r.matchupId != null) {
          const pair = pairByKey.get(`${r.week}|${r.matchupId}`) ?? [];
          const opp = pair.find((p) => p.franchiseId !== r.franchiseId);
          if (opp) {
            opponentFranchiseId = opp.franchiseId;
            opponentFranchiseName = opp.name;
            opponentFranchiseSlug = opp.slug;
          }
        }
        return {
          week: r.week,
          points: r.points,
          projectedPoints: r.projectedPoints,
          slot: r.slot,
          started: r.started,
          franchiseId: r.franchiseId,
          matchupId: r.matchupId,
          opponentFranchiseId,
          opponentFranchiseName,
          opponentFranchiseSlug,
        };
      })
      .sort((a, b) => a.week - b.week);
  } catch (error) {
    console.error("[player-profile] getPlayerWeeklyPoints error:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Season points aggregates
// ---------------------------------------------------------------------------

export interface WeekRef {
  week: number;
  seasonYear: number;
  points: number;
}

export interface PlayerSeasonPointsAggregate {
  seasonYear: number;
  /** Sum of all points (started + benched). */
  totalPoints: number;
  /** Sum of points scored while in a starting slot. */
  startedPoints: number;
  startedWeeks: number;
  benchedWeeks: number;
  /** Sum of points scored while benched (points left on the bench). */
  benchPoints: number;
  /** startedPoints / startedWeeks, null when never started. */
  avgWhenStarted: number | null;
  /** Highest-scoring STARTED week of the season; null when never started. */
  bestWeek: WeekRef | null;
  /** Lowest-scoring STARTED week of the season; null when never started. */
  worstStartedWeek: WeekRef | null;
}

/**
 * Per-season point aggregates for a player, most recent season first. Best /
 * worst weeks and avgWhenStarted are computed over STARTED weeks only (a big
 * game from the bench isn't a performance the manager captured). Bench points
 * are the points that scored while the player sat. Returns [] on error / no data.
 */
export async function getPlayerSeasonPointsAggregates(
  playerId: string,
): Promise<PlayerSeasonPointsAggregate[]> {
  try {
    const rows = await db
      .select({
        seasonId: playerWeekPoints.seasonId,
        week: playerWeekPoints.week,
        points: playerWeekPoints.points,
        started: playerWeekPoints.started,
      })
      .from(playerWeekPoints)
      .where(eq(playerWeekPoints.playerId, playerId));

    if (rows.length === 0) return [];

    const seasonRows = await db
      .select({ id: seasons.id, seasonYear: seasons.seasonYear })
      .from(seasons);
    const yearBySeasonId = new Map(seasonRows.map((s) => [s.id, s.seasonYear]));

    interface Acc {
      seasonYear: number;
      totalPoints: number;
      startedPoints: number;
      startedWeeks: number;
      benchedWeeks: number;
      benchPoints: number;
      bestWeek: WeekRef | null;
      worstStartedWeek: WeekRef | null;
    }
    const bySeason = new Map<number, Acc>();

    for (const r of rows) {
      const seasonYear = yearBySeasonId.get(r.seasonId);
      if (seasonYear === undefined) continue;
      const acc =
        bySeason.get(r.seasonId) ??
        ({
          seasonYear,
          totalPoints: 0,
          startedPoints: 0,
          startedWeeks: 0,
          benchedWeeks: 0,
          benchPoints: 0,
          bestWeek: null,
          worstStartedWeek: null,
        } satisfies Acc);

      const pts = r.points ?? 0;
      acc.totalPoints += pts;
      if (r.started) {
        acc.startedPoints += pts;
        acc.startedWeeks += 1;
        const ref: WeekRef = { week: r.week, seasonYear, points: pts };
        if (!acc.bestWeek || pts > acc.bestWeek.points) acc.bestWeek = ref;
        if (!acc.worstStartedWeek || pts < acc.worstStartedWeek.points)
          acc.worstStartedWeek = ref;
      } else {
        acc.benchedWeeks += 1;
        acc.benchPoints += pts;
      }

      bySeason.set(r.seasonId, acc);
    }

    return [...bySeason.values()]
      .map((a) => ({
        seasonYear: a.seasonYear,
        totalPoints: a.totalPoints,
        startedPoints: a.startedPoints,
        startedWeeks: a.startedWeeks,
        benchedWeeks: a.benchedWeeks,
        benchPoints: a.benchPoints,
        avgWhenStarted:
          a.startedWeeks > 0 ? a.startedPoints / a.startedWeeks : null,
        bestWeek: a.bestWeek,
        worstStartedWeek: a.worstStartedWeek,
      }))
      .sort((a, b) => b.seasonYear - a.seasonYear);
  } catch (error) {
    console.error(
      "[player-profile] getPlayerSeasonPointsAggregates error:",
      error,
    );
    return [];
  }
}

// ---------------------------------------------------------------------------
// Weekly stats (per season) + season stat totals
// ---------------------------------------------------------------------------

export interface PlayerWeeklyStatRow {
  week: number;
  position: string | null;
  gamesPlayed: number | null;
  passYd: number | null;
  passTd: number | null;
  passInt: number | null;
  passAtt: number | null;
  passCmp: number | null;
  rushYd: number | null;
  rushTd: number | null;
  rushAtt: number | null;
  rec: number | null;
  recYd: number | null;
  recTd: number | null;
  recTgt: number | null;
  fumLost: number | null;
  fgm: number | null;
  fga: number | null;
  xpm: number | null;
  stats: Record<string, number | null> | null;
}

/**
 * Every player_week_stats row for a player in one season year, week-ascending.
 * Returns [] when the season isn't loaded, the player has no stat rows, or the
 * table doesn't exist yet (pre-migration) — the whole profile still renders.
 */
export async function getPlayerWeeklyStats(
  playerId: string,
  seasonYear: number,
): Promise<PlayerWeeklyStatRow[]> {
  try {
    const [season] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.seasonYear, seasonYear));
    if (!season) return [];

    const rows = await db
      .select({
        week: playerWeekStats.week,
        position: playerWeekStats.position,
        gamesPlayed: playerWeekStats.gamesPlayed,
        passYd: playerWeekStats.passYd,
        passTd: playerWeekStats.passTd,
        passInt: playerWeekStats.passInt,
        passAtt: playerWeekStats.passAtt,
        passCmp: playerWeekStats.passCmp,
        rushYd: playerWeekStats.rushYd,
        rushTd: playerWeekStats.rushTd,
        rushAtt: playerWeekStats.rushAtt,
        rec: playerWeekStats.rec,
        recYd: playerWeekStats.recYd,
        recTd: playerWeekStats.recTd,
        recTgt: playerWeekStats.recTgt,
        fumLost: playerWeekStats.fumLost,
        fgm: playerWeekStats.fgm,
        fga: playerWeekStats.fga,
        xpm: playerWeekStats.xpm,
        stats: playerWeekStats.stats,
      })
      .from(playerWeekStats)
      .where(
        and(
          eq(playerWeekStats.playerId, playerId),
          eq(playerWeekStats.seasonId, season.id),
        ),
      );

    return rows
      .map((r) => ({
        ...r,
        stats: (r.stats as Record<string, number | null> | null) ?? null,
      }))
      .sort((a, b) => a.week - b.week);
  } catch (error) {
    // Table may not exist yet (pre-migration): degrade to empty, don't crash.
    const code = (error as { code?: string } | null)?.code;
    if (code !== "42P01") {
      console.error("[player-profile] getPlayerWeeklyStats error:", error);
    }
    return [];
  }
}

const CURATED_STAT_KEYS = [
  "passYd",
  "passTd",
  "passInt",
  "passAtt",
  "passCmp",
  "rushYd",
  "rushTd",
  "rushAtt",
  "rec",
  "recYd",
  "recTd",
  "recTgt",
  "fumLost",
  "fgm",
  "fga",
  "xpm",
] as const;

export type CuratedStatKey = (typeof CURATED_STAT_KEYS)[number];

export interface PlayerSeasonStatTotals {
  seasonYear: number;
  gamesPlayed: number;
  totals: Record<CuratedStatKey, number>;
}

/**
 * Per-season sums of the curated stat columns for a player (games + each
 * passing/rushing/receiving/kicking total), most recent season first. A stat
 * that is null every week sums to 0. Empty on error / no data / pre-migration.
 */
export async function getPlayerSeasonStatTotals(
  playerId: string,
): Promise<PlayerSeasonStatTotals[]> {
  try {
    const rows = await db
      .select({
        seasonId: playerWeekStats.seasonId,
        gamesPlayed: playerWeekStats.gamesPlayed,
        passYd: playerWeekStats.passYd,
        passTd: playerWeekStats.passTd,
        passInt: playerWeekStats.passInt,
        passAtt: playerWeekStats.passAtt,
        passCmp: playerWeekStats.passCmp,
        rushYd: playerWeekStats.rushYd,
        rushTd: playerWeekStats.rushTd,
        rushAtt: playerWeekStats.rushAtt,
        rec: playerWeekStats.rec,
        recYd: playerWeekStats.recYd,
        recTd: playerWeekStats.recTd,
        recTgt: playerWeekStats.recTgt,
        fumLost: playerWeekStats.fumLost,
        fgm: playerWeekStats.fgm,
        fga: playerWeekStats.fga,
        xpm: playerWeekStats.xpm,
      })
      .from(playerWeekStats)
      .where(eq(playerWeekStats.playerId, playerId));

    if (rows.length === 0) return [];

    const seasonRows = await db
      .select({ id: seasons.id, seasonYear: seasons.seasonYear })
      .from(seasons);
    const yearBySeasonId = new Map(seasonRows.map((s) => [s.id, s.seasonYear]));

    interface Acc {
      seasonYear: number;
      gamesPlayed: number;
      totals: Record<CuratedStatKey, number>;
    }
    const bySeason = new Map<number, Acc>();

    for (const r of rows) {
      const seasonYear = yearBySeasonId.get(r.seasonId);
      if (seasonYear === undefined) continue;
      const acc =
        bySeason.get(r.seasonId) ??
        ({
          seasonYear,
          gamesPlayed: 0,
          totals: Object.fromEntries(
            CURATED_STAT_KEYS.map((k) => [k, 0]),
          ) as Record<CuratedStatKey, number>,
        } satisfies Acc);

      acc.gamesPlayed += r.gamesPlayed ?? 0;
      for (const k of CURATED_STAT_KEYS) {
        acc.totals[k] += (r[k] as number | null) ?? 0;
      }
      bySeason.set(r.seasonId, acc);
    }

    return [...bySeason.values()].sort((a, b) => b.seasonYear - a.seasonYear);
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code !== "42P01") {
      console.error("[player-profile] getPlayerSeasonStatTotals error:", error);
    }
    return [];
  }
}

// ---------------------------------------------------------------------------
// Value series
// ---------------------------------------------------------------------------

/**
 * The player's dynasty-value time series (thin wrapper over
 * getValueSeriesForAsset — a player_id is its own asset id). Ascending by date,
 * spanning both value sources.
 */
export async function getPlayerValueSeries(
  playerId: string,
): Promise<ValueSeriesPoint[]> {
  return getValueSeriesForAsset(playerId);
}

// ---------------------------------------------------------------------------
// Ownership facts
// ---------------------------------------------------------------------------

export interface PlayerOwnershipFacts {
  careerStarts: number;
  careerBenchedWeeks: number;
  /** Total points that scored while the player was benched, across every season. */
  totalBenchPoints: number;
  /** Best STARTED week across the player's whole career. */
  careerBestWeek: WeekRef | null;
  /** Worst STARTED week across the player's whole career. */
  careerWorstStartedWeek: WeekRef | null;
}

/**
 * Career ownership facts derived from the per-season point aggregates: total
 * started vs benched weeks, total bench points, and the career best / worst
 * started week. Accepts the aggregates when the caller already has them (the
 * composer does), else fetches them.
 */
export async function getPlayerOwnershipFacts(
  playerId: string,
  aggregates?: PlayerSeasonPointsAggregate[],
): Promise<PlayerOwnershipFacts> {
  const aggs =
    aggregates ?? (await getPlayerSeasonPointsAggregates(playerId));

  let careerStarts = 0;
  let careerBenchedWeeks = 0;
  let totalBenchPoints = 0;
  let careerBestWeek: WeekRef | null = null;
  let careerWorstStartedWeek: WeekRef | null = null;

  for (const a of aggs) {
    careerStarts += a.startedWeeks;
    careerBenchedWeeks += a.benchedWeeks;
    totalBenchPoints += a.benchPoints;
    if (a.bestWeek && (!careerBestWeek || a.bestWeek.points > careerBestWeek.points)) {
      careerBestWeek = a.bestWeek;
    }
    if (
      a.worstStartedWeek &&
      (!careerWorstStartedWeek ||
        a.worstStartedWeek.points < careerWorstStartedWeek.points)
    ) {
      careerWorstStartedWeek = a.worstStartedWeek;
    }
  }

  return {
    careerStarts,
    careerBenchedWeeks,
    totalBenchPoints,
    careerBestWeek,
    careerWorstStartedWeek,
  };
}

// ---------------------------------------------------------------------------
// Awards
// ---------------------------------------------------------------------------

/** Every league award the player has won (wrapper over getAwardsForPlayer). */
export async function getPlayerAwards(playerId: string): Promise<AwardEntry[]> {
  return getAwardsForPlayer(playerId);
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

export interface PlayerProfile {
  identity: PlayerProfileIdentity;
  timeline: TimelineEvent[];
  awards: AwardEntry[];
  valueSeries: ValueSeriesPoint[];
  seasonStatTotals: PlayerSeasonStatTotals[];
  seasonPointsAggregates: PlayerSeasonPointsAggregate[];
  ownershipFacts: PlayerOwnershipFacts;
}

/**
 * Full player profile for the /players/[id] page: identity plus the career-wide
 * data (timeline, awards, value series, per-season stat + point aggregates, and
 * ownership facts). Season-scoped weekly detail (getPlayerWeeklyPoints /
 * getPlayerWeeklyStats) is fetched separately by the season picker, not here.
 * Returns null when the player is unknown.
 */
export async function getPlayerProfile(
  playerId: string,
): Promise<PlayerProfile | null> {
  const identity = await getPlayerProfileIdentity(playerId);
  if (!identity) return null;

  const [
    timeline,
    awards,
    valueSeries,
    seasonStatTotals,
    seasonPointsAggregates,
  ] = await Promise.all([
    getPlayerTimeline(playerId),
    getPlayerAwards(playerId),
    getPlayerValueSeries(playerId),
    getPlayerSeasonStatTotals(playerId),
    getPlayerSeasonPointsAggregates(playerId),
  ]);

  const ownershipFacts = await getPlayerOwnershipFacts(
    playerId,
    seasonPointsAggregates,
  );

  return {
    identity,
    timeline,
    awards,
    valueSeries,
    seasonStatTotals,
    seasonPointsAggregates,
    ownershipFacts,
  };
}
