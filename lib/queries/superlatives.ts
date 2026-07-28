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
        "The league's favorite target."
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
// Truthful backfill: genuine awards only, toward the 6-card view cap
// ---------------------------------------------------------------------------
//
// The primary awards (getSeasonSuperlatives + the lineup-efficiency awards)
// rarely fill all MAX_SUPERLATIVE_CARDS slots by themselves, so each view
// backfills from a pool of additional generally-defined awards. Every pool
// def is a real superlative whose claim is a true league-wide statement; a
// def renders only when its genuine leader holds no higher-priority award,
// and is never handed to a runner-up. It is fine for a franchise to have no
// superlative; no view pads with participation trophies.

/** Minimum shape every backfill-pool candidate needs for assignBackfillAwards. */
export interface CoverageProfile {
  franchiseId: string;
  franchiseName: string;
  franchiseSlug: string;
  /** Games played; gates record-based awards like The Nearly Man. */
  games: number;
}

/**
 * One entry in a priority-ordered backfill pool. `score` returns null when a
 * candidate is ineligible for this award. Ties break by the candidates'
 * pre-sort order (franchiseId), so results stay deterministic run to run.
 */
export interface CoverageAwardDef<T extends CoverageProfile> {
  key: keyof typeof SNARKY_LABELS;
  score: (profile: T) => number | null;
  stat: (profile: T) => string;
  context: (profile: T) => string;
}

/**
 * Truthful backfill: walks a priority-ordered award pool and, for each award,
 * finds the genuine leader across ALL candidate profiles (not just the
 * eligible ones), so every card's claim is a true league-wide statement. The
 * award renders only when that true leader is still eligible (in the view's
 * universe and not already holding a higher-priority card); otherwise the def
 * is skipped entirely, never handed to a runner-up. Each award is used at
 * most once, each franchise receives at most one. No participation trophies:
 * franchises left without a genuine award simply get no card.
 */
export function assignBackfillAwards<T extends CoverageProfile>(
  profiles: T[],
  defs: CoverageAwardDef<T>[],
  eligibleSlugs: Set<string>,
): SeasonSuperlative[] {
  const sorted = [...profiles].sort((a, b) => a.franchiseId.localeCompare(b.franchiseId));
  const assigned = new Set<string>();
  const result: SeasonSuperlative[] = [];

  for (const def of defs) {
    let best: T | null = null;
    let bestScore = -Infinity;
    for (const profile of sorted) {
      const score = def.score(profile);
      if (score === null) continue;
      if (score > bestScore) {
        bestScore = score;
        best = profile;
      }
    }
    if (!best) continue;
    // The true leader is the only valid recipient. If they already hold a
    // card (or sit outside the view universe), the claim cannot render
    // truthfully on anyone else, so the def sits out.
    if (!eligibleSlugs.has(best.franchiseSlug) || assigned.has(best.franchiseId)) continue;

    const label = SNARKY_LABELS[def.key];
    result.push({
      labelKey: label.key,
      displayText: label.displayText,
      franchiseName: best.franchiseName,
      franchiseSlug: best.franchiseSlug,
      stat: def.stat(best),
      context: def.context(best),
      tone: label.tone,
    });
    assigned.add(best.franchiseId);
  }

  return result;
}

const CLOSE_GAME_MARGIN = 5;

interface FranchiseCoverageProfile extends CoverageProfile {
  wins: number;
  losses: number;
  ties: number;
  weekScores: number[];
  maxWeek: number;
  minWeek: number;
  stdDev: number;
  closeGames: number;
  highestScoringLoss: number | null;
  lowestScoringWin: number | null;
  allPlayWinPct: number;
}

function winPctOf(wins: number, losses: number, ties: number): number {
  const total = wins + losses + ties;
  return total > 0 ? (wins + ties * 0.5) / total : 0;
}

