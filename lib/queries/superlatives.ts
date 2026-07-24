import { db } from "@/lib/db";
import { matchups, franchises, franchiseSeasons, seasons } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { SNARKY_LABELS, type LabelTone } from "@/lib/content";
import { getAllSeasons, getLastCompletedSeason } from "@/lib/queries/seasons";
import { getSeasonLineupAwards } from "@/lib/queries/lineup-efficiency";

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

// ---------------------------------------------------------------------------
// Card assembly helpers: dedupe to one card per franchise, capped at 12
// ---------------------------------------------------------------------------

/**
 * Flattens award sources in priority order and dedupes by franchiseSlug so
 * each franchise renders exactly one card, capped at 12. Shared by both the
 * season-scoped and all-time card builders below.
 */
export function dedupeToTwelve(sources: SeasonSuperlative[][]): SeasonSuperlative[] {
  const seenSlugs = new Set<string>();
  const result: SeasonSuperlative[] = [];
  for (const source of sources) {
    for (const award of source) {
      if (seenSlugs.has(award.franchiseSlug)) continue;
      seenSlugs.add(award.franchiseSlug);
      result.push(award);
    }
  }
  result.splice(12);
  return result;
}

/**
 * Season-scoped superlative cards for the records page: the competitive
 * awards (getSeasonSuperlatives + both optimal-lineup awards), then the
 * coverage pass for any franchise none of those touched, deduped to one card
 * per franchise and capped at 12.
 */
export async function getSeasonSuperlativeCards(
  seasonId: number,
): Promise<SeasonSuperlative[]> {
  const [base, lineupAwards] = await Promise.all([
    getSeasonSuperlatives(seasonId),
    getSeasonLineupAwards(seasonId),
  ]);
  const coaching = lineupAwards?.coachingMalpractice ?? null;
  const couldve = lineupAwards?.whatCouldveBeen ?? null;

  const coveredSlugs = [
    ...base.map((s) => s.franchiseSlug),
    ...(coaching ? [coaching.franchiseSlug] : []),
    ...(couldve ? [couldve.franchiseSlug] : []),
  ];
  const coverage = await getUncoveredFranchiseAwards(seasonId, coveredSlugs);

  return dedupeToTwelve([base, coaching ? [coaching] : [], couldve ? [couldve] : [], coverage]);
}

// ---------------------------------------------------------------------------
// All-time superlatives: single-season extremes across league history
// ---------------------------------------------------------------------------

/**
 * All-time superlative cards: single-season extremes across every completed
 * season, with the year the record was set carried in the context string.
 * Reuses the SNARKY_LABELS already defined for the season-scoped awards
 * (including ALPHA_DOG and LEAGUE_DOORMAT, which the season-scoped builder
 * never uses); no new labels are introduced. Followed by an all-time coverage
 * pass and dedupeToTwelve so exactly one card per franchise renders, capped
 * at 12.
 */
