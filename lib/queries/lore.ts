import { db } from "@/lib/db";
import {
  draftPicks,
  players,
  playerWeekPoints,
  seasons,
  transactions,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
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
  href?: string;
}

const POSITION_WORDS: Readonly<Record<string, string>> = Object.freeze({
  QB: "quarterback",
  RB: "running back",
  WR: "receiver",
  TE: "tight end",
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
      }));
  } catch (error) {
    console.error("[lore] getStartupDraftPicks error:", error);
    return [];
  }
}

/** Distinct player ids added at least once via a waiver/free-agent transaction. */
export async function getWaiverAddedPlayerIds(): Promise<Set<string>> {
  try {
    const rows = await db
      .select({ adds: transactions.adds })
      .from(transactions)
      .where(sql`${transactions.type} IN ('waiver', 'free_agent')`);

    const ids = new Set<string>();
    for (const row of rows) {
      const adds = row.adds as Record<string, number> | null;
      if (!adds) continue;
      for (const playerId of Object.keys(adds)) ids.add(playerId);
    }
    return ids;
  } catch (error) {
    console.error("[lore] getWaiverAddedPlayerIds error:", error);
    return new Set();
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
    waiverAddedIds,
    biggestSeasons,
    tradedTop,
    churnedTop,
    cornerstone,
    franchisesList,
  ] = await Promise.all([
    getSingleGameThrones(),
    getCareerPointsAggregate(),
    getStartupDraftPicks(),
    getWaiverAddedPlayerIds(),
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
    const positionWord = POSITION_WORDS[slot.position] ?? slot.position;
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
        `The best single game any ${positionWord} has ever posted.` +
        (crest ? ` ${crest.name} reaped it.` : ""),
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
  interface DraftCandidate extends StartupPickRow {
    careerPts: number;
  }
  const draftStealCandidates: DraftCandidate[] = startupPicks
    .filter((p) => p.round >= 8)
    .map((p) => ({ ...p, careerPts: careerByPlayerId.get(p.playerId)?.careerPts ?? 0 }))
    .sort((a, b) => b.careerPts - a.careerPts)
    .slice(0, 15);

  const waiverMiracleCandidates: CareerPointsRow[] = careerRows
    .filter((r) => waiverAddedIds.has(r.playerId))
    .sort((a, b) => b.careerPts - a.careerPts)
    .slice(0, 15);

  const cometCandidates: SeasonPointsRow[] = biggestSeasons.slice(0, 15);

  const ironManCandidates: CareerPointsRow[] = [...careerRows]
    .sort((a, b) => b.careerStarts - a.careerStarts)
    .slice(0, 15);

  interface BustCandidate extends StartupPickRow {
    careerPts: number;
  }
  const bustCandidates: BustCandidate[] = startupPicks
    .filter((p) => p.round === 1)
    .map((p) => ({ ...p, careerPts: careerByPlayerId.get(p.playerId)?.careerPts ?? 0 }))
    .sort((a, b) => a.careerPts - b.careerPts)
    .slice(0, 15);

  const [draftStealWinner, waiverMiracleWinner, cometWinner, ironManWinner, bustWinner] =
    dedupePieces(
      claimedIds,
      draftStealCandidates,
      waiverMiracleCandidates,
      cometCandidates,
      ironManCandidates,
      bustCandidates,
    );

  let draftStealPiece: LorePiece | null = null;
  if (draftStealWinner) {
    const label = SNARKY_LABELS.THE_DRAFT_STEAL;
    const info = careerByPlayerId.get(draftStealWinner.playerId);
    const pts = Math.round(draftStealWinner.careerPts);
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
        `${draftStealWinner.seasonYear} startup. ${pts.toLocaleString()} career points. Larceny.`,
    };
  }

  let waiverMiraclePiece: LorePiece | null = null;
  if (waiverMiracleWinner) {
    const label = SNARKY_LABELS.THE_WAIVER_MIRACLE;
    const pts = Math.round(waiverMiracleWinner.careerPts);
    waiverMiraclePiece = {
      key: label.key,
      title: label.displayText,
      tone: label.tone,
      iconKey: label.displayText,
      playerId: waiverMiracleWinner.playerId,
      playerName: waiverMiracleWinner.playerName,
      position: waiverMiracleWinner.position,
      statValue: `${pts.toLocaleString()} pts`,
      story: `${pts.toLocaleString()} career points from a guy the league left on waivers. Free money.`,
    };
  }

  let ironManPiece: LorePiece | null = null;
  if (ironManWinner) {
    const label = SNARKY_LABELS.THE_IRON_MAN;
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
    };
  }

  let cometPiece: LorePiece | null = null;
  if (cometWinner) {
    const label = SNARKY_LABELS.THE_COMET;
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
        `${cometWinner.seasonPoints.toFixed(1)} points in ${cometWinner.seasonYear}. ` +
        "The single greatest fantasy season this league has witnessed.",
    };
  }

  let bustPiece: LorePiece | null = null;
  if (bustWinner) {
    const label = SNARKY_LABELS.THE_BUST;
    const info = careerByPlayerId.get(bustWinner.playerId);
    const pts = Math.round(bustWinner.careerPts);
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
        `First round, pick ${bustWinner.pickNumber} of the ${bustWinner.seasonYear} startup. ` +
        `${pts.toLocaleString()} career points to show for it. Woof.`,
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
