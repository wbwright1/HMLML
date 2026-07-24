import { db } from "@/lib/db";
import {
  seasons,
  franchises,
  players,
  playerWeekPoints,
  leagueAwards,
} from "@/lib/db/schema";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { logSyncStart, logSyncComplete } from "@/lib/queries/sync-log";
import { AWARD_TYPES } from "@/lib/awards";
import {
  LEAGUE_AWARDS_SEED,
  FANTASY_POSITIONS,
  normalizePlayerName,
  type AwardSeed,
} from "@/lib/awards-seed";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedAward {
  seasonYear: number;
  seasonId: number;
  awardType: string;
  playerName: string; // canonical snapshot (from players.full_name)
  playerId: string;
  position: string | null;
  franchiseId: string;
  franchiseSlug: string;
  /** Only set for championship_mvp: whether the winner's playoff franchise
   *  matched the season champion. */
  championshipSanity: "match" | "mismatch" | "n/a";
  note: string | null;
}

export interface AwardsImportResult {
  status: "success" | "failure";
  dryRun: boolean;
  resolved: ResolvedAward[];
  errors: string[];
  rowCount: number;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

interface FranchiseShare {
  franchiseId: string;
  franchiseSlug: string;
  points: number;
  maxWeek: number;
}

/**
 * Pick the winning franchise from a player's per-franchise point shares for a
 * season. Single share wins outright; when the player was split across
 * franchises, the one holding them at season end (max week, tiebreak points)
 * wins. Pure so it is unit-testable. Returns null on empty input.
 */
export function pickSeasonFranchise(
  shares: FranchiseShare[],
): FranchiseShare | null {
  if (shares.length === 0) return null;
  if (shares.length === 1) return shares[0];
  return [...shares].sort(
    (a, b) => b.maxWeek - a.maxWeek || b.points - a.points,
  )[0];
}

// ---------------------------------------------------------------------------
// DB resolution (reads only)
// ---------------------------------------------------------------------------

async function resolveSeasonId(seasonYear: number): Promise<number> {
  const [row] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.seasonYear, seasonYear))
    .limit(1);
  if (!row) {
    throw new Error(`no seasons row for season_year ${seasonYear}`);
  }
  return row.id;
}

interface ResolvedPlayer {
  playerId: string;
  playerName: string;
  position: string | null;
}

