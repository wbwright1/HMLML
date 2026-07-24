import { db } from "@/lib/db";
import { matchups, franchises, seasons } from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorstBeatdown {
  seasonYear: number;
  week: number;
  pointsFor: number;
  pointsAgainst: number;
  margin: number;
  opponentName: string;
  opponentSlug: string;
  isPlayoff: boolean;
}

export interface FranchiseExtremes {
  worstBeatdown: WorstBeatdown | null;
  biggestWin: WorstBeatdown | null;
  longestWinStreak: number;
}

// ---------------------------------------------------------------------------
// Query — a franchise's completed games with opponent, for extreme stats
// ---------------------------------------------------------------------------

/**
 * Computes signature "band" extremes for a single franchise from completed
 * matchups: the worst beatdown ever taken (biggest losing margin, with
 * opponent + year) and the longest all-time win streak. Same self-join on
 * `matchups` used by getHeadToHeadHistory, so pairing logic stays consistent.
 */
export async function getFranchiseExtremes(
  franchiseId: string
): Promise<FranchiseExtremes> {
  try {
    const games = await db
      .select({
        seasonYear: seasons.seasonYear,
        week: sql<number>`a.week`,
        pointsFor: sql<number>`a.points`,
        pointsAgainst: sql<number>`b.points`,
        isWinner: sql<boolean>`a.is_winner`,
        isPlayoff: sql<boolean>`a.is_playoff`,
        opponentName: sql<string>`opp.name`,
        opponentSlug: sql<string>`opp.slug`,
      })
      .from(
        sql`${matchups} a INNER JOIN ${matchups} b ON a.season_id = b.season_id AND a.week = b.week AND a.matchup_id = b.matchup_id AND a.franchise_id != b.franchise_id`
      )
      .innerJoin(seasons, eq(seasons.id, sql`a.season_id`))
      .innerJoin(sql`${franchises} opp`, sql`opp.id = b.franchise_id`)
      .where(sql`a.franchise_id = ${franchiseId} AND a.status = 'complete'`);

    // Sort chronologically for streak calc.
    const sorted = [...games].sort((x, y) => {
      if (x.seasonYear !== y.seasonYear) return x.seasonYear - y.seasonYear;
      return x.week - y.week;
    });

    let worstBeatdown: WorstBeatdown | null = null;
    let biggestWin: WorstBeatdown | null = null;
    let longestWinStreak = 0;
    let currentStreak = 0;

    for (const g of sorted) {
      const pf = Number(g.pointsFor ?? 0);
      const pa = Number(g.pointsAgainst ?? 0);

      if (g.isWinner === true) {
        currentStreak++;
        if (currentStreak > longestWinStreak) longestWinStreak = currentStreak;

        // Most dominant win = largest winning margin.
        const winMargin = pf - pa;
        if (!biggestWin || winMargin > biggestWin.margin) {
          biggestWin = {
            seasonYear: g.seasonYear,
            week: g.week,
            pointsFor: pf,
            pointsAgainst: pa,
            margin: winMargin,
            opponentName: g.opponentName,
            opponentSlug: g.opponentSlug,
            isPlayoff: Boolean(g.isPlayoff),
          };
        }
      } else {
        // A loss or tie breaks the win streak.
        currentStreak = 0;
      }

      // Worst beatdown = largest losing margin.
      if (g.isWinner === false) {
        const margin = pa - pf;
        if (!worstBeatdown || margin > worstBeatdown.margin) {
          worstBeatdown = {
            seasonYear: g.seasonYear,
            week: g.week,
            pointsFor: pf,
            pointsAgainst: pa,
            margin,
            opponentName: g.opponentName,
            opponentSlug: g.opponentSlug,
            isPlayoff: Boolean(g.isPlayoff),
          };
        }
      }
    }

    return { worstBeatdown, biggestWin, longestWinStreak };
  } catch {
    return { worstBeatdown: null, biggestWin: null, longestWinStreak: 0 };
  }
}
