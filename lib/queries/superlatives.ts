import { db } from "@/lib/db";
import { matchups, franchises, franchiseSeasons, seasons } from "@/lib/db/schema";
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

    // Build paired results, excluding ties: a tied matchup has no side with
    // isWinner === true, so without this guard both winner and loser would
    // fall back to the same pair[0], producing a nonsensical "X beat X"
    // margin-0 entry among the blowout/nailbiter candidates.
    const paired: MatchupResult[] = [];
    for (const [, pair] of grouped) {
      if (pair.length !== 2) continue;

      const winner = pair.find((p) => p.isWinner === true);
      const loser = pair.find((p) => p.isWinner === false);
      if (!winner || !loser) continue;

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
    if (byPF[0] && (byPF[0].pointsScored ?? 0) > 0) {
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
    if (byPA[0] && (byPA[0].pointsAgainst ?? 0) > 0) {
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
    if (byMostPA[0] && (byMostPA[0].pointsAgainst ?? 0) > 0) {
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

    // Cardiac Crew / Mercy Rule / Blowout Bait: season-wide margin awards,
    // computed from every regular-season matchup paired by (week, matchupId)
    // (same pairing approach as getWeeklySuperlatives, but scoped to the full
    // season rather than one week). CARDIAC_CREW and MERCY_RULE reuse labels
    // already defined in SNARKY_LABELS that, until now, only powered the
    // weekly "This Week's Damage" cards; this surfaces a season-long analog
    // on the records page so a single week's outlier margin isn't the only
    // way a franchise shows up here.
    const marginRows = await db
      .select({
        matchupId: matchups.matchupId,
        franchiseId: matchups.franchiseId,
        week: matchups.week,
        points: matchups.points,
        isWinner: matchups.isWinner,
      })
      .from(matchups)
      .where(
        and(
          eq(matchups.seasonId, seasonId),
          eq(matchups.status, "complete"),
          eq(matchups.isPlayoff, false)
        )
      );

    const marginGroups = new Map<string, typeof marginRows>();
    for (const row of marginRows) {
      const key = `${row.week}:${row.matchupId}`;
      const arr = marginGroups.get(key) ?? [];
      arr.push(row);
      marginGroups.set(key, arr);
    }

    let closestWin: { franchiseId: string; margin: number } | null = null;
    let biggestBlowoutWin: { franchiseId: string; margin: number } | null = null;
    const lossMarginsByFranchise = new Map<string, number[]>();

    for (const [, pair] of marginGroups) {
      if (pair.length !== 2) continue;
      const [a, b] = pair;
      const margin = Math.abs((a.points ?? 0) - (b.points ?? 0));
      const winner = a.isWinner ? a : b.isWinner ? b : null;
      const loser = a.isWinner ? b : b.isWinner ? a : null;
      if (winner) {
        if (!closestWin || margin < closestWin.margin) {
          closestWin = { franchiseId: winner.franchiseId, margin };
        }
        if (!biggestBlowoutWin || margin > biggestBlowoutWin.margin) {
          biggestBlowoutWin = { franchiseId: winner.franchiseId, margin };
        }
      }
      if (loser) {
        const arr = lossMarginsByFranchise.get(loser.franchiseId) ?? [];
        arr.push(margin);
        lossMarginsByFranchise.set(loser.franchiseId, arr);
      }
    }

    if (closestWin) {
      const f = franchiseLookup.get(closestWin.franchiseId);
      if (f) {
        push(
          "CARDIAC_CREW",
          f.franchiseName,
          f.franchiseSlug,
          `${closestWin.margin.toFixed(1)} pts`,
          "Closest win of the season"
        );
      }
    }

    if (biggestBlowoutWin) {
      const f = franchiseLookup.get(biggestBlowoutWin.franchiseId);
      if (f) {
        push(
          "MERCY_RULE",
          f.franchiseName,
          f.franchiseSlug,
          `${biggestBlowoutWin.margin.toFixed(1)} pts`,
          "Biggest blowout win of the season"
        );
      }
    }

    // Blowout Bait: worst average margin of defeat, min 3 losses so a single
    // early-season laugher doesn't crown a franchise that otherwise plays
    // close games.
    const MIN_LOSSES_FOR_BLOWOUT_BAIT = 3;
    let worstAvgLossMargin: { franchiseId: string; avgMargin: number; losses: number } | null =
      null;
    for (const [franchiseId, margins] of lossMarginsByFranchise) {
      if (margins.length < MIN_LOSSES_FOR_BLOWOUT_BAIT) continue;
      const avgMargin = margins.reduce((sum, m) => sum + m, 0) / margins.length;
      if (!worstAvgLossMargin || avgMargin > worstAvgLossMargin.avgMargin) {
        worstAvgLossMargin = { franchiseId, avgMargin, losses: margins.length };
      }
    }

    if (worstAvgLossMargin) {
      const f = franchiseLookup.get(worstAvgLossMargin.franchiseId);
      if (f) {
        push(
          "BLOWOUT_BAIT",
          f.franchiseName,
          f.franchiseSlug,
          `${worstAvgLossMargin.avgMargin.toFixed(1)} pts`,
          `Average margin of defeat across ${worstAvgLossMargin.losses} losses`
        );
      }
    }

    return result;
  } catch (e) {
    console.error("[superlatives] getSeasonSuperlatives error:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Coverage pass: guarantee every franchise appears in at least one superlative
// ---------------------------------------------------------------------------
//
// The primary awards (getSeasonSuperlatives + the lineup-efficiency awards) are
// competitive, so a quiet, middling franchise can end a season mentioned
// nowhere. On a surface whose whole promise is "find yourself in one tap", that
// leaves holes. This pass takes the set of franchise slugs ALREADY covered by
// those awards and hands every remaining franchise a fallback superlative drawn
// from a small pool of always-computable roasts. It never touches or overrides
// an existing winner; it only fills gaps.
//
// Assignment is deterministic and gives each gap a distinct flavor where it can:
//   1. Title Drought  -> the uncovered franchise with the longest ring drought
//   2. Punching Bag    -> among the rest, whoever conceded the most points this season
//   3. Wallflower      -> everyone still uncovered (the catch-all neutral roast)

export async function getUncoveredFranchiseAwards(
  seasonId: number,
  coveredSlugs: string[],
): Promise<SeasonSuperlative[]> {
  try {
    const covered = new Set(coveredSlugs);

    // This season's standings (identity + PA for the Punching Bag pick).
    const standings = await db
      .select({
        franchiseId: franchiseSeasons.franchiseId,
        franchiseName: franchises.name,
        franchiseSlug: franchises.slug,
        wins: franchiseSeasons.wins,
        losses: franchiseSeasons.losses,
        ties: franchiseSeasons.ties,
        pointsAgainst: franchiseSeasons.pointsAgainst,
      })
      .from(franchiseSeasons)
      .innerJoin(franchises, eq(franchiseSeasons.franchiseId, franchises.id))
      .where(eq(franchiseSeasons.seasonId, seasonId));

    const uncovered = standings.filter((s) => !covered.has(s.franchiseSlug));
    if (uncovered.length === 0) return [];

    // Career title-drought context: for every franchise, its completed-season
    // count and the most recent year it won a title (if ever). Drought is
    // measured against the newest completed season year in the league so a
    // franchise that skipped the latest year still reads sensibly.
    const historyRows = await db
      .select({
        franchiseId: franchiseSeasons.franchiseId,
        seasonYear: seasons.seasonYear,
        playoffResult: franchiseSeasons.playoffResult,
      })
      .from(franchiseSeasons)
      .innerJoin(seasons, eq(franchiseSeasons.seasonId, seasons.id))
      .where(eq(seasons.status, "complete"));

    let newestCompletedYear = 0;
    const seasonsCountByFranchise = new Map<string, number>();
    const lastTitleYearByFranchise = new Map<string, number>();
    for (const r of historyRows) {
      newestCompletedYear = Math.max(newestCompletedYear, r.seasonYear);
      seasonsCountByFranchise.set(
        r.franchiseId,
        (seasonsCountByFranchise.get(r.franchiseId) ?? 0) + 1,
      );
      if (r.playoffResult === "champion") {
        lastTitleYearByFranchise.set(
          r.franchiseId,
          Math.max(lastTitleYearByFranchise.get(r.franchiseId) ?? 0, r.seasonYear),
        );
      }
    }

    const droughtOf = (franchiseId: string): number => {
      const lastTitle = lastTitleYearByFranchise.get(franchiseId);
      // Never won: the drought is the length of their whole existence.
      if (!lastTitle) return seasonsCountByFranchise.get(franchiseId) ?? 0;
      return Math.max(0, newestCompletedYear - lastTitle);
    };

    const result: SeasonSuperlative[] = [];
    const assigned = new Set<string>();

    const pushAward = (
      key: keyof typeof SNARKY_LABELS,
      row: (typeof uncovered)[number],
      stat: string,
      context: string,
    ) => {
      const label = SNARKY_LABELS[key];
      result.push({
        labelKey: label.key,
        displayText: label.displayText,
        franchiseName: row.franchiseName,
        franchiseSlug: row.franchiseSlug,
        stat,
        context,
        tone: label.tone,
      });
      assigned.add(row.franchiseId);
    };

    // 1. Title Drought: longest ring drought among the uncovered.
    const remaining = () => uncovered.filter((u) => !assigned.has(u.franchiseId));
    const droughtPick = [...remaining()].sort(
      (a, b) => droughtOf(b.franchiseId) - droughtOf(a.franchiseId),
    )[0];
    if (droughtPick) {
      const neverWon = !lastTitleYearByFranchise.has(droughtPick.franchiseId);
      const yrs = droughtOf(droughtPick.franchiseId);
      pushAward(
        "LONGEST_DROUGHT",
        droughtPick,
        `${yrs} ${yrs === 1 ? "season" : "seasons"}`,
        neverWon
          ? "Seasons in the league, still zero rings"
          : "Seasons since their last and only glory",
      );
    }

    // 2. Punching Bag: most points conceded this season, among the rest.
    const paPick = [...remaining()]
      .filter((u) => Number(u.pointsAgainst ?? 0) > 0)
      .sort((a, b) => Number(b.pointsAgainst ?? 0) - Number(a.pointsAgainst ?? 0))[0];
    if (paPick) {
      pushAward(
        "PUNCHING_BAG",
        paPick,
        `${Number(paPick.pointsAgainst ?? 0).toFixed(1)} PA`,
        "Points conceded; the league's favorite matchup",
      );
    }

    // 3. Wallflower: the catch-all for anyone still uncovered.
    for (const row of remaining()) {
      const w = row.wins ?? 0;
      const l = row.losses ?? 0;
      const t = row.ties ?? 0;
      const rec = t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
      pushAward(
        "WALLFLOWER",
        row,
        rec,
        "Dodged every other superlative. Impressively unremarkable.",
      );
    }

    return result;
  } catch (e) {
    console.error("[superlatives] getUncoveredFranchiseAwards error:", e);
    return [];
  }
}
