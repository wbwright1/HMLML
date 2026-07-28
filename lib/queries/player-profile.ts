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
  rosterPlayers,
  seasons,
} from "@/lib/db/schema";
import { and, eq, gt, inArray, max } from "drizzle-orm";
import { getPlayerById, type PlayerSearchResult } from "@/lib/queries/players";
import { compareEventKeys } from "@/lib/queries/franchise-players";
import {
  getValueSeriesForAsset,
  type ValueSeriesPoint,
} from "@/lib/queries/player-values";
import { getAwardsForPlayer } from "@/lib/queries/awards";
import type { AwardEntry } from "@/lib/queries/awards";
import {
  computeOwnershipStints,
  type OwnershipPresence,
} from "@/lib/player-ownership-stints";
import {
  classifyPlayerWeekAvailability,
  getSeasonScheduleFacts,
  normalizeNflTeam,
  seasonWeekKey,
} from "@/lib/player-week-availability";

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
  /** Current owner's latest-season team avatar for crest rendering. */
  ownerAvatarUrl: string | null;
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

    const [pointRows, rosteredRows, statRows, scoredRows] = await Promise.all([
      db
        .selectDistinct({ seasonId: playerWeekPoints.seasonId })
        .from(playerWeekPoints)
        .where(eq(playerWeekPoints.playerId, playerId)),
      db
        .selectDistinct({ seasonId: rosterPlayers.seasonId })
        .from(rosterPlayers)
        .where(eq(rosterPlayers.playerId, playerId)),
      // NFL stat lines exist even for seasons nobody in the league rostered
      // the player (full-career stats) — those seasons belong in the picker.
      db
        .selectDistinct({ seasonId: playerWeekStats.seasonId })
        .from(playerWeekStats)
        .where(eq(playerWeekStats.playerId, playerId)),
      db
        .selectDistinct({ seasonId: playerWeekPoints.seasonId })
        .from(playerWeekPoints)
        .where(
          and(eq(playerWeekPoints.playerId, playerId), gt(playerWeekPoints.points, 0)),
        ),
    ]);
    const rows = [
      ...new Set(
        [...pointRows, ...rosteredRows, ...statRows].map((r) => r.seasonId),
      ),
    ].map((seasonId) => ({ seasonId }));

    let seasonsPresent: number[] = [];
    let seasonsScored: number[] = [];
    let leagueSeasonCount = 0;
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
      // League tenure counts only seasons someone actually had the player
      // (lineups or rosters) — stat-only NFL seasons don't add HMLML years.
      leagueSeasonCount = new Set(
        [...pointRows, ...rosteredRows].map((r) => r.seasonId),
      ).size;
    }

    let ownerAvatarUrl: string | null = null;
    if (base.ownerFranchiseId) {
      const avatarRows = await db
        .select({
          seasonId: franchiseSeasons.seasonId,
          avatarUrl: franchiseSeasons.avatarUrl,
        })
        .from(franchiseSeasons)
        .where(eq(franchiseSeasons.franchiseId, base.ownerFranchiseId));
      const seasonYears = await db
        .select({ id: seasons.id, seasonYear: seasons.seasonYear })
        .from(seasons);
      const yearById = new Map(seasonYears.map((s) => [s.id, s.seasonYear]));
      let bestYear = -1;
      for (const a of avatarRows) {
        const year = yearById.get(a.seasonId) ?? 0;
        if (a.avatarUrl && year > bestYear) {
          ownerAvatarUrl = a.avatarUrl;
          bestYear = year;
        }
      }
    }

    return {
      ...base,
      yearsInLeague: leagueSeasonCount,
      seasonsPresent,
      defaultSeason: seasonsScored[0] ?? seasonsPresent[0] ?? null,
      ownerAvatarUrl,
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
  /** Latest-season team avatar for crest rendering. */
  avatarUrl: string | null;
}

