import { db } from "@/lib/db";
import { franchises, franchiseSeasons, seasons } from "@/lib/db/schema";
import { and, eq, ne, inArray } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FranchiseLongevity {
  franchiseId: string;
  slug: string;
  name: string;
  allTimeWinPct: number;
  championships: number;
  playoffAppearances: number;
  seasonsPlayed: number;
  bestFinish: number | null;
  /** Standings finish for the last N completed seasons, most recent first. */
  lastNFinishes: (number | null)[];
  /** Per-season win% for the last N completed seasons, most recent first. */
  lastNWinPcts: number[];
  /** Bottom-third finish in ALL of the last N (N >= 2) completed seasons. */
  sustainedDoormat: boolean;
  /** Made the playoffs in ALL of the last N (N >= 2) completed seasons. */
  sustainedContender: boolean;
}

// A single completed-season row for one franchise, as read from the DB, plus
// the season's totalRosters (needed to judge "bottom third").
interface CompletedSeasonRow {
  seasonYear: number;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  standingsFinish: number | null;
  playoffResult: string | null;
  totalRosters: number | null;
}

// Playoff results that represent a genuine playoff-bracket appearance.
// 'consolation' and 'toilet_bowl' are non-playoff-bracket outcomes (mirrors
// the precedent in lib/queries/preseason.ts).
const NON_PLAYOFF_RESULTS = new Set(["consolation", "toilet_bowl"]);

function isPlayoffAppearance(playoffResult: string | null): boolean {
  return playoffResult != null && !NON_PLAYOFF_RESULTS.has(playoffResult);
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/**
 * A standings finish is "bottom third" of the league that season: finish
 * strictly worse than the top two-thirds cutoff. Returns false when finish or
 * totalRosters is unknown (never penalize on missing data).
 */
export function isBottomThirdFinish(
  finish: number | null,
  totalRosters: number | null,
): boolean {
  if (finish == null || totalRosters == null || totalRosters <= 0) return false;
  const cutoff = Math.ceil((totalRosters * 2) / 3);
  return finish > cutoff;
}

/**
 * Sustained-doormat trend flag: true only when there are at least 2 completed
 * seasons of history AND every one of them was a bottom-third finish. A
 * single bad season is a slump, not a trend.
 */
export function computeSustainedDoormat(
  finishes: { finish: number | null; totalRosters: number | null }[],
): boolean {
  if (finishes.length < 2) return false;
  return finishes.every((f) => isBottomThirdFinish(f.finish, f.totalRosters));
}

/**
 * Sustained-contender trend flag: true only when there are at least 2
 * completed seasons of history AND every one of them included a playoff
 * appearance.
 */
export function computeSustainedContender(playoffFlags: boolean[]): boolean {
  if (playoffFlags.length < 2) return false;
  return playoffFlags.every(Boolean);
}

function winPct(wins: number | null, losses: number | null, ties: number | null): number {
  const w = wins ?? 0;
  const l = losses ?? 0;
  const t = ties ?? 0;
  const total = w + l + t;
  return total > 0 ? (w + t * 0.5) / total : 0;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * League-wide multi-season history per franchise: all-time record, titles,
 * playoff appearances, and trend flags (sustainedDoormat / sustainedContender)
 * over the last N completed seasons. Excludes the current (in-progress or
 * pre-draft) season and any non-'complete' season, so a franchise's brand-new
 * roster year never counts against or for it. One batched query (modeled on
 * getLeaderboard in lib/queries/records.ts), grouped and reduced in JS.
 *
 * Returns an empty array on any query failure so callers degrade gracefully.
 */
export async function getLeagueLongevity(
  currentSeasonId: number,
  franchiseIds: string[],
  trendWindow = 3,
): Promise<FranchiseLongevity[]> {
  if (franchiseIds.length === 0) return [];

  try {
    const rows = await db
      .select({
        franchiseId: franchiseSeasons.franchiseId,
        slug: franchises.slug,
        name: franchises.name,
        seasonYear: seasons.seasonYear,
        wins: franchiseSeasons.wins,
        losses: franchiseSeasons.losses,
        ties: franchiseSeasons.ties,
        standingsFinish: franchiseSeasons.standingsFinish,
        playoffResult: franchiseSeasons.playoffResult,
        totalRosters: seasons.totalRosters,
      })
      .from(franchiseSeasons)
      .innerJoin(franchises, eq(franchiseSeasons.franchiseId, franchises.id))
      .innerJoin(seasons, eq(franchiseSeasons.seasonId, seasons.id))
      .where(
        and(
          inArray(franchiseSeasons.franchiseId, franchiseIds),
          eq(seasons.status, "complete"),
          ne(seasons.id, currentSeasonId),
        ),
      )
      .orderBy(franchiseSeasons.franchiseId, seasons.seasonYear);

    const byFranchise = new Map<
      string,
      { slug: string; name: string; seasons: CompletedSeasonRow[] }
    >();
    for (const r of rows) {
      const bucket =
        byFranchise.get(r.franchiseId) ?? { slug: r.slug, name: r.name, seasons: [] };
      bucket.seasons.push({
        seasonYear: r.seasonYear,
        wins: r.wins,
        losses: r.losses,
        ties: r.ties,
        standingsFinish: r.standingsFinish,
        playoffResult: r.playoffResult,
        totalRosters: r.totalRosters,
      });
      byFranchise.set(r.franchiseId, bucket);
    }

    const result: FranchiseLongevity[] = [];
    for (const [franchiseId, bucket] of byFranchise) {
      // Most-recent-first for trend windows.
      const bySeasonDesc = [...bucket.seasons].sort((a, b) => b.seasonYear - a.seasonYear);

      let totalWins = 0;
      let totalLosses = 0;
      let totalTies = 0;
      let championships = 0;
      let playoffAppearances = 0;
      let bestFinish: number | null = null;

      for (const s of bucket.seasons) {
        totalWins += s.wins ?? 0;
        totalLosses += s.losses ?? 0;
        totalTies += s.ties ?? 0;
        if (s.playoffResult === "champion") championships++;
        if (isPlayoffAppearance(s.playoffResult)) playoffAppearances++;
        if (
          s.standingsFinish != null &&
          (bestFinish === null || s.standingsFinish < bestFinish)
        ) {
          bestFinish = s.standingsFinish;
        }
      }

      const lastN = bySeasonDesc.slice(0, trendWindow);
      const lastNFinishes = lastN.map((s) => s.standingsFinish);
      const lastNWinPcts = lastN.map((s) => winPct(s.wins, s.losses, s.ties));
      const sustainedDoormat = computeSustainedDoormat(
        lastN.map((s) => ({ finish: s.standingsFinish, totalRosters: s.totalRosters })),
      );
      const sustainedContender = computeSustainedContender(
        lastN.map((s) => isPlayoffAppearance(s.playoffResult)),
      );

      const totalGames = totalWins + totalLosses + totalTies;

      result.push({
        franchiseId,
        slug: bucket.slug,
        name: bucket.name,
        allTimeWinPct: totalGames > 0 ? (totalWins + totalTies * 0.5) / totalGames : 0,
        championships,
        playoffAppearances,
        seasonsPlayed: bucket.seasons.length,
        bestFinish,
        lastNFinishes,
        lastNWinPcts,
        sustainedDoormat,
        sustainedContender,
      });
    }

    return result;
  } catch (e) {
    console.error("[franchise-longevity] getLeagueLongevity error:", e);
    return [];
  }
}