export async function getAllTimeSuperlativeCards(): Promise<SeasonSuperlative[]> {
  try {
    const standingsRows = await db
      .select({
        franchiseId: franchiseSeasons.franchiseId,
        franchiseName: franchises.name,
        franchiseSlug: franchises.slug,
        wins: franchiseSeasons.wins,
        losses: franchiseSeasons.losses,
        ties: franchiseSeasons.ties,
        pointsScored: franchiseSeasons.pointsScored,
        pointsAgainst: franchiseSeasons.pointsAgainst,
        seasonId: franchiseSeasons.seasonId,
        seasonYear: seasons.seasonYear,
      })
      .from(franchiseSeasons)
      .innerJoin(franchises, eq(franchiseSeasons.franchiseId, franchises.id))
      .innerJoin(seasons, eq(franchiseSeasons.seasonId, seasons.id))
      .where(eq(seasons.status, "complete"));

    if (standingsRows.length === 0) return [];

    const result: SeasonSuperlative[] = [];

    const push = (
      key: keyof typeof SNARKY_LABELS,
      franchiseName: string,
      franchiseSlug: string,
      stat: string,
      context: string,
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

    const winPctOf = (r: (typeof standingsRows)[number]) => {
      const total = (r.wins ?? 0) + (r.losses ?? 0) + (r.ties ?? 0);
      return total > 0 ? ((r.wins ?? 0) + (r.ties ?? 0) * 0.5) / total : 0;
    };
    const recordOf = (r: (typeof standingsRows)[number]) =>
      `${r.wins ?? 0}-${r.losses ?? 0}${(r.ties ?? 0) > 0 ? `-${r.ties}` : ""}`;

    // Point Machine: highest single-season PF ever.
    const byPF = [...standingsRows].sort(
      (a, b) => (b.pointsScored ?? 0) - (a.pointsScored ?? 0),
    );
    if (byPF[0] && (byPF[0].pointsScored ?? 0) > 0) {
      const r = byPF[0];
      push(
        "POINT_MACHINE",
        r.franchiseName,
        r.franchiseSlug,
        `${(r.pointsScored ?? 0).toFixed(1)} PF`,
        `Most points scored in a season · ${r.seasonYear}`,
      );
    }

    // Iron Curtain: fewest single-season PA ever.
    const byPA = [...standingsRows]
      .filter((r) => (r.pointsAgainst ?? 0) > 0)
      .sort((a, b) => (a.pointsAgainst ?? 0) - (b.pointsAgainst ?? 0));
    if (byPA[0]) {
      const r = byPA[0];
      push(
        "IRON_CURTAIN",
        r.franchiseName,
        r.franchiseSlug,
        `${(r.pointsAgainst ?? 0).toFixed(1)} PA`,
        `Fewest points allowed in a season · ${r.seasonYear}`,
      );
    }

    // Alpha Dog: best single-season win% ever.
    const eligible = standingsRows.filter(
      (r) => (r.wins ?? 0) + (r.losses ?? 0) + (r.ties ?? 0) > 0,
    );
    const byBestWinPct = [...eligible].sort((a, b) => winPctOf(b) - winPctOf(a));
    if (byBestWinPct[0]) {
      const r = byBestWinPct[0];
      push(
        "ALPHA_DOG",
        r.franchiseName,
        r.franchiseSlug,
        recordOf(r),
        `Best single-season record in league history · ${r.seasonYear}`,
      );
    }

    // League Doormat: worst single-season win% ever.
    const byWorstWinPct = [...eligible].sort((a, b) => winPctOf(a) - winPctOf(b));
    if (byWorstWinPct[0]) {
      const r = byWorstWinPct[0];
      push(
        "LEAGUE_DOORMAT",
        r.franchiseName,
        r.franchiseSlug,
        recordOf(r),
        `Worst single-season record in league history · ${r.seasonYear}`,
      );
    }

    // Paper Tiger: most single-season PA ever.
    const byMostPA = [...standingsRows].sort(
      (a, b) => (b.pointsAgainst ?? 0) - (a.pointsAgainst ?? 0),
    );
    if (byMostPA[0] && (byMostPA[0].pointsAgainst ?? 0) > 0) {
      const r = byMostPA[0];
      push(
        "PAPER_TIGER",
        r.franchiseName,
        r.franchiseSlug,
        `${(r.pointsAgainst ?? 0).toFixed(1)} PA`,
        `Most points allowed in a season · ${r.seasonYear}`,
      );
    }

    // Glass Cannon: highest PF among sub-.500 seasons ever.
    const losingSeasons = eligible.filter(
      (r) => winPctOf(r) < 0.5 && (r.pointsScored ?? 0) > 0,
    );
    const byGlassCannon = [...losingSeasons].sort(
      (a, b) => (b.pointsScored ?? 0) - (a.pointsScored ?? 0),
    );
    if (byGlassCannon[0]) {
      const r = byGlassCannon[0];
      push(
        "GLASS_CANNON",
        r.franchiseName,
        r.franchiseSlug,
        `${(r.pointsScored ?? 0).toFixed(1)} PF`,
        `${(r.pointsScored ?? 0).toFixed(1)} PF but only ${recordOf(r)} · ${r.seasonYear}`,
      );
    }

    // Lookups shared by the streak/margin/malpractice awards below.
    const franchiseLookup = new Map<string, { name: string; slug: string }>();
    const seasonYearLookup = new Map<number, number>();
    for (const r of standingsRows) {
      if (!franchiseLookup.has(r.franchiseId)) {
        franchiseLookup.set(r.franchiseId, { name: r.franchiseName, slug: r.franchiseSlug });
      }
      seasonYearLookup.set(r.seasonId, r.seasonYear);
    }

    // On Fire / Rock Bottom: longest win/loss streak ever, per franchise per
    // season, then the max across every completed season.
    const gameRows = await db
      .select({
        franchiseId: matchups.franchiseId,
        seasonId: matchups.seasonId,
        week: matchups.week,
        isWinner: matchups.isWinner,
      })
      .from(matchups)
      .innerJoin(seasons, eq(matchups.seasonId, seasons.id))
      .where(
        and(
          eq(seasons.status, "complete"),
          eq(matchups.status, "complete"),
          eq(matchups.isPlayoff, false),
        ),
      )
      .orderBy(asc(matchups.week));

    const byFranchiseSeason = new Map<
      string,
      { franchiseId: string; seasonId: number; games: { week: number; isWinner: boolean | null }[] }
    >();
    for (const row of gameRows) {
      const key = `${row.franchiseId}:${row.seasonId}`;
      const bucket =
        byFranchiseSeason.get(key) ??
        { franchiseId: row.franchiseId, seasonId: row.seasonId, games: [] };
      bucket.games.push({ week: row.week, isWinner: row.isWinner });
      byFranchiseSeason.set(key, bucket);
    }

    let bestWinStreak: { franchiseId: string; seasonId: number; streak: number } | null = null;
    let worstLossStreak: { franchiseId: string; seasonId: number; streak: number } | null = null;

    for (const { franchiseId, seasonId, games } of byFranchiseSeason.values()) {
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
        bestWinStreak = { franchiseId, seasonId, streak: maxWin };
      }
      if (maxLoss > 0 && (!worstLossStreak || maxLoss > worstLossStreak.streak)) {
        worstLossStreak = { franchiseId, seasonId, streak: maxLoss };
      }
    }

    if (bestWinStreak) {
      const f = franchiseLookup.get(bestWinStreak.franchiseId);
      const year = seasonYearLookup.get(bestWinStreak.seasonId);
      if (f) {
        push(
          "ON_FIRE",
          f.name,
          f.slug,
          `${bestWinStreak.streak}W`,
          `Longest win streak in league history · ${year}`,
        );
      }
    }

    if (worstLossStreak) {
      const f = franchiseLookup.get(worstLossStreak.franchiseId);
      const year = seasonYearLookup.get(worstLossStreak.seasonId);
      if (f) {
        push(
          "ROCK_BOTTOM",
          f.name,
          f.slug,
          `${worstLossStreak.streak}L`,
          `Longest losing streak in league history · ${year}`,
        );
      }
    }

    // Mercy Rule / Cardiac Crew / Blowout Bait: margin awards computed from
    // every regular-season matchup ever played, paired by (season, week,
    // matchup).
    const marginRows = await db
      .select({
        matchupId: matchups.matchupId,
        franchiseId: matchups.franchiseId,
        seasonId: matchups.seasonId,
        week: matchups.week,
        points: matchups.points,
        isWinner: matchups.isWinner,
      })
      .from(matchups)
      .innerJoin(seasons, eq(matchups.seasonId, seasons.id))
      .where(
        and(
          eq(seasons.status, "complete"),
          eq(matchups.status, "complete"),
          eq(matchups.isPlayoff, false),
        ),
      );

    const marginGroups = new Map<string, typeof marginRows>();
    for (const row of marginRows) {
      const key = `${row.seasonId}:${row.week}:${row.matchupId}`;
      const arr = marginGroups.get(key) ?? [];
      arr.push(row);
      marginGroups.set(key, arr);
    }

    let closestWin: { franchiseId: string; seasonId: number; margin: number } | null = null;
    let biggestBlowoutWin: { franchiseId: string; seasonId: number; margin: number } | null = null;
    const lossMarginsByFranchiseSeason = new Map<string, number[]>();

    for (const [, pair] of marginGroups) {
      if (pair.length !== 2) continue;
      const [a, b] = pair;
      const margin = Math.abs((a.points ?? 0) - (b.points ?? 0));
      const winner = a.isWinner ? a : b.isWinner ? b : null;
      const loser = a.isWinner ? b : b.isWinner ? a : null;
      if (winner) {
        if (!closestWin || margin < closestWin.margin) {
          closestWin = { franchiseId: winner.franchiseId, seasonId: winner.seasonId, margin };
        }
        if (!biggestBlowoutWin || margin > biggestBlowoutWin.margin) {
          biggestBlowoutWin = { franchiseId: winner.franchiseId, seasonId: winner.seasonId, margin };
        }
      }
      if (loser) {
        const key = `${loser.franchiseId}:${loser.seasonId}`;
        const arr = lossMarginsByFranchiseSeason.get(key) ?? [];
        arr.push(margin);
        lossMarginsByFranchiseSeason.set(key, arr);
      }
    }

    if (closestWin) {
      const f = franchiseLookup.get(closestWin.franchiseId);
      const year = seasonYearLookup.get(closestWin.seasonId);
      if (f) {
        push(
          "CARDIAC_CREW",
          f.name,
          f.slug,
          `${closestWin.margin.toFixed(1)} pts`,
          `Closest win in league history · ${year}`,
        );
      }
    }

    if (biggestBlowoutWin) {
      const f = franchiseLookup.get(biggestBlowoutWin.franchiseId);
      const year = seasonYearLookup.get(biggestBlowoutWin.seasonId);
      if (f) {
        push(
          "MERCY_RULE",
          f.name,
          f.slug,
          `${biggestBlowoutWin.margin.toFixed(1)} pts`,
          `Biggest blowout win in league history · ${year}`,
        );
      }
    }

    // Blowout Bait: worst average margin of defeat in a single season, min 3
    // losses that season (mirrors the season-scoped guard).
    const MIN_LOSSES_FOR_BLOWOUT_BAIT = 3;
    let worstAvgLossMargin:
      | { franchiseId: string; seasonId: number; avgMargin: number; losses: number }
      | null = null;
    for (const [key, margins] of lossMarginsByFranchiseSeason) {
      if (margins.length < MIN_LOSSES_FOR_BLOWOUT_BAIT) continue;
      const avgMargin = margins.reduce((sum, m) => sum + m, 0) / margins.length;
      if (!worstAvgLossMargin || avgMargin > worstAvgLossMargin.avgMargin) {
        const [franchiseId, seasonIdStr] = key.split(":");
        worstAvgLossMargin = {
          franchiseId,
          seasonId: Number(seasonIdStr),
          avgMargin,
          losses: margins.length,
        };
      }
    }

    if (worstAvgLossMargin) {
      const f = franchiseLookup.get(worstAvgLossMargin.franchiseId);
      const year = seasonYearLookup.get(worstAvgLossMargin.seasonId);
      if (f) {
        push(
          "BLOWOUT_BAIT",
          f.name,
          f.slug,
          `${worstAvgLossMargin.avgMargin.toFixed(1)} pts`,
          `Worst average margin of defeat across a season (${worstAvgLossMargin.losses} losses) · ${year}`,
        );
      }
    }

    // Coaching Malpractice: the biggest single-season bench-gap ever, across
    // every completed Sleeper season (legacy seasons have no lineup data and
    // simply return null).
    const completedSeasons = (await getAllSeasons()).filter((s) => s.status === "complete");
    const malpracticeResults = await Promise.all(
      completedSeasons.map(async (s) => ({
        seasonYear: s.seasonYear,
        awards: await getSeasonLineupAwards(s.id),
      })),
    );
    let bestMalpractice: { franchiseName: string; franchiseSlug: string; stat: string; seasonYear: number; gap: number } | null =
      null;
    for (const { seasonYear, awards } of malpracticeResults) {
      const coaching = awards?.coachingMalpractice;
      if (!coaching) continue;
      const gap = parseFloat(coaching.stat);
      if (Number.isNaN(gap)) continue;
      if (!bestMalpractice || gap > bestMalpractice.gap) {
        bestMalpractice = {
          franchiseName: coaching.franchiseName,
          franchiseSlug: coaching.franchiseSlug,
          stat: coaching.stat,
          seasonYear,
          gap,
        };
      }
    }
    if (bestMalpractice) {
      push(
        "COACHING_MALPRACTICE",
        bestMalpractice.franchiseName,
        bestMalpractice.franchiseSlug,
        bestMalpractice.stat,
        `Most points left on the bench across a season · ${bestMalpractice.seasonYear}`,
      );
    }

    const coveredSlugs = result.map((s) => s.franchiseSlug);
    const coverage = await getAllTimeUncoveredFranchiseAwards(coveredSlugs);

    return dedupeToTwelve([result, coverage]);
  } catch (e) {
    console.error("[superlatives] getAllTimeSuperlativeCards error:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// All-time coverage pass: guarantee every franchise appears in at least one
// all-time superlative
// ---------------------------------------------------------------------------
//
// Mirrors getUncoveredFranchiseAwards, but scored across every completed
// season rather than one. Franchise universe is the 12 franchises of the
// latest completed season, so a franchise that folded before the league's
// most recent season never shows up as an unfilled gap.

export async function getAllTimeUncoveredFranchiseAwards(
  coveredSlugs: string[],
): Promise<SeasonSuperlative[]> {
  try {
    const covered = new Set(coveredSlugs);

    const latestCompleted = await getLastCompletedSeason();
    if (!latestCompleted) return [];

    const universe = await db
      .select({
        franchiseId: franchiseSeasons.franchiseId,
        franchiseName: franchises.name,
        franchiseSlug: franchises.slug,
      })
      .from(franchiseSeasons)
      .innerJoin(franchises, eq(franchiseSeasons.franchiseId, franchises.id))
      .where(eq(franchiseSeasons.seasonId, latestCompleted.id));

    const uncovered = universe.filter((u) => !covered.has(u.franchiseSlug));
    if (uncovered.length === 0) return [];

    // Career aggregates (record, PA, title history) across every completed
    // season, for the title-drought, Punching Bag, and Wallflower fallbacks.
    const careerRows = await db
      .select({
        franchiseId: franchiseSeasons.franchiseId,
        seasonYear: seasons.seasonYear,
        wins: franchiseSeasons.wins,
        losses: franchiseSeasons.losses,
        ties: franchiseSeasons.ties,
        pointsAgainst: franchiseSeasons.pointsAgainst,
        playoffResult: franchiseSeasons.playoffResult,
      })
      .from(franchiseSeasons)
      .innerJoin(seasons, eq(franchiseSeasons.seasonId, seasons.id))
      .where(eq(seasons.status, "complete"));

    let newestCompletedYear = 0;
    const careerByFranchise = new Map<
      string,
      { wins: number; losses: number; ties: number; pointsAgainst: number; seasonsCount: number }
    >();
    const lastTitleYearByFranchise = new Map<string, number>();
    for (const r of careerRows) {
      newestCompletedYear = Math.max(newestCompletedYear, r.seasonYear);
      const acc =
        careerByFranchise.get(r.franchiseId) ??
        { wins: 0, losses: 0, ties: 0, pointsAgainst: 0, seasonsCount: 0 };
      acc.wins += r.wins ?? 0;
      acc.losses += r.losses ?? 0;
      acc.ties += r.ties ?? 0;
      acc.pointsAgainst += r.pointsAgainst ?? 0;
      acc.seasonsCount += 1;
      careerByFranchise.set(r.franchiseId, acc);
      if (r.playoffResult === "champion") {
        lastTitleYearByFranchise.set(
          r.franchiseId,
          Math.max(lastTitleYearByFranchise.get(r.franchiseId) ?? 0, r.seasonYear),
        );
      }
    }

    const droughtOf = (franchiseId: string): number => {
      const lastTitle = lastTitleYearByFranchise.get(franchiseId);
      if (!lastTitle) return careerByFranchise.get(franchiseId)?.seasonsCount ?? 0;
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

    const remaining = () => uncovered.filter((u) => !assigned.has(u.franchiseId));

    // 1. Longest Drought (already all-time): longest ring drought among the uncovered.
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

    // 2. Punching Bag: most career points conceded, among the rest.
    const paPick = [...remaining()]
      .filter((u) => (careerByFranchise.get(u.franchiseId)?.pointsAgainst ?? 0) > 0)
      .sort(
        (a, b) =>
          (careerByFranchise.get(b.franchiseId)?.pointsAgainst ?? 0) -
          (careerByFranchise.get(a.franchiseId)?.pointsAgainst ?? 0),
      )[0];
    if (paPick) {
      const pa = careerByFranchise.get(paPick.franchiseId)?.pointsAgainst ?? 0;
      pushAward(
        "PUNCHING_BAG",
        paPick,
        `${pa.toFixed(1)} PA`,
        "Career points conceded; the league's favorite matchup",
      );
    }

    // 3. Wallflower: catch-all for anyone still uncovered, career record as stat.
    for (const row of remaining()) {
      const acc = careerByFranchise.get(row.franchiseId);
      const w = acc?.wins ?? 0;
      const l = acc?.losses ?? 0;
      const t = acc?.ties ?? 0;
      const rec = t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
      pushAward(
        "WALLFLOWER",
        row,
        rec,
        "Dodged every other superlative, career-long. Impressively unremarkable.",
      );
    }

    return result;
  } catch (e) {
    console.error("[superlatives] getAllTimeUncoveredFranchiseAwards error:", e);
    return [];
  }
}
