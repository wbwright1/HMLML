import { db } from "@/lib/db";
import { matchups, franchises, franchiseSeasons } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { SNARKY_LABELS, type LabelTone } from "@/lib/content";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatchupResult {
  winner: string;
  winnerSlug: string;
  loser: string;
  loserSlug: string;
  winnerScore: number;
  loserScore: number;
  margin: number;
}

export interface ScorerResult {
  franchiseName: string;
  franchiseSlug: string;
  points: number;
}

export interface WeeklySuperlatives {
  closestWin: MatchupResult | null;
  biggestBlowout: MatchupResult | null;
  highestScorer: ScorerResult | null;
  lowestScorer: ScorerResult | null;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Returns weekly superlative stats for a given season and week.
 * All data comes from the matchups table joined with franchises.
 */
export async function getWeeklySuperlatives(
  seasonId: number,
  week: number
): Promise<WeeklySuperlatives> {
  try {
    // Fetch all completed matchup rows for this week
    const rows = await db
      .select({
        matchupId: matchups.matchupId,
        franchiseId: matchups.franchiseId,
        franchiseName: franchises.name,
        franchiseSlug: franchises.slug,
        points: matchups.points,
        isWinner: matchups.isWinner,
      })
      .from(matchups)
      .innerJoin(franchises, eq(matchups.franchiseId, franchises.id))
      .where(
        and(
          eq(matchups.seasonId, seasonId),
          eq(matchups.week, week),
          eq(matchups.status, "complete")
        )
      );

    if (rows.length === 0) {
      return {
        closestWin: null,
        biggestBlowout: null,
        highestScorer: null,
        lowestScorer: null,
      };
    }

    // Group rows by matchupId to pair opponents
    const grouped = new Map<
      number,
      { franchiseName: string; franchiseSlug: string; points: number; isWinner: boolean | null }[]
    >();

    for (const row of rows) {
      const group = grouped.get(row.matchupId) ?? [];
      group.push({
        franchiseName: row.franchiseName,
        franchiseSlug: row.franchiseSlug,
        points: row.points ?? 0,
        isWinner: row.isWinner,
      });
      grouped.set(row.matchupId, group);
    }

    // Build paired results
    const paired: MatchupResult[] = [];
    for (const [, pair] of grouped) {
      if (pair.length !== 2) continue;

      const winner = pair.find((p) => p.isWinner === true) ?? pair[0];
      const loser = pair.find((p) => p.isWinner !== true) ?? pair[1];

      paired.push({
        winner: winner.franchiseName,
        winnerSlug: winner.franchiseSlug,
        loser: loser.franchiseName,
        loserSlug: loser.franchiseSlug,
        winnerScore: winner.points,
        loserScore: loser.points,
        margin: Math.abs(winner.points - loser.points),
      });
    }

    // Sort by margin to find closest and biggest blowout
    const byMargin = [...paired].sort((a, b) => a.margin - b.margin);
    const closestWin = byMargin.length > 0 ? byMargin[0] : null;
    const biggestBlowout =
      byMargin.length > 0 ? byMargin[byMargin.length - 1] : null;

    // Individual franchise scores for highest/lowest
    const allScores = rows
      .map((r) => ({
        franchiseName: r.franchiseName,
        franchiseSlug: r.franchiseSlug,
        points: r.points ?? 0,
      }))
      .sort((a, b) => b.points - a.points);

    const highestScorer = allScores.length > 0 ? allScores[0] : null;
    const lowestScorer =
      allScores.length > 0 ? allScores[allScores.length - 1] : null;

    return {
      closestWin,
      biggestBlowout,
      highestScorer,
      lowestScorer,
    };
  } catch (e) {
    console.error("[superlatives] getWeeklySuperlatives error:", e);
    return {
      closestWin: null,
      biggestBlowout: null,
      highestScorer: null,
      lowestScorer: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Season superlatives (records page "The Superlatives" section)
// ---------------------------------------------------------------------------

export interface SeasonSuperlative {
  labelKey: string;
  displayText: string;
  franchiseName: string;
  franchiseSlug: string;
  stat: string;
  context: string;
  tone: LabelTone;
}

/**
 * Returns season-level superlative cards for a season, sourcing every label's
 * display text and tone from SNARKY_LABELS rather than hardcoding strings.
 * Mirrors the franchise_seasons standings pattern used by getPreseasonAwards,
 * plus full-season win/loss-streak awards computed from matchups.
 */
export async function getSeasonSuperlatives(
  seasonId: number
): Promise<SeasonSuperlative[]> {
  try {
    const standings = await db
      .select({
        franchiseId: franchiseSeasons.franchiseId,
        franchiseName: franchises.name,
        franchiseSlug: franchises.slug,
        wins: franchiseSeasons.wins,
        losses: franchiseSeasons.losses,
        ties: franchiseSeasons.ties,
        pointsScored: franchiseSeasons.pointsScored,
        pointsAgainst: franchiseSeasons.pointsAgainst,
      })
      .from(franchiseSeasons)
      .innerJoin(franchises, eq(franchiseSeasons.franchiseId, franchises.id))
      .where(eq(franchiseSeasons.seasonId, seasonId));

    if (standings.length === 0) return [];

    const result: SeasonSuperlative[] = [];

    const push = (
      key: keyof typeof SNARKY_LABELS,
      franchiseName: string,
      franchiseSlug: string,
      stat: string,
      context: string
    ) => {
      const label = SNARKY_LABELS[key];
      result.push({
        labelKey: label.key,
        displayText: label.displayText,
        franchiseName,
        franchiseSlug,
        stat,
        context,
        tone: label.tone,
      });
    };

    // Point Machine (max points scored)
    const byPF = [...standings].sort(
      (a, b) => (b.pointsScored ?? 0) - (a.pointsScored ?? 0)
    );
    if (byPF[0]) {
      push(
        "POINT_MACHINE",
        byPF[0].franchiseName,
        byPF[0].franchiseSlug,
        `${(byPF[0].pointsScored ?? 0).toFixed(1)} PF`,
        "Most points scored in the league"
      );
    }

    // Iron Curtain (min points against)
    const byPA = [...standings].sort(
      (a, b) => (a.pointsAgainst ?? 0) - (b.pointsAgainst ?? 0)
    );
    if (byPA[0]) {
      push(
        "IRON_CURTAIN",
        byPA[0].franchiseName,
        byPA[0].franchiseSlug,
        `${(byPA[0].pointsAgainst ?? 0).toFixed(1)} PA`,
        "Fewest points scored against"
      );
    }

    // Glass Cannon (highest PF among bottom-half-of-the-league wins)
    const medianWins =
      [...standings]
        .map((s) => s.wins ?? 0)
        .sort((a, b) => a - b)[Math.floor(standings.length / 2)] ?? 0;
    const glassCannons = standings
      .filter((s) => (s.wins ?? 0) <= medianWins && (s.pointsScored ?? 0) > 0)
      .sort((a, b) => (b.pointsScored ?? 0) - (a.pointsScored ?? 0));
    if (glassCannons[0]) {
      const t = glassCannons[0];
      const record = `${t.wins ?? 0}-${t.losses ?? 0}${(t.ties ?? 0) > 0 ? `-${t.ties}` : ""}`;
      push(
        "GLASS_CANNON",
        t.franchiseName,
        t.franchiseSlug,
        `${(t.pointsScored ?? 0).toFixed(1)} PF`,
        `${(t.pointsScored ?? 0).toFixed(1)} PF but only ${record}`
      );
    }

    // Paper Tiger (max points against)
    const byMostPA = [...standings].sort(
      (a, b) => (b.pointsAgainst ?? 0) - (a.pointsAgainst ?? 0)
    );
    if (byMostPA[0]) {
      push(
        "PAPER_TIGER",
        byMostPA[0].franchiseName,
        byMostPA[0].franchiseSlug,
        `${(byMostPA[0].pointsAgainst ?? 0).toFixed(1)} PA`,
        "Most points scored against; the league's favorite target"
      );
    }

    // On Fire / Rock Bottom: full-season max win/loss run (not just the
    // active tail), computed from regular-season matchups in week order.
    const gameRows = await db
      .select({
        franchiseId: matchups.franchiseId,
        week: matchups.week,
        isWinner: matchups.isWinner,
      })
      .from(matchups)
      .where(
        and(
          eq(matchups.seasonId, seasonId),
          eq(matchups.status, "complete"),
          eq(matchups.isPlayoff, false)
        )
      )
      .orderBy(asc(matchups.week));

    const byFranchise = new Map<
      string,
      { week: number; isWinner: boolean | null }[]
    >();
    for (const row of gameRows) {
      const arr = byFranchise.get(row.franchiseId) ?? [];
      arr.push({ week: row.week, isWinner: row.isWinner });
      byFranchise.set(row.franchiseId, arr);
    }

    let bestWinStreak: { franchiseId: string; streak: number } | null = null;
    let worstLossStreak: { franchiseId: string; streak: number } | null = null;

    for (const [franchiseId, games] of byFranchise) {
      games.sort((a, b) => a.week - b.week);
      let curWin = 0;
      let maxWin = 0;
      let curLoss = 0;
      let maxLoss = 0;
      for (const g of games) {
        if (g.isWinner === true) {
          curWin++;
          curLoss = 0;
        } else if (g.isWinner === false) {
          curLoss++;
          curWin = 0;
        } else {
          curWin = 0;
          curLoss = 0;
        }
        maxWin = Math.max(maxWin, curWin);
        maxLoss = Math.max(maxLoss, curLoss);
      }
      if (maxWin > 0 && (!bestWinStreak || maxWin > bestWinStreak.streak)) {
        bestWinStreak = { franchiseId, streak: maxWin };
      }
      if (maxLoss > 0 && (!worstLossStreak || maxLoss > worstLossStreak.streak)) {
        worstLossStreak = { franchiseId, streak: maxLoss };
      }
    }

    const franchiseLookup = new Map(standings.map((s) => [s.franchiseId, s]));

    if (bestWinStreak) {
      const f = franchiseLookup.get(bestWinStreak.franchiseId);
      if (f) {
        push(
          "ON_FIRE",
          f.franchiseName,
          f.franchiseSlug,
          `${bestWinStreak.streak}W`,
          "Longest win streak this season"
        );
      }
    }

    if (worstLossStreak) {
      const f = franchiseLookup.get(worstLossStreak.franchiseId);
      if (f) {
        push(
          "ROCK_BOTTOM",
          f.franchiseName,
          f.franchiseSlug,
          `${worstLossStreak.streak}L`,
          "Longest losing streak this season"
        );
      }
    }

    return result;
  } catch (e) {
    console.error("[superlatives] getSeasonSuperlatives error:", e);
    return [];
  }
}
