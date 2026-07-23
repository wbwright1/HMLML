import { db } from "@/lib/db";
import { seasons, nflGames } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getNFLState } from "@/lib/sleeper";
import type { SleeperNFLState } from "@/lib/sleeper-schemas";

export interface ResolvedNflState {
  state: SleeperNFLState;
  // True when the live /state/nfl endpoint was unavailable and the state was
  // reconstructed from the last-synced database rows instead.
  fromFallback: boolean;
}

/**
 * Resolves the current NFL state, degrading gracefully when the live
 * /state/nfl endpoint is down or fails Zod validation. On failure it
 * reconstructs a best-effort state from the most recent season row plus the
 * nfl_games schedule (both written by prior successful syncs). Returns null
 * only when live state is unavailable AND no fallback can be reconstructed
 * (no season rows exist), in which case callers must abort state-dependent
 * steps rather than guess.
 */
export async function resolveNflState(): Promise<ResolvedNflState | null> {
  const live = await getNFLState();
  if (!("error" in live)) {
    return { state: live.data, fromFallback: false };
  }

  console.warn(
    `[sync] getNFLState failed (${live.error.message}); attempting DB fallback`
  );

  const [latestSeason] = await db
    .select({ seasonYear: seasons.seasonYear, status: seasons.status })
    .from(seasons)
    .orderBy(desc(seasons.seasonYear))
    .limit(1);

  if (!latestSeason) return null;

  const seasonYear = latestSeason.seasonYear;
  const week = await deriveCurrentWeek(seasonYear);

  // Map the stored league status to a season_type precise enough for the
  // stats/projection season selection that reads it; default to regular.
  const seasonType =
    latestSeason.status === "complete"
      ? "off"
      : latestSeason.status === "pre_draft" ||
          latestSeason.status === "drafting"
        ? "pre"
        : "regular";

  const state: SleeperNFLState = {
    season: String(seasonYear),
    season_type: seasonType,
    week,
    display_week: week,
    leg: week,
  };

  return { state, fromFallback: true };
}

/**
 * Derives the current week from the nfl_games schedule for a season: the
 * earliest week that still has a non-complete game. Falls back to the latest
 * scheduled week when every game is complete, and to week 1 when no schedule
 * rows exist.
 */
async function deriveCurrentWeek(seasonYear: number): Promise<number> {
  const rows = await db
    .select({ week: nflGames.week, status: nflGames.status })
    .from(nflGames)
    .where(eq(nflGames.seasonYear, seasonYear));

  if (rows.length === 0) return 1;

  let earliestIncomplete: number | null = null;
  let maxWeek = 1;
  for (const r of rows) {
    if (r.week > maxWeek) maxWeek = r.week;
    if (r.status !== "complete") {
      if (earliestIncomplete == null || r.week < earliestIncomplete) {
        earliestIncomplete = r.week;
      }
    }
  }

  return earliestIncomplete ?? maxWeek;
}