const PER_SEASON_COVERAGE_DEFS: CoverageAwardDef<FranchiseCoverageProfile>[] = [
  {
    key: "HEARTBREAKER",
    score: (p) => p.highestScoringLoss,
    stat: (p) => `${p.highestScoringLoss!.toFixed(1)} pts`,
    context: () => "The highest-scoring loss of the season.",
  },
  {
    key: "STICK_UP",
    score: (p) => (p.lowestScoringWin != null ? -p.lowestScoringWin : null),
    stat: (p) => `${p.lowestScoringWin!.toFixed(1)} pts`,
    context: () => "The league's ugliest winning total.",
  },
  {
    key: "SWEAT_MERCHANT",
    score: (p) => (p.closeGames > 0 ? p.closeGames : null),
    stat: (p) => `${p.closeGames} games`,
    context: () => "More one-possession finishes than anyone.",
  },
  {
    key: "HORSESHOE",
    score: (p) => {
      const expectedWins = p.allPlayWinPct * (p.wins + p.losses + p.ties);
      const actualWins = p.wins + 0.5 * p.ties;
      const diff = actualWins - expectedWins;
      return expectedWins > 0 && diff > 0.5 ? diff : null;
    },
    stat: (p) => {
      const expectedWins = p.allPlayWinPct * (p.wins + p.losses + p.ties);
      const actualWins = p.wins + 0.5 * p.ties;
      return `+${(actualWins - expectedWins).toFixed(1)} W`;
    },
    context: () => "Won more than the scores earned. Lucky.",
  },
  {
    key: "SNAKEBIT",
    score: (p) => {
      const expectedWins = p.allPlayWinPct * (p.wins + p.losses + p.ties);
      const actualWins = p.wins + 0.5 * p.ties;
      const diff = expectedWins - actualWins;
      return diff > 0.5 ? diff : null;
    },
    stat: (p) => {
      const expectedWins = p.allPlayWinPct * (p.wins + p.losses + p.ties);
      const actualWins = p.wins + 0.5 * p.ties;
      return `${(expectedWins - actualWins).toFixed(1)} W short`;
    },
    context: () => "Lost more than the scores deserved.",
  },
  {
    key: "BOOM_GAME",
    score: (p) => (p.maxWeek > 0 ? p.maxWeek : null),
    stat: (p) => `${p.maxWeek.toFixed(1)} pts`,
    context: () => "Season-high week. Briefly unstoppable.",
  },
  {
    key: "NO_SHOW",
    score: (p) => (p.minWeek > 0 ? -p.minWeek : null),
    stat: (p) => `${p.minWeek.toFixed(1)} pts`,
    context: () => "The quietest week of the year.",
  },
  {
    key: "WHIPLASH",
    score: (p) => (p.stdDev > 0 ? p.stdDev : null),
    stat: (p) => `${p.stdDev.toFixed(1)} pts`,
    context: () => "Ceiling of a contender, floor of a dumpster.",
  },
  {
    key: "METRONOME",
    score: (p) => (p.stdDev > 0 ? -p.stdDev : null),
    stat: (p) => `${p.stdDev.toFixed(1)} pts`,
    context: () => "Same score every week, basically.",
  },
  {
    key: "ALPHA_DOG",
    score: (p) => (p.wins > 0 ? winPctOf(p.wins, p.losses, p.ties) : null),
    stat: (p) => `${p.wins}-${p.losses}${p.ties > 0 ? `-${p.ties}` : ""}`,
    context: () => "Best record in the league. Simple as that.",
  },
  {
    key: "LEAGUE_DOORMAT",
    score: (p) => (p.losses > 0 ? -winPctOf(p.wins, p.losses, p.ties) : null),
    stat: (p) => `${p.losses} L`,
    context: (p) => `League-worst record at ${p.wins}-${p.losses}${p.ties > 0 ? `-${p.ties}` : ""}`,
  },
];

/**
 * Truthful per-season backfill toward the MAX_SUPERLATIVE_CARDS cap: each
 * pool def is a genuine within-season award (highest single week, most
 * one-possession games, ...) computed across ALL franchises; a def renders
 * only when its true leader holds no higher-priority award. Never pads with
 * participation labels.
 */