export type TimelineEventType =
  | "drafted"
  | "traded"
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
  /**
   * Franchise involved. For "traded" events, this is the gaining franchise
   * (falling back to the losing franchise when the gaining side is
   * unresolvable) — see tradeFromFranchise/tradeToFranchise for both sides.
   * Null when unresolvable, e.g. a roster with no franchise mapping.
   */
  franchise: TimelineFranchiseRef | null;
  /** Transaction id for deep links (traded, waiver_add, drop). */
  transactionId: string | null;
  /**
   * The transactions table's serial PK, distinct from transactionId (Sleeper's
   * text id) — this is what /trades#trade-{id} anchors on (see trade-card.tsx).
   * Only set for "traded" events; null otherwise.
   */
  tradeDbId: number | null;
  /** The franchise the player was traded AWAY from (traded events only, null otherwise). */
  tradeFromFranchise: TimelineFranchiseRef | null;
  /** The franchise the player was traded TO (traded events only, null otherwise). */
  tradeToFranchise: TimelineFranchiseRef | null;
  // draft specifics
  draftType: string | null;
  draftRound: number | null;
  /** Overall pick number (draft_picks.pick_number, which IS overall). */
  draftPickNumber: number | null;
  /** Pick number within the round (1-based), null when the draft's per-round pick count can't be determined (e.g. legacy picks). */
  draftPickInRound: number | null;
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
    // Franchise id -> {name, slug, avatarUrl} for crest resolution.
    const franchiseRows = await db
      .select({
        id: franchises.id,
        name: franchises.name,
        slug: franchises.slug,
      })
      .from(franchises);
    const franchiseById = new Map<string, TimelineFranchiseRef>();
    for (const f of franchiseRows)
      franchiseById.set(f.id, { ...f, avatarUrl: null });

    // season id -> year.
    const seasonRows = await db
      .select({ id: seasons.id, seasonYear: seasons.seasonYear })
      .from(seasons);
    const yearBySeasonId = new Map(seasonRows.map((s) => [s.id, s.seasonYear]));

    // roster_id -> franchise id, per season (to resolve adds/drops), and the
    // latest-season team avatar per franchise for crest rendering.
    const fsRows = await db
      .select({
        seasonId: franchiseSeasons.seasonId,
        rosterId: franchiseSeasons.rosterId,
        franchiseId: franchiseSeasons.franchiseId,
        avatarUrl: franchiseSeasons.avatarUrl,
      })
      .from(franchiseSeasons);
    const avatarYearByFranchise = new Map<string, number>();
    for (const fs of fsRows) {
      if (!fs.avatarUrl) continue;
      const year = yearBySeasonId.get(fs.seasonId) ?? 0;
      const ref = franchiseById.get(fs.franchiseId);
      if (ref && year >= (avatarYearByFranchise.get(fs.franchiseId) ?? -1)) {
        ref.avatarUrl = fs.avatarUrl;
        avatarYearByFranchise.set(fs.franchiseId, year);
      }
    }
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
        draftId: draftPicks.draftId,
        draftType: draftPicks.draftType,
        round: draftPicks.round,
        pickNumber: draftPicks.pickNumber,
        franchiseId: draftPicks.franchiseId,
      })
      .from(draftPicks)
      .where(eq(draftPicks.playerId, playerId));

    // Picks-per-round for each distinct draft this player was picked in
    // (MAX(pick_number) WHERE round = 1), so the overall pick number can be
    // converted to "pick N of the round". One batched query, not N.
    const draftIds = [...new Set(draftRows.map((d) => d.draftId))];
    const picksPerRoundByDraftId = new Map<string, number>();
    if (draftIds.length > 0) {
      const perRoundRows = await db
        .select({
          draftId: draftPicks.draftId,
          maxPick: max(draftPicks.pickNumber),
        })
        .from(draftPicks)
        .where(and(inArray(draftPicks.draftId, draftIds), eq(draftPicks.round, 1)))
        .groupBy(draftPicks.draftId);
      for (const r of perRoundRows) {
        if (r.maxPick != null) picksPerRoundByDraftId.set(r.draftId, r.maxPick);
      }
    }

    for (const d of draftRows) {
      const year = yearBySeasonId.get(d.seasonId);
      if (year === undefined) continue;
      const perRound = picksPerRoundByDraftId.get(d.draftId);
      const draftPickInRound =
        perRound != null && perRound > 0
          ? d.pickNumber - (d.round - 1) * perRound
          : null;
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
        tradeFromFranchise: null,
        tradeToFranchise: null,
        draftType: d.draftType,
        draftRound: d.round,
        draftPickNumber: d.pickNumber,
        draftPickInRound,
        awardType: null,
        awardNote: null,
        stintEndSeasonYear: null,
      });
    }

    // --- Transaction events (traded, waiver add, drop) ---
    // A trade transaction touching this player produces ONE "traded" event
    // (not a separate trade_in + trade_out pair) — the add side and drop side
    // of the same transaction are the same deal, so they're merged here.
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
      const dropRoster = tx.drops?.[playerId];
      if (addRoster === undefined && dropRoster === undefined) continue;

      if (tx.type === "trade") {
        const toFranchiseId =
          addRoster !== undefined
            ? franchiseBySeasonRoster.get(`${tx.seasonId}:${addRoster}`)
            : undefined;
        const fromFranchiseId =
          dropRoster !== undefined
            ? franchiseBySeasonRoster.get(`${tx.seasonId}:${dropRoster}`)
            : undefined;
        const toFranchise = toFranchiseId
          ? franchiseById.get(toFranchiseId) ?? null
          : null;
        const fromFranchise = fromFranchiseId
          ? franchiseById.get(fromFranchiseId) ?? null
          : null;
        events.push({
          type: "traded",
          seasonYear: tx.seasonYear,
          week: tx.week ?? null,
          sleeperMs: tx.createdAtSleeper ?? null,
          franchise: toFranchise ?? fromFranchise,
          transactionId: tx.transactionId,
          tradeDbId: tx.id,
          tradeFromFranchise: fromFranchise,
          tradeToFranchise: toFranchise,
          draftType: null,
          draftRound: null,
          draftPickNumber: null,
          draftPickInRound: null,
          awardType: null,
          awardNote: null,
          stintEndSeasonYear: null,
        });
        continue;
      }

      if (addRoster !== undefined) {
        const franchiseId = franchiseBySeasonRoster.get(
          `${tx.seasonId}:${addRoster}`,
        );
        events.push({
          type: "waiver_add",
          seasonYear: tx.seasonYear,
          week: tx.week ?? null,
          sleeperMs: tx.createdAtSleeper ?? null,
          franchise: franchiseId
            ? franchiseById.get(franchiseId) ?? null
            : null,
          transactionId: tx.transactionId,
          tradeDbId: null,
          tradeFromFranchise: null,
          tradeToFranchise: null,
          draftType: null,
          draftRound: null,
          draftPickNumber: null,
          draftPickInRound: null,
          awardType: null,
          awardNote: null,
          stintEndSeasonYear: null,
        });
      }

      if (dropRoster !== undefined) {
        const franchiseId = franchiseBySeasonRoster.get(
          `${tx.seasonId}:${dropRoster}`,
        );
        events.push({
          type: "drop",
          seasonYear: tx.seasonYear,
          week: tx.week ?? null,
          sleeperMs: tx.createdAtSleeper ?? null,
          franchise: franchiseId
            ? franchiseById.get(franchiseId) ?? null
            : null,
          transactionId: tx.transactionId,
          tradeDbId: null,
          tradeFromFranchise: null,
          tradeToFranchise: null,
          draftType: null,
          draftRound: null,
          draftPickNumber: null,
          draftPickInRound: null,
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
          ? {
              id: a.franchise.id,
              name: a.franchise.name,
              slug: a.franchise.slug,
              avatarUrl:
                a.franchise.avatarUrl ??
                franchiseById.get(a.franchise.id)?.avatarUrl ??
                null,
            }
          : null,
        transactionId: null,
        tradeDbId: null,
        tradeFromFranchise: null,
        tradeToFranchise: null,
        draftType: null,
        draftRound: null,
        draftPickNumber: null,
        draftPickInRound: null,
        awardType: a.awardType,
        awardNote: a.note,
        stintEndSeasonYear: null,
      });
    }

    // --- Stint events: honest ownership stints (see lib/player-ownership-stints.ts) ---
    // Uses the same presence + stint-merging logic as the Ownership Ledger
    // (getPlayerFranchiseHistory) so the timeline and the ledger never
    // disagree: re-acquisitions produce separate stints, and a mid-season
    // trade splits the season between the two adjacent stints.
    const pwpPresenceRows = await db
      .select({
        franchiseId: playerWeekPoints.franchiseId,
        seasonId: playerWeekPoints.seasonId,
        week: playerWeekPoints.week,
      })
      .from(playerWeekPoints)
      .where(eq(playerWeekPoints.playerId, playerId));

    const rosterPresenceRows = await db
      .selectDistinct({
        franchiseId: rosterPlayers.franchiseId,
        seasonId: rosterPlayers.seasonId,
      })
      .from(rosterPlayers)
      .where(eq(rosterPlayers.playerId, playerId));

    const minWeekByKey = new Map<string, number>();
    for (const p of pwpPresenceRows) {
      const key = `${p.seasonId}:${p.franchiseId}`;
      const existing = minWeekByKey.get(key);
      if (existing === undefined || p.week < existing) {
        minWeekByKey.set(key, p.week);
      }
    }
    const stintPresence: OwnershipPresence[] = [];
    const stintSeenKeys = new Set<string>();
    for (const [key, week] of minWeekByKey) {
      const [seasonIdStr, franchiseId] = key.split(":");
      const year = yearBySeasonId.get(Number(seasonIdStr));
      if (year == null) continue;
      stintPresence.push({ franchiseId, seasonYear: year, minWeek: week });
      stintSeenKeys.add(key);
    }
    for (const r of rosterPresenceRows) {
      const key = `${r.seasonId}:${r.franchiseId}`;
      if (stintSeenKeys.has(key)) continue;
      const year = yearBySeasonId.get(r.seasonId);
      if (year == null) continue;
      stintPresence.push({ franchiseId: r.franchiseId, seasonYear: year, minWeek: null });
      stintSeenKeys.add(key);
    }

    for (const s of computeOwnershipStints(stintPresence)) {
      events.push({
        type: "stint",
        seasonYear: s.firstSeasonYear,
        week: null,
        sleeperMs: null,
        franchise: franchiseById.get(s.franchiseId) ?? null,
        transactionId: null,
        tradeDbId: null,
        tradeFromFranchise: null,
        tradeToFranchise: null,
        draftType: null,
        draftRound: null,
        draftPickNumber: null,
        draftPickInRound: null,
        awardType: null,
        awardNote: null,
        stintEndSeasonYear: s.lastSeasonYear,
      });
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
  /** False for weeks that haven't been played yet (projection-only rows). */
  played: boolean;
  ownerFranchiseName: string | null;
  ownerFranchiseSlug: string | null;
  ownerAvatarUrl: string | null;
  opponentFranchiseId: string | null;
  opponentFranchiseName: string | null;
  opponentFranchiseSlug: string | null;
  opponentAvatarUrl: string | null;
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

    // Resolve opponents from the authoritative matchups table by
    // (week, franchiseId). The matchup_id stored on player_week_points is NOT
    // trusted: preseason projection syncs have written stale pairings there
    // (observed for 2026), which produced wrong opponents.
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

    const franchiseByWeek = new Map<
      string,
      { matchupId: number; franchiseId: string; name: string; slug: string }
    >();
    const pairByKey = new Map<
      string,
      { franchiseId: string; name: string; slug: string }[]
    >();
    for (const m of matchupRows) {
      franchiseByWeek.set(`${m.week}|${m.franchiseId}`, {
        matchupId: m.matchupId,
        franchiseId: m.franchiseId,
        name: m.franchiseName,
        slug: m.franchiseSlug,
      });
      const key = `${m.week}|${m.matchupId}`;
      const list = pairByKey.get(key) ?? [];
      list.push({
        franchiseId: m.franchiseId,
        name: m.franchiseName,
        slug: m.franchiseSlug,
      });
      pairByKey.set(key, list);
    }

    // Per-season franchise avatars + owner identity for logo rendering.
    const seasonFranchises = await db
      .select({
        franchiseId: franchiseSeasons.franchiseId,
        avatarUrl: franchiseSeasons.avatarUrl,
        name: franchises.name,
        slug: franchises.slug,
      })
      .from(franchiseSeasons)
      .innerJoin(franchises, eq(franchiseSeasons.franchiseId, franchises.id))
      .where(eq(franchiseSeasons.seasonId, season.id));
    const seasonFranchiseById = new Map(
      seasonFranchises.map((f) => [f.franchiseId, f]),
    );

    // Weeks actually played league-wide this season (any real points scored).
    // Projection-only future weeks are marked played=false so the UI can
    // blank actual/delta instead of showing a fake negative delta.
    const playedRows = await db
      .selectDistinct({ week: playerWeekPoints.week })
      .from(playerWeekPoints)
      .where(
        and(eq(playerWeekPoints.seasonId, season.id), gt(playerWeekPoints.points, 0)),
      );
    const playedWeeks = new Set(playedRows.map((r) => r.week));

    return rows
      .map((r) => {
        const own = franchiseByWeek.get(`${r.week}|${r.franchiseId}`);
        let opp: { franchiseId: string; name: string; slug: string } | null = null;
        if (own) {
          const pair = pairByKey.get(`${r.week}|${own.matchupId}`) ?? [];
          opp = pair.find((p) => p.franchiseId !== r.franchiseId) ?? null;
        }
        const ownerSeason = seasonFranchiseById.get(r.franchiseId);
        return {
          week: r.week,
          points: r.points,
          projectedPoints: r.projectedPoints,
          slot: r.slot,
          started: r.started,
          franchiseId: r.franchiseId,
          matchupId: own?.matchupId ?? r.matchupId,
          played: playedWeeks.has(r.week),
          ownerFranchiseName: ownerSeason?.name ?? null,
          ownerFranchiseSlug: ownerSeason?.slug ?? null,
          ownerAvatarUrl: ownerSeason?.avatarUrl ?? null,
          opponentFranchiseId: opp?.franchiseId ?? null,
          opponentFranchiseName: opp?.name ?? null,
          opponentFranchiseSlug: opp?.slug ?? null,
          opponentAvatarUrl: opp
            ? (seasonFranchiseById.get(opp.franchiseId)?.avatarUrl ?? null)
            : null,
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
  /** Sum of points scored while in a starting slot AND actually played. */
  startedPoints: number;
  /** Raw count of started weeks, including byes/DNPs — for "weeks in the lineup" facts. */
  startedWeeks: number;
  /** Started weeks that actually classify as PLAYED (excludes BYE/DNP). */
  startedPlayedWeeks: number;
  benchedWeeks: number;
  /** Sum of points scored while benched (points left on the bench). */
  benchPoints: number;
  /** startedPoints / startedPlayedWeeks, null when never started-and-played. */
  avgWhenStarted: number | null;
  /** Highest-scoring STARTED-AND-PLAYED week of the season; null when never started-and-played. */
  bestWeek: WeekRef | null;
  /** Lowest-scoring STARTED-AND-PLAYED week of the season; null when never started-and-played. */
  worstStartedWeek: WeekRef | null;
}

/**
 * Per-season point aggregates for a player, most recent season first. Best /
 * worst weeks and avgWhenStarted are computed over started weeks that
 * actually classify as PLAYED (a bye-week or DNP zero isn't a performance —
 * neither is a big bench game the manager never captured). Bench points are
 * the points that scored while the player sat. Returns [] on error / no data.
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

    // Weekly NFL stats + the player's current team's bye schedule, so started
    // weeks can be honestly classified PLAYED / BYE / DNP instead of trusting
    // "started" + "points" alone (a bye or a DNP is not a performance).
    const [player] = await db
      .select({ nflTeam: players.nflTeam })
      .from(players)
      .where(eq(players.id, playerId));

    const statRows = await db
      .select({
        seasonId: playerWeekStats.seasonId,
        week: playerWeekStats.week,
        gamesPlayed: playerWeekStats.gamesPlayed,
        stats: playerWeekStats.stats,
      })
      .from(playerWeekStats)
      .where(eq(playerWeekStats.playerId, playerId));
    const statByKey = new Map(
      statRows.map((s) => [`${s.seasonId}|${s.week}`, s]),
    );

    const seasonYears = [
      ...new Set(rows.map((r) => yearBySeasonId.get(r.seasonId)).filter((y): y is number => y != null)),
    ];
    const { teamByeWeeks, completeWeeks } = await getSeasonScheduleFacts(seasonYears);

    interface Acc {
      seasonYear: number;
      totalPoints: number;
      startedPoints: number;
      startedWeeks: number;
      startedPlayedWeeks: number;
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
          startedPlayedWeeks: 0,
          benchedWeeks: 0,
          benchPoints: 0,
          bestWeek: null,
          worstStartedWeek: null,
        } satisfies Acc);

      const pts = r.points ?? 0;
      acc.totalPoints += pts;
      if (r.started) {
        acc.startedWeeks += 1;

        const stat = statByKey.get(`${r.seasonId}|${r.week}`);
        const teamBye = player?.nflTeam
          ? teamByeWeeks.get(`${seasonYear}:${normalizeNflTeam(player.nflTeam)}`)
          : undefined;
        const availability = classifyPlayerWeekAvailability({
          week: r.week,
          gamesPlayed: stat?.gamesPlayed ?? null,
          gmsActive: (stat?.stats as Record<string, number | null> | null)?.gms_active ?? null,
          points: pts,
          curatedStats: CURATED_STAT_KEYS.map((k) =>
            stat ? ((stat as unknown as Record<string, number | null>)[k] ?? null) : null,
          ),
          teamByeWeek: teamBye ?? null,
          weekIsComplete: completeWeeks.has(seasonWeekKey(seasonYear, r.week)),
        });
        // Only an explicit PLAYED classification counts. `null` means the
        // week hasn't happened yet (or isn't resolvable) — treating it as
        // "played" let unplayed future weeks (0 points, started=true because
        // lineups lock before kickoff) win "worst started week" outright
        // (#166). BYE/DNP are excluded as before.
        const playedForPurposesOfBestWorst = availability === "PLAYED";

        if (playedForPurposesOfBestWorst) {
          acc.startedPoints += pts;
          acc.startedPlayedWeeks += 1;
          const ref: WeekRef = { week: r.week, seasonYear, points: pts };
          if (!acc.bestWeek || pts > acc.bestWeek.points) acc.bestWeek = ref;
          if (!acc.worstStartedWeek || pts < acc.worstStartedWeek.points)
            acc.worstStartedWeek = ref;
        }
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
        startedPlayedWeeks: a.startedPlayedWeeks,
        benchedWeeks: a.benchedWeeks,
        benchPoints: a.benchPoints,
        avgWhenStarted:
          a.startedPlayedWeeks > 0 ? a.startedPoints / a.startedPlayedWeeks : null,
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

export const CURATED_STAT_KEYS = [
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

// ---------------------------------------------------------------------------
// Franchise history (Ownership Ledger)
// ---------------------------------------------------------------------------

export interface FranchiseStint {
  franchiseId: string;
  name: string;
  slug: string;
  /** Latest-season team avatar for this franchise (Sleeper branding). */
  avatarUrl: string | null;
  firstSeasonYear: number;
  lastSeasonYear: number;
}

/**
 * Every franchise stint the player has ever had, chronological (oldest
 * first). A stint is a contiguous run of presence with one franchise —
 * re-acquisitions after a gap (or after a trade away and back) produce
 * SEPARATE stints, so a franchise can appear more than once in the returned
 * array. Presence is the union of player_week_points (lineup history, with
 * week granularity so a mid-season trade splits the season correctly between
 * the two stints) and roster_players (covers taxi/IR players who never hit a
 * lineup; contributes week=null presence).
 */
export async function getPlayerFranchiseHistory(
  playerId: string,
): Promise<FranchiseStint[]> {
  try {
    const [pwpRows, rosterRows] = await Promise.all([
      db
        .select({
          franchiseId: playerWeekPoints.franchiseId,
          seasonId: playerWeekPoints.seasonId,
          week: playerWeekPoints.week,
        })
        .from(playerWeekPoints)
        .where(eq(playerWeekPoints.playerId, playerId)),
      db
        .selectDistinct({
          franchiseId: rosterPlayers.franchiseId,
          seasonId: rosterPlayers.seasonId,
        })
        .from(rosterPlayers)
        .where(eq(rosterPlayers.playerId, playerId)),
    ]);

    if (pwpRows.length === 0 && rosterRows.length === 0) return [];

    const seasonRows = await db
      .select({ id: seasons.id, seasonYear: seasons.seasonYear })
      .from(seasons);
    const yearBySeasonId = new Map(seasonRows.map((s) => [s.id, s.seasonYear]));

    // Presence rows: min week per (franchise, season) from player_week_points,
    // plus roster-only presence (week unknown) from roster_players.
    const minWeekByKey = new Map<string, number>();
    for (const p of pwpRows) {
      const key = `${p.seasonId}:${p.franchiseId}`;
      const existing = minWeekByKey.get(key);
      if (existing === undefined || p.week < existing) {
        minWeekByKey.set(key, p.week);
      }
    }
    const presence: OwnershipPresence[] = [];
    const seenKeys = new Set<string>();
    for (const [key, week] of minWeekByKey) {
      const [seasonIdStr, franchiseId] = key.split(":");
      const year = yearBySeasonId.get(Number(seasonIdStr));
      if (year == null) continue;
      presence.push({ franchiseId, seasonYear: year, minWeek: week });
      seenKeys.add(key);
    }
    for (const r of rosterRows) {
      const key = `${r.seasonId}:${r.franchiseId}`;
      if (seenKeys.has(key)) continue; // already have a real week from lineups
      const year = yearBySeasonId.get(r.seasonId);
      if (year == null) continue;
      presence.push({ franchiseId: r.franchiseId, seasonYear: year, minWeek: null });
      seenKeys.add(key);
    }

    if (presence.length === 0) return [];

    const franchiseIds = [...new Set(presence.map((p) => p.franchiseId))];
    const franchiseRows = await db
      .select({ id: franchises.id, name: franchises.name, slug: franchises.slug })
      .from(franchises)
      .where(inArray(franchises.id, franchiseIds));
    const franchiseById = new Map(franchiseRows.map((f) => [f.id, f]));

    const avatarRows = await db
      .select({
        franchiseId: franchiseSeasons.franchiseId,
        seasonId: franchiseSeasons.seasonId,
        avatarUrl: franchiseSeasons.avatarUrl,
      })
      .from(franchiseSeasons)
      .where(inArray(franchiseSeasons.franchiseId, franchiseIds));

    // Latest-season avatar per franchise.
    const avatarByFranchise = new Map<string, { year: number; url: string }>();
    for (const a of avatarRows) {
      if (!a.avatarUrl) continue;
      const year = yearBySeasonId.get(a.seasonId);
      if (year == null) continue;
      const prev = avatarByFranchise.get(a.franchiseId);
      if (!prev || year > prev.year) {
        avatarByFranchise.set(a.franchiseId, { year, url: a.avatarUrl });
      }
    }

    const stints = computeOwnershipStints(presence);

    return stints
      .map((s) => {
        const franchise = franchiseById.get(s.franchiseId);
        if (!franchise) return null;
        return {
          franchiseId: s.franchiseId,
          name: franchise.name,
          slug: franchise.slug,
          avatarUrl: avatarByFranchise.get(s.franchiseId)?.url ?? null,
          firstSeasonYear: s.firstSeasonYear,
          lastSeasonYear: s.lastSeasonYear,
        } satisfies FranchiseStint;
      })
      .filter((s): s is FranchiseStint => s !== null);
  } catch (error) {
    console.error("[player-profile] getPlayerFranchiseHistory error:", error);
    return [];
  }
}

export interface PlayerProfile {
  identity: PlayerProfileIdentity;
  timeline: TimelineEvent[];
  awards: AwardEntry[];
  valueSeries: ValueSeriesPoint[];
  seasonStatTotals: PlayerSeasonStatTotals[];
  seasonPointsAggregates: PlayerSeasonPointsAggregate[];
  ownershipFacts: PlayerOwnershipFacts;
  franchiseHistory: FranchiseStint[];
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
    franchiseHistory,
  ] = await Promise.all([
    getPlayerTimeline(playerId),
    getPlayerAwards(playerId),
    getPlayerValueSeries(playerId),
    getPlayerSeasonStatTotals(playerId),
    getPlayerSeasonPointsAggregates(playerId),
    getPlayerFranchiseHistory(playerId),
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
    franchiseHistory,
  };
}