async function resolvePlayer(
  seed: AwardSeed,
  seasonId: number,
): Promise<ResolvedPlayer> {
  const norm = normalizePlayerName(seed.playerName);
  const matches = await db
    .select({
      id: players.id,
      fullName: players.fullName,
      position: players.position,
    })
    .from(players)
    .where(eq(players.searchFullName, norm));

  if (matches.length === 0) {
    throw new Error(
      `no player matches "${seed.playerName}" (search_full_name=${norm})`,
    );
  }

  let candidates = matches;
  // Disambiguate collisions (e.g. two "Lamar Jackson" rows) by fantasy position.
  if (candidates.length > 1) {
    const fantasy = candidates.filter(
      (c) => c.position && (FANTASY_POSITIONS as readonly string[]).includes(c.position),
    );
    if (fantasy.length > 0) candidates = fantasy;
  }
  // Still ambiguous: prefer the one who actually scored for a roster that season.
  if (candidates.length > 1) {
    const ids = candidates.map((c) => c.id);
    const scored = await db
      .selectDistinct({ playerId: playerWeekPoints.playerId })
      .from(playerWeekPoints)
      .where(
        and(
          eq(playerWeekPoints.seasonId, seasonId),
          inArray(playerWeekPoints.playerId, ids),
        ),
      );
    const scoredIds = new Set(scored.map((s) => s.playerId));
    const filtered = candidates.filter((c) => scoredIds.has(c.id));
    if (filtered.length > 0) candidates = filtered;
  }

  if (candidates.length !== 1) {
    throw new Error(
      `ambiguous player "${seed.playerName}" resolves to ${candidates.length} rows (${candidates
        .map((c) => `${c.fullName ?? "?"}#${c.id}/${c.position ?? "?"}`)
        .join(", ")})`,
    );
  }

  const p = candidates[0];
  return {
    playerId: p.id,
    playerName: p.fullName ?? seed.playerName,
    position: p.position ?? null,
  };
}

async function franchiseShares(
  seasonId: number,
  playerId: string,
  minWeek?: number,
): Promise<FranchiseShare[]> {
  const conditions = [
    eq(playerWeekPoints.seasonId, seasonId),
    eq(playerWeekPoints.playerId, playerId),
  ];
  if (minWeek != null) {
    conditions.push(gte(playerWeekPoints.week, minWeek));
  }
  const rows = await db
    .select({
      franchiseId: playerWeekPoints.franchiseId,
      franchiseSlug: franchises.slug,
      points: sql<number>`sum(${playerWeekPoints.points})`,
      maxWeek: sql<number>`max(${playerWeekPoints.week})`,
    })
    .from(playerWeekPoints)
    .innerJoin(franchises, eq(franchises.id, playerWeekPoints.franchiseId))
    .where(and(...conditions))
    .groupBy(playerWeekPoints.franchiseId, franchises.slug);

  return rows.map((r) => ({
    franchiseId: r.franchiseId,
    franchiseSlug: r.franchiseSlug,
    points: Number(r.points ?? 0),
    maxWeek: Number(r.maxWeek ?? 0),
  }));
}

async function resolveOne(seed: AwardSeed): Promise<ResolvedAward> {
  const seasonId = await resolveSeasonId(seed.seasonYear);
  const player = await resolvePlayer(seed, seasonId);

  const [season] = await db
    .select({
      championFranchiseId: seasons.championFranchiseId,
      playoffWeekStart: seasons.playoffWeekStart,
    })
    .from(seasons)
    .where(eq(seasons.id, seasonId))
    .limit(1);

  let franchiseId: string;
  let franchiseSlug: string;
  let championshipSanity: ResolvedAward["championshipSanity"] = "n/a";

  if (seed.awardType === AWARD_TYPES.CHAMPIONSHIP_MVP) {
    const playoffWeekStart = season?.playoffWeekStart ?? 15;
    const shares = await franchiseShares(seasonId, player.playerId, playoffWeekStart);
    const winner = pickSeasonFranchise(shares);
    if (!winner) {
      throw new Error(
        `championship_mvp ${seed.seasonYear} "${seed.playerName}": no player_week_points in playoff weeks (>=${playoffWeekStart}); cannot attribute franchise`,
      );
    }
    franchiseId = winner.franchiseId;
    franchiseSlug = winner.franchiseSlug;
    // Sanity-check against the season champion; fail loudly on mismatch.
    const champ = season?.championFranchiseId ?? null;
    if (champ && champ !== franchiseId) {
      championshipSanity = "mismatch";
      throw new Error(
        `championship_mvp ${seed.seasonYear} "${player.playerName}": playoff franchise ${franchiseSlug} (${franchiseId}) does not match season champion ${champ}`,
      );
    }
    championshipSanity = champ ? "match" : "n/a";
  } else {
    const shares = await franchiseShares(seasonId, player.playerId);
    const winner = pickSeasonFranchise(shares);
    if (!winner) {
      throw new Error(
        `${seed.awardType} ${seed.seasonYear} "${seed.playerName}": no player_week_points for the season; cannot attribute franchise`,
      );
    }
    franchiseId = winner.franchiseId;
    franchiseSlug = winner.franchiseSlug;
  }

  return {
    seasonYear: seed.seasonYear,
    seasonId,
    awardType: seed.awardType,
    playerName: player.playerName,
    playerId: player.playerId,
    position: player.position,
    franchiseId,
    franchiseSlug,
    championshipSanity,
    note: seed.note ?? null,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Resolve and (unless dryRun) upsert the commissioner-entered league awards.
 * Idempotent: writes upsert on (season_id, award_type) inside one transaction,
 * logged to sync_log with dataType 'awards'. In dryRun mode this performs ONLY
 * reads, resolving every seed row and reporting the fully-resolved table plus
 * any errors, without touching the DB.
 */
export async function runAwardsImport(
  dryRun = false,
  seed: AwardSeed[] = LEAGUE_AWARDS_SEED,
): Promise<AwardsImportResult> {
  const resolved: ResolvedAward[] = [];
  const errors: string[] = [];

  for (const s of seed) {
    try {
      resolved.push(await resolveOne(s));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
    }
  }

  if (dryRun) {
    return {
      status: errors.length === 0 ? "success" : "failure",
      dryRun: true,
      resolved,
      errors,
      rowCount: resolved.length,
    };
  }

  // Live write path: refuse to write a partial/incorrect set.
  if (errors.length > 0) {
    throw new Error(
      `awards import aborted: ${errors.length} resolution error(s):\n - ${errors.join("\n - ")}`,
    );
  }

  const logId = await logSyncStart("legacy_import", "awards");
  const startTime = Date.now();
  try {
    await db.transaction(async (tx) => {
      for (const r of resolved) {
        await tx
          .insert(leagueAwards)
          .values({
            seasonId: r.seasonId,
            awardType: r.awardType,
            playerId: r.playerId,
            playerName: r.playerName,
            position: r.position,
            franchiseId: r.franchiseId,
            note: r.note,
          })
          .onConflictDoUpdate({
            target: [leagueAwards.seasonId, leagueAwards.awardType],
            set: {
              playerId: sql`excluded.player_id`,
              playerName: sql`excluded.player_name`,
              position: sql`excluded.position`,
              franchiseId: sql`excluded.franchise_id`,
              note: sql`excluded.note`,
            },
          });
      }
    });

    await logSyncComplete(logId, "success", resolved.length, undefined, {
      durationMs: Date.now() - startTime,
    });

    return {
      status: "success",
      dryRun: false,
      resolved,
      errors: [],
      rowCount: resolved.length,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logSyncComplete(logId, "failure", 0, msg);
    throw e;
  }
}
