import { db } from "@/lib/db";
import {
  draftPicks,
  franchiseSeasons,
  playerWeekPoints,
  players,
  rosterPlayers,
  seasons,
  transactions,
} from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export interface CornerstonePlayer {
  playerId: string;
  playerName: string;
  position: string | null;
  via: "draft" | "trade";
  acquiredYear: number;
  tenureSeasons: number;
  franchisePoints: number; // completed seasons only
  franchiseStarts: number; // completed seasons only
  blockbuster: boolean | null; // null when the acquiring trade's adds are null / via is draft
}

// ---------------------------------------------------------------------------
// Pure types + helpers (unit-tested)
// ---------------------------------------------------------------------------

/**
 * A single draft-or-trade acquisition event for a (franchise, player) pair,
 * or a drop event used to test continuity. Draft events sort as the earliest
 * possible event within their season (week -1, sleeperMs -Infinity) since a
 * startup/rookie draft always precedes every in-season transaction.
 */
export interface RosterEvent {
  type: "draft" | "trade" | "drop";
  seasonYear: number;
  week: number;
  sleeperMs: number;
  /** Only set for type 'trade': the raw adds map of the transaction that moved this player. */
  tradeAdds?: Record<string, number> | null;
  /** Only set for type 'trade': how many draft picks changed hands in the same transaction. */
  tradePicksInvolved?: number;
}

export function eventOrderKey(e: RosterEvent): [number, number, number] {
  return [e.seasonYear, e.week, e.sleeperMs];
}

