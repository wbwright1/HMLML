import { db } from "@/lib/db";
import {
  draftPicks,
  players,
  playerWeekPoints,
  seasons,
  transactions,
} from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
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

/** Startup-draft picks only (excludes rookie drafts), with the season year. */
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
      .where(eq(draftPicks.draftType, "startup"));

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
    getWaiverAddedPlayerSeasons(),
    getBiggestSeasons(15),
    getMostTradedPlayers(1),
    getMostChurnedPlayers(1),
    getLeagueCornerstone(),
    getAllFranchises(),
  ]);

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

  interface BustCandidate extends StartupPickRow {
    careerPts: number;
  }
  const bustPrefilter: BustCandidate[] = startupPicks
    .filter((p) => p.round === 1 && p.franchiseId != null)
    .map((p) => ({ ...p, careerPts: careerByPlayerId.get(p.playerId)?.careerPts ?? 0 }));

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
        ...bustPrefilter.map((p) => p.playerId),
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

  interface ScopedBustCandidate extends BustCandidate {
    scopedPts: number;
  }
  // The Bust: lowest points scored for the franchise that spent a first-
  // rounder on him, even if he balled out for someone else later. A true
  // zero (the pick never played for that team) is the most bust of all, so
  // no eligibility floor here.
  const bustCandidates: ScopedBustCandidate[] = bustPrefilter
    .map((p) => ({ ...p, scopedPts: scopedFranchisePoints(weeksFor(p.playerId), p.franchiseId!) }))
    .sort((a, b) => a.scopedPts - b.scopedPts);

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
    bustPiece = {
      key: label.key,
      title: label.displayText,
      tone: label.tone,
      iconKey: label.displayText,
      playerId: bustWinner.playerId,
      playerName: info?.playerName ?? "Unknown Player",
      position: info?.position ?? null,
      statValue: `${pts.toLocaleString()} pts`,
      story:
        `First round, pick ${bustWinner.pickNumber} of the ${bustWinner.seasonYear} startup` +
        `${crest ? ` by ${crest.name}` : ""}. ${pts.toLocaleString()} points in their colors. Woof.`,
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