export async function getUncoveredFranchiseAwards(
  seasonId: number,
  coveredSlugs: string[],
): Promise<SeasonSuperlative[]> {
  try {
    const covered = new Set(coveredSlugs);

    // standings and matchupRows are independent queries (both scoped to
    // seasonId, neither depends on the other's result), so they run
    // concurrently.
    const [standings, matchupRows] = await Promise.all([
      db
        .select({
          franchiseId: franchiseSeasons.franchiseId,
          franchiseName: franchises.name,
          franchiseSlug: franchises.slug,
          wins: franchiseSeasons.wins,
          losses: franchiseSeasons.losses,
          ties: franchiseSeasons.ties,
        })
        .from(franchiseSeasons)
        .innerJoin(franchises, eq(franchiseSeasons.franchiseId, franchises.id))
        .where(eq(franchiseSeasons.seasonId, seasonId)),
      db
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
            eq(matchups.isPlayoff, false),
          ),
        ),
    ]);

    if (standings.length === 0) return [];

    const byFranchise = new Map<string, typeof matchupRows>();
    for (const row of matchupRows) {
      const arr = byFranchise.get(row.franchiseId) ?? [];
      arr.push(row);
      byFranchise.set(row.franchiseId, arr);
    }

    // Pairs by (week, matchupId) power the one-possession-game count.
    const pairGroups = new Map<string, typeof matchupRows>();
    for (const row of matchupRows) {
      const key = `${row.week}:${row.matchupId}`;
      const arr = pairGroups.get(key) ?? [];
      arr.push(row);
      pairGroups.set(key, arr);
    }
    const closeGamesByFranchise = new Map<string, number>();
    for (const [, pair] of pairGroups) {
      if (pair.length !== 2) continue;
      const [a, b] = pair;
      const margin = Math.abs((a.points ?? 0) - (b.points ?? 0));
      if (margin < CLOSE_GAME_MARGIN) {
        closeGamesByFranchise.set(a.franchiseId, (closeGamesByFranchise.get(a.franchiseId) ?? 0) + 1);
        closeGamesByFranchise.set(b.franchiseId, (closeGamesByFranchise.get(b.franchiseId) ?? 0) + 1);
      }
    }

    // All-play win pct: every franchise's score compared against every other
    // franchise's score in the same week, not just its own opponent.
    const weekGroups = new Map<number, typeof matchupRows>();
    for (const row of matchupRows) {
      const arr = weekGroups.get(row.week) ?? [];
      arr.push(row);
      weekGroups.set(row.week, arr);
    }
    const allPlayWinsByFranchise = new Map<string, number>();
    const allPlayGamesByFranchise = new Map<string, number>();
    for (const [, entries] of weekGroups) {
      for (const entry of entries) {
        let wins = 0;
        for (const other of entries) {
          if (other.franchiseId === entry.franchiseId) continue;
          const ep = entry.points ?? 0;
          const op = other.points ?? 0;
          if (ep > op) wins += 1;
          else if (ep === op) wins += 0.5;
        }
        allPlayWinsByFranchise.set(
          entry.franchiseId,
          (allPlayWinsByFranchise.get(entry.franchiseId) ?? 0) + wins,
        );
        allPlayGamesByFranchise.set(
          entry.franchiseId,
          (allPlayGamesByFranchise.get(entry.franchiseId) ?? 0) + (entries.length - 1),
        );
      }
    }

    const profiles: FranchiseCoverageProfile[] = standings.map((s) => {
      const games = byFranchise.get(s.franchiseId) ?? [];
      const weekScores = games.map((g) => g.points ?? 0);
      const maxWeek = weekScores.length > 0 ? Math.max(...weekScores) : 0;
      const minWeek = weekScores.length > 0 ? Math.min(...weekScores) : 0;
      const mean =
        weekScores.length > 0 ? weekScores.reduce((sum, v) => sum + v, 0) / weekScores.length : 0;
      const stdDev =
        weekScores.length > 0
          ? Math.sqrt(
              weekScores.reduce((sum, v) => sum + (v - mean) ** 2, 0) / weekScores.length,
            )
          : 0;
      const lossScores = games.filter((g) => g.isWinner === false).map((g) => g.points ?? 0);
      const winScores = games.filter((g) => g.isWinner === true).map((g) => g.points ?? 0);
      const allPlayWins = allPlayWinsByFranchise.get(s.franchiseId) ?? 0;
      const allPlayGames = allPlayGamesByFranchise.get(s.franchiseId) ?? 0;

      return {
        franchiseId: s.franchiseId,
        franchiseName: s.franchiseName,
        franchiseSlug: s.franchiseSlug,
        wins: s.wins ?? 0,
        losses: s.losses ?? 0,
        ties: s.ties ?? 0,
        games: (s.wins ?? 0) + (s.losses ?? 0) + (s.ties ?? 0),
        weekScores,
        maxWeek,
        minWeek,
        stdDev,
        closeGames: closeGamesByFranchise.get(s.franchiseId) ?? 0,
        highestScoringLoss: lossScores.length > 0 ? Math.max(...lossScores) : null,
        lowestScoringWin: winScores.length > 0 ? Math.min(...winScores) : null,
        allPlayWinPct: allPlayGames > 0 ? allPlayWins / allPlayGames : 0,
      };
    });

    const eligible = new Set(
      profiles.map((p) => p.franchiseSlug).filter((slug) => !covered.has(slug)),
    );
    if (eligible.size === 0) return [];

    return assignBackfillAwards(profiles, PER_SEASON_COVERAGE_DEFS, eligible);
  } catch (e) {
    console.error("[superlatives] getUncoveredFranchiseAwards error:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Card assembly helpers: dedupe to one card per franchise, capped at 6
// ---------------------------------------------------------------------------

/** Maximum superlative cards per view (season tab, All-Time, hub module). */
export const MAX_SUPERLATIVE_CARDS = 6;

/**
 * Flattens award sources in priority order and dedupes by franchiseSlug so
 * each franchise renders at most one card, capped at MAX_SUPERLATIVE_CARDS.
 * Shared by both the season-scoped and all-time card builders below. Fewer
 * than the cap is a valid result; no view pads with participation awards.
 */
export function dedupeToSix(sources: SeasonSuperlative[][]): SeasonSuperlative[] {
  const seenSlugs = new Set<string>();
  const result: SeasonSuperlative[] = [];
  for (const source of sources) {
    for (const award of source) {
      if (seenSlugs.has(award.franchiseSlug)) continue;
      seenSlugs.add(award.franchiseSlug);
      result.push(award);
    }
  }
  result.splice(MAX_SUPERLATIVE_CARDS);
  return result;
}

/**
 * Season-scoped superlative cards for the records page and hub: the primary
 * awards (getSeasonSuperlatives + both optimal-lineup awards), then truthful
 * backfill from the per-season pool, deduped to one card per franchise and
 * capped at MAX_SUPERLATIVE_CARDS. Every card is a true within-season claim.
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

  return dedupeToSix([base, coaching ? [coaching] : [], couldve ? [couldve] : [], coverage]);
}

// ---------------------------------------------------------------------------
// All-time superlatives: single-season extremes across league history
// ---------------------------------------------------------------------------

/**
 * All-time superlative cards: single-season extremes across every completed
 * season, with the year the record was set carried in the context string.
 * Reuses the SNARKY_LABELS already defined for the season-scoped awards
 * (including ALPHA_DOG and LEAGUE_DOORMAT, which the season-scoped builder
 * never uses); no new labels are introduced. Followed by the truth-gated
 * all-time career awards and dedupeToSix so at most one card per franchise
 * renders, capped at MAX_SUPERLATIVE_CARDS. Franchises with no genuine award
 * get no card; fewer than the cap is a valid result.
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
        `Best single-season record ever · ${r.seasonYear}`,
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
        `Worst single-season record ever · ${r.seasonYear}`,
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
    // season, then the max across every completed season. gameRows and
    // marginRows below are independent full-history matchup queries (neither
    // depends on the other's result, nor on standingsRows/franchiseLookup
    // already in hand), so both run concurrently.
    const [gameRows, marginRows] = await Promise.all([
      db
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
        .orderBy(asc(matchups.week)),
      db
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
        ),
    ]);

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
    // matchup). marginRows was already fetched above alongside gameRows.
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
          `Worst average defeat margin in a season · ${year}`,
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
        `Most bench points wasted in a season · ${bestMalpractice.seasonYear}`,
      );
    }

    const coveredSlugs = result.map((s) => s.franchiseSlug);
    const coverage = await getAllTimeUncoveredFranchiseAwards(coveredSlugs);

    return dedupeToSix([result, coverage]);
  } catch (e) {
    console.error("[superlatives] getAllTimeSuperlativeCards error:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// All-time career awards: genuine league-wide claims only
// ---------------------------------------------------------------------------
//
// Every def here is a genuine, generally-defined award whose claim is a true
// league-wide statement, truth-gated against ALL franchises in league
// history. If the true leader already holds a higher-priority award (or is a
// folded franchise), the def simply does not appear; it is never reassigned
// to a runner-up. No participation trophies; the only hard constraints are
// one card per franchise and the MAX_SUPERLATIVE_CARDS view cap.

interface AllTimeCoverageProfile extends CoverageProfile {
  careerWins: number;
  careerLosses: number;
  careerTies: number;
  careerPA: number;
  careerPF: number;
  neverWonTitle: boolean;
}

/** Career totals for one franchise, used to truth-gate absolute-claim awards. */
const ALL_TIME_COVERAGE_DEFS: CoverageAwardDef<AllTimeCoverageProfile>[] = [
  {
    key: "EMPTY_CALORIES",
    // assignBackfillAwards truth-gates this: it only ever renders on the
    // actual league-wide PF-without-a-ring leader.
    score: (p) => (p.neverWonTitle && p.careerPF > 0 ? p.careerPF : null),
    stat: (p) => `${p.careerPF.toFixed(1)} PF`,
    context: () => "Most points ever banked. Still zero rings.",
  },
  {
    key: "PUNCHING_BAG",
    // Truth-gated by assignBackfillAwards: the actual career PA leader only.
    score: (p) => (p.careerPA > 0 ? p.careerPA : null),
    stat: (p) => `${p.careerPA.toFixed(1)} PA`,
    context: () => "Most points ever conceded. Favorite target.",
  },
  {
    key: "NEARLY_MAN",
    // Truth-gated by assignBackfillAwards: the copy is an absolute claim, so
    // only the actual best career record among never-champions receives it.
    score: (p) =>
      p.neverWonTitle && p.games > 0
        ? winPctOf(p.careerWins, p.careerLosses, p.careerTies)
        : null,
    stat: (p) => `${p.careerWins}-${p.careerLosses}${p.careerTies > 0 ? `-${p.careerTies}` : ""}`,
    context: () => "Best career record never to lift the trophy.",
  },
];

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

    const eligible = new Set(
      universe.map((u) => u.franchiseSlug).filter((slug) => !covered.has(slug)),
    );
    if (eligible.size === 0) return [];

    // Career aggregates (record, PF/PA, title history) across every completed
    // season and EVERY franchise, including folded ones: the truth gate must
    // consider the whole league's history, not just the current 12.
    const careerRows = await db
      .select({
        franchiseId: franchiseSeasons.franchiseId,
        franchiseName: franchises.name,
        franchiseSlug: franchises.slug,
        wins: franchiseSeasons.wins,
        losses: franchiseSeasons.losses,
        ties: franchiseSeasons.ties,
        pointsFor: franchiseSeasons.pointsScored,
        pointsAgainst: franchiseSeasons.pointsAgainst,
        playoffResult: franchiseSeasons.playoffResult,
      })
      .from(franchiseSeasons)
      .innerJoin(franchises, eq(franchiseSeasons.franchiseId, franchises.id))
      .innerJoin(seasons, eq(franchiseSeasons.seasonId, seasons.id))
      .where(eq(seasons.status, "complete"));

    const careerByFranchise = new Map<
      string,
      {
        franchiseName: string;
        franchiseSlug: string;
        wins: number;
        losses: number;
        ties: number;
        pointsFor: number;
        pointsAgainst: number;
      }
    >();
    const everWonTitle = new Set<string>();
    for (const r of careerRows) {
      const acc = careerByFranchise.get(r.franchiseId) ?? {
        franchiseName: r.franchiseName,
        franchiseSlug: r.franchiseSlug,
        wins: 0,
        losses: 0,
        ties: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      };
      acc.wins += r.wins ?? 0;
      acc.losses += r.losses ?? 0;
      acc.ties += r.ties ?? 0;
      acc.pointsFor += r.pointsFor ?? 0;
      acc.pointsAgainst += r.pointsAgainst ?? 0;
      careerByFranchise.set(r.franchiseId, acc);
      if (r.playoffResult === "champion") {
        everWonTitle.add(r.franchiseId);
      }
    }

    // Profiles cover EVERY franchise with league history so the leader search
    // is honest; assignBackfillAwards only renders a card when the true
    // leader is in `eligible` (current universe, no higher-priority award).
    const profiles: AllTimeCoverageProfile[] = Array.from(
      careerByFranchise,
      ([franchiseId, acc]) => ({
        franchiseId,
        franchiseName: acc.franchiseName,
        franchiseSlug: acc.franchiseSlug,
        games: acc.wins + acc.losses + acc.ties,
        careerWins: acc.wins,
        careerLosses: acc.losses,
        careerTies: acc.ties,
        careerPA: acc.pointsAgainst,
        careerPF: acc.pointsFor,
        neverWonTitle: !everWonTitle.has(franchiseId),
      }),
    );

    return assignBackfillAwards(profiles, ALL_TIME_COVERAGE_DEFS, eligible);
  } catch (e) {
    console.error("[superlatives] getAllTimeUncoveredFranchiseAwards error:", e);
    return [];
  }
}