export function compareEventKeys(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** Latest (draft|trade) acquisition event by season/week/timestamp ordering. */
export function pickLatestAcquisition(events: RosterEvent[]): RosterEvent | null {
  if (events.length === 0) return null;
  return events.reduce((latest, e) =>
    compareEventKeys(eventOrderKey(e), eventOrderKey(latest)) > 0 ? e : latest
  );
}

/**
 * The start year of the current unbroken presence run: walk back from
 * currentYear while (year - 1) is also a presence year. Presence-based, not
 * event-based, so it survives a startup RE-DRAFT (a player drafted in both
 * 2021 and 2023 with continuous rostering in between reads as acquired 2021,
 * not 2023).
 */
export function computeTenureAnchor(presenceYears: Set<number>, currentYear: number): number {
  let anchor = currentYear;
  while (presenceYears.has(anchor - 1)) {
    anchor -= 1;
  }
  return anchor;
}

/**
 * How the anchor-year acquisition happened: 'draft' if the franchise drafted
 * the player that year, else 'trade' if a trade moved the player to the
 * franchise that year, else 'draft' as the fallback for the 2021 base year
 * (continuous presence from the league's first tracked season, with no
 * logged acquisition event to point to).
 */
export function resolveVia(
  anchorYear: number,
  draftYears: Set<number>,
  tradeYears: Set<number>
): "draft" | "trade" {
  if (draftYears.has(anchorYear)) return "draft";
  if (tradeYears.has(anchorYear)) return "trade";
  return "draft";
}

/**
 * A player fails continuous tenure when the franchise dropped them at any
 * point strictly after their latest draft/trade acquisition. A drop means
 * whatever the franchise currently rosters was re-acquired off waivers, which
 * disqualifies it as a "cornerstone" (drafted/traded-for and never let go).
 */
export function isDisqualifiedByLaterDrop(
  latestAcquisition: RosterEvent,
  drops: RosterEvent[]
): boolean {
  const acqKey = eventOrderKey(latestAcquisition);
  return drops.some((d) => compareEventKeys(eventOrderKey(d), acqKey) > 0);
}

/**
 * Blockbuster heuristic for a trade acquisition: null when the transaction's
 * adds map is null (can't inspect who else moved), null when via is 'draft'
 * (not applicable), otherwise true when the trade moved 3+ players or 2+
 * draft picks (a multi-asset trade), false for a simple 1-for-1/2 swap.
 */
export function computeBlockbuster(event: RosterEvent): boolean | null {
  if (event.type !== "trade") return null;
  if (!event.tradeAdds) return null;
  const totalPlayers = Object.keys(event.tradeAdds).length;
  const totalPicks = event.tradePicksInvolved ?? 0;
  return totalPlayers >= 3 || totalPicks >= 2;
}

export interface EligibilityResult {
  via: "draft" | "trade";
  acquiredYear: number;
  tenureSeasons: number;
  blockbuster: boolean | null;
}

/**
 * Full eligibility + provenance decision for one (franchise, player) pair,
 * given its presence years, acquisition events, and drop events. Returns
 * null when the pair is ineligible. Pure and unit-tested; the query's
 * eligibility loop delegates here.
 *
 * RULE (2023 startup re-draft continuity): tenure and drop-disqualification
 * anchor to the START of the current unbroken presence run, not the latest
 * acquisition event. Re-drafting a player the franchise already held (the
 * 2023 startup RE-DRAFT) must not reset or shorten tenure. This deliberately
 * widens the drop-disqualification window to the FULL stint: a drop anywhere
 * after the anchor year disqualifies, even if a later re-acquisition event
 * exists. Both directions of the resulting eligibility change vs. the old
 * latest-event logic are intended and pinned by unit tests.
 */
export function evaluateEligibility(
  presenceYears: Set<number>,
  events: RosterEvent[],
  drops: RosterEvent[],
  currentYear: number
): EligibilityResult | null {
  if (events.length === 0) return null; // waiver/FA only, not eligible

  const acquiredYear = computeTenureAnchor(presenceYears, currentYear);
  const tenureSeasons = currentYear - acquiredYear + 1;
  if (tenureSeasons < 2) return null; // must be acquired before the current season

  const draftYears = new Set(events.filter((e) => e.type === "draft").map((e) => e.seasonYear));
  const tradeYears = new Set(events.filter((e) => e.type === "trade").map((e) => e.seasonYear));
  const via = resolveVia(acquiredYear, draftYears, tradeYears);

  // The anchor-year event, used for the drop-continuity check and the
  // blockbuster heuristic. Falls back to a synthetic placeholder when via
  // resolved to 'draft' with no logged draft row for that year (the 2021
  // base-year case).
  let anchorEvent: RosterEvent;
  if (via === "trade") {
    const tradeEventsAtAnchor = events.filter(
      (e) => e.type === "trade" && e.seasonYear === acquiredYear
    );
    anchorEvent = pickLatestAcquisition(tradeEventsAtAnchor) ?? {
      type: "trade",
      seasonYear: acquiredYear,
      week: -1,
      sleeperMs: -Infinity,
    };
  } else {
    const draftEventAtAnchor = events.find(
      (e) => e.type === "draft" && e.seasonYear === acquiredYear
    );
    anchorEvent = draftEventAtAnchor ?? {
      type: "draft",
      seasonYear: acquiredYear,
      week: -1,
      sleeperMs: -Infinity,
    };
  }

  if (isDisqualifiedByLaterDrop(anchorEvent, drops)) return null;

  return {
    via,
    acquiredYear,
    tenureSeasons,
    blockbuster: computeBlockbuster(anchorEvent),
  };
}

export interface ScoredCandidate {
  playerId: string;
  playerName: string;
  position: string | null;
  via: "draft" | "trade";
  acquiredYear: number;
  tenureSeasons: number;
  franchisePoints: number;
  franchiseStarts: number;
  blockbuster: boolean | null;
}

/**
 * Selects 1-2 cornerstones from a franchise's eligible, already-scored
 * candidates: the top scorer, plus a runner-up when its franchisePoints is
 * at least 90% of the leader's (co-cornerstones). Ties broken by starts,
 * then earlier acquiredYear, then name. Pure and unit-tested.
 */
export function selectCornerstones(candidates: ScoredCandidate[]): CornerstonePlayer[] {
  if (candidates.length === 0) return [];

  const sorted = [...candidates].sort((a, b) => {
    if (b.franchisePoints !== a.franchisePoints) return b.franchisePoints - a.franchisePoints;
    if (b.franchiseStarts !== a.franchiseStarts) return b.franchiseStarts - a.franchiseStarts;
    if (a.acquiredYear !== b.acquiredYear) return a.acquiredYear - b.acquiredYear;
    return a.playerName.localeCompare(b.playerName);
  });

  const leader = sorted[0];
  const result: CornerstonePlayer[] = [leader];

  const runnerUp = sorted[1];
  if (
    runnerUp &&
    leader.franchisePoints > 0 &&
    runnerUp.franchisePoints >= leader.franchisePoints * 0.9
  ) {
    result.push(runnerUp);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

interface TransactionRow {
  seasonId: number;
  seasonYear: number;
  week: number | null;
  type: string;
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  draftPicksInvolved: unknown[] | null;
  createdAtSleeper: number | null;
}

/**
 * Builds franchise cornerstones for every current franchise: 1-2 players per
 * franchise whose latest draft or trade acquisition has never been followed
 * by a drop of that player by that franchise (continuous tenure), acquired
 * before the current season, scored by total points while on that franchise
 * across completed seasons.
 */
export async function getFranchiseCornerstones(): Promise<Map<string, CornerstonePlayer[]>> {
  try {
    const allSeasons = await db
      .select({
        id: seasons.id,
        seasonYear: seasons.seasonYear,
        status: seasons.status,
      })
      .from(seasons);

    if (allSeasons.length === 0) return new Map();

    const currentSeason = allSeasons.reduce((latest, s) =>
      s.seasonYear > latest.seasonYear ? s : latest
    );
    const completedSeasonIds = allSeasons
      .filter((s) => s.status === "complete")
      .map((s) => s.id);

    const seasonYearById = new Map(allSeasons.map((s) => [s.id, s.seasonYear]));

    // Current roster: (franchiseId, playerId) pairs on the latest season.
    const rosterRows = await db
      .select({
        franchiseId: rosterPlayers.franchiseId,
        playerId: rosterPlayers.playerId,
      })
      .from(rosterPlayers)
      .where(eq(rosterPlayers.seasonId, currentSeason.id));

    if (rosterRows.length === 0) return new Map();

    const rosterPairs = new Map<string, Set<string>>(); // franchiseId -> playerIds
    for (const r of rosterRows) {
      if (!rosterPairs.has(r.franchiseId)) rosterPairs.set(r.franchiseId, new Set());
      rosterPairs.get(r.franchiseId)!.add(r.playerId);
    }
    const relevantPlayerIds = new Set(rosterRows.map((r) => r.playerId));

    // Draft acquisitions for those players.
    const draftRows = await db
      .select({
        franchiseId: draftPicks.franchiseId,
        playerId: draftPicks.playerId,
        seasonId: draftPicks.seasonId,
      })
      .from(draftPicks)
      .where(
        and(
          inArray(draftPicks.playerId, Array.from(relevantPlayerIds)),
        )
      );

    // All trade transactions (need adds/drops to resolve trade + drop events
    // for these players across any franchise).
    const txRows = await db
      .select({
        seasonId: transactions.seasonId,
        seasonYear: seasons.seasonYear,
        week: transactions.week,
        type: transactions.type,
        adds: transactions.adds,
        drops: transactions.drops,
        draftPicksInvolved: transactions.draftPicksInvolved,
        createdAtSleeper: transactions.createdAtSleeper,
      })
      .from(transactions)
      .innerJoin(seasons, eq(transactions.seasonId, seasons.id));

    const transactionRows = txRows as unknown as TransactionRow[];

    // roster_id -> franchiseId per season, needed to resolve adds/drops.
    const fsRows = await db
      .select({
        seasonId: franchiseSeasons.seasonId,
        rosterId: franchiseSeasons.rosterId,
        franchiseId: franchiseSeasons.franchiseId,
      })
      .from(franchiseSeasons);
    const franchiseBySeasonRoster = new Map<string, string>();
    for (const fs of fsRows) {
      franchiseBySeasonRoster.set(`${fs.seasonId}:${fs.rosterId}`, fs.franchiseId);
    }

    // Presence: distinct (franchise, player, season) rows from player_week_points,
    // across ALL seasons (including bench rows) for the players on current
    // rosters. This is the source of truth for continuous tenure, not
    // draft/trade events, so a startup RE-DRAFT (a player drafted in both
    // 2021 and 2023, continuously rostered in between) doesn't reset tenure.
    const presenceRows = await db
      .selectDistinct({
        franchiseId: playerWeekPoints.franchiseId,
        playerId: playerWeekPoints.playerId,
        seasonId: playerWeekPoints.seasonId,
      })
      .from(playerWeekPoints)
      .where(inArray(playerWeekPoints.playerId, Array.from(relevantPlayerIds)));

    function key(franchiseId: string, playerId: string) {
      return `${franchiseId}:${playerId}`;
    }

    const presenceByKey = new Map<string, Set<number>>();
    for (const p of presenceRows) {
      const seasonYear = seasonYearById.get(p.seasonId);
      if (seasonYear === undefined) continue;
      const k = key(p.franchiseId, p.playerId);
      if (!presenceByKey.has(k)) presenceByKey.set(k, new Set());
      presenceByKey.get(k)!.add(seasonYear);
    }
    // Union in the current season for players on the current roster: the
    // current season may still be in_season with no completed points rows.
    for (const [franchiseId, playerIds] of rosterPairs) {
      for (const playerId of playerIds) {
        const k = key(franchiseId, playerId);
        if (!presenceByKey.has(k)) presenceByKey.set(k, new Set());
        presenceByKey.get(k)!.add(currentSeason.seasonYear);
      }
    }

    // Build per-(franchise,player) event lists.
    const eventsByKey = new Map<string, RosterEvent[]>();
    const dropsByKey = new Map<string, RosterEvent[]>();

    for (const dp of draftRows) {
      if (!dp.franchiseId || !dp.playerId) continue;
      const seasonYear = seasonYearById.get(dp.seasonId);
      if (seasonYear === undefined) continue;
      const k = key(dp.franchiseId, dp.playerId);
      if (!eventsByKey.has(k)) eventsByKey.set(k, []);
      eventsByKey.get(k)!.push({
        type: "draft",
        seasonYear,
        week: -1,
        sleeperMs: -Infinity,
      });
    }

    for (const tx of transactionRows) {
      const week = tx.week ?? 0;
      const sleeperMs = tx.createdAtSleeper ?? 0;
      const picksInvolved = Array.isArray(tx.draftPicksInvolved)
        ? tx.draftPicksInvolved.length
        : 0;

      if (tx.type === "trade" && tx.adds) {
        for (const [playerId, receivingRosterId] of Object.entries(tx.adds)) {
          if (!relevantPlayerIds.has(playerId)) continue;
          const franchiseId = franchiseBySeasonRoster.get(
            `${tx.seasonId}:${receivingRosterId}`
          );
          if (!franchiseId) continue;
          const k = key(franchiseId, playerId);
          if (!eventsByKey.has(k)) eventsByKey.set(k, []);
          eventsByKey.get(k)!.push({
            type: "trade",
            seasonYear: tx.seasonYear,
            week,
            sleeperMs,
            tradeAdds: tx.adds,
            tradePicksInvolved: picksInvolved,
          });
        }
      }

      if (tx.drops) {
        for (const [playerId, droppingRosterId] of Object.entries(tx.drops)) {
          if (!relevantPlayerIds.has(playerId)) continue;
          const franchiseId = franchiseBySeasonRoster.get(
            `${tx.seasonId}:${droppingRosterId}`
          );
          if (!franchiseId) continue;
          const k = key(franchiseId, playerId);
          if (!dropsByKey.has(k)) dropsByKey.set(k, []);
          dropsByKey.get(k)!.push({
            type: "drop",
            seasonYear: tx.seasonYear,
            week,
            sleeperMs,
          });
        }
      }
    }

    // Determine eligible candidates. RULE: tenure and drop-disqualification
    // anchor to the start of the continuous presence run, NOT the latest
    // acquisition event, per the 2023 startup re-draft continuity rule
    // (re-drafting a player the franchise already held must not reset or
    // shorten tenure). This deliberately widens the drop-disqualification
    // window to the full stint. Both eligibility gates therefore take
    // presence-derived inputs; the eligible SET can differ from the old
    // latest-event logic in both directions, and that change is intended
    // (semantics pinned by evaluateEligibility unit tests).
    interface EligiblePlayer {
      franchiseId: string;
      playerId: string;
      via: "draft" | "trade";
      acquiredYear: number;
      tenureSeasons: number;
      blockbuster: boolean | null;
    }
    const eligible: EligiblePlayer[] = [];

    for (const [franchiseId, playerIds] of rosterPairs) {
      for (const playerId of playerIds) {
        const k = key(franchiseId, playerId);
        const presenceYears = presenceByKey.get(k) ?? new Set<number>([currentSeason.seasonYear]);
        const events = eventsByKey.get(k) ?? [];
        const drops = dropsByKey.get(k) ?? [];

        const result = evaluateEligibility(
          presenceYears,
          events,
          drops,
          currentSeason.seasonYear
        );
        if (!result) continue;

        eligible.push({ franchiseId, playerId, ...result });
      }
    }

    if (eligible.length === 0) return new Map();

    // Score: sum points / count starts across completed seasons, restricted
    // to weeks attributed to that franchise. This is coupled to seasons.status
    // flipping to 'complete' only once every week of that season has real
    // scoring: if a season were ever marked complete while it still had
    // synced default-lineup rows (started=true, points=0 — the same shape the
    // in-progress 2026 season currently has), those weeks would count as
    // "starts" with zero point contribution, quietly inflating franchiseStarts
    // relative to franchisePoints. Not filtered out here because a genuine
    // start can legitimately score exactly 0 (bye-adjacent roster spot, a
    // shutout kicker, etc.), and distinguishing "real zero" from "synced
    // placeholder zero" would need a played/unplayed signal this table
    // doesn't carry; the sync pipeline's season-status transition is what
    // actually guards against this in practice.

    const eligiblePlayerIds = Array.from(new Set(eligible.map((e) => e.playerId)));
    const pointRows =
      completedSeasonIds.length > 0 && eligiblePlayerIds.length > 0
        ? await db
            .select({
              franchiseId: playerWeekPoints.franchiseId,
              playerId: playerWeekPoints.playerId,
              points: playerWeekPoints.points,
              started: playerWeekPoints.started,
            })
            .from(playerWeekPoints)
            .where(
              and(
                inArray(playerWeekPoints.seasonId, completedSeasonIds),
                inArray(playerWeekPoints.playerId, eligiblePlayerIds)
              )
            )
        : [];

    const scoreByKey = new Map<string, { points: number; starts: number }>();
    for (const row of pointRows) {
      const k = key(row.franchiseId, row.playerId);
      const bucket = scoreByKey.get(k) ?? { points: 0, starts: 0 };
      bucket.points += row.points ?? 0;
      if (row.started) bucket.starts += 1;
      scoreByKey.set(k, bucket);
    }

    // Player names/positions.
    const playerRows = await db
      .select({
        id: players.id,
        fullName: players.fullName,
        position: players.position,
      })
      .from(players)
      .where(inArray(players.id, eligiblePlayerIds));
    const playerInfo = new Map(
      playerRows.map((p) => [p.id, { name: p.fullName ?? "Unknown Player", position: p.position }])
    );

    // Group by franchise, score, select cornerstones.
    const byFranchise = new Map<string, ScoredCandidate[]>();
    for (const e of eligible) {
      const score = scoreByKey.get(key(e.franchiseId, e.playerId)) ?? { points: 0, starts: 0 };
      const info = playerInfo.get(e.playerId) ?? { name: "Unknown Player", position: null };
      if (!byFranchise.has(e.franchiseId)) byFranchise.set(e.franchiseId, []);
      byFranchise.get(e.franchiseId)!.push({
        playerId: e.playerId,
        playerName: info.name,
        position: info.position,
        via: e.via,
        acquiredYear: e.acquiredYear,
        tenureSeasons: e.tenureSeasons,
        franchisePoints: score.points,
        franchiseStarts: score.starts,
        blockbuster: e.blockbuster,
      });
    }

    const result = new Map<string, CornerstonePlayer[]>();
    for (const [franchiseId, candidates] of byFranchise) {
      result.set(franchiseId, selectCornerstones(candidates));
    }

    return result;
  } catch (error) {
    console.error("[franchise-players] getFranchiseCornerstones error:", error);
    return new Map();
  }
}

export async function getFranchiseCornerstone(
  franchiseId: string
): Promise<CornerstonePlayer[]> {
  const all = await getFranchiseCornerstones();
  return all.get(franchiseId) ?? [];
}

export async function getLeagueCornerstone(): Promise<
  (CornerstonePlayer & { franchiseId: string }) | null
> {
  const all = await getFranchiseCornerstones();
  let best: (CornerstonePlayer & { franchiseId: string }) | null = null;
  for (const [franchiseId, entries] of all) {
    const top = entries[0];
    if (!top) continue;
    if (!best || top.franchisePoints > best.franchisePoints) {
      best = { ...top, franchiseId };
    }
  }
  return best;
}
