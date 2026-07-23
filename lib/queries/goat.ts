import { db } from "@/lib/db";
import { franchises, franchiseSeasons, seasons } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getLatestAvatarUrls } from "@/lib/queries/franchise-avatars";
import {
  selectGoatBlurb,
  type GoatArchetype,
} from "@/lib/goat-content";

// ---------------------------------------------------------------------------
// GOAT Ladder: all-time franchise ranking (1..N)
// ---------------------------------------------------------------------------
//
// A single composite "GOAT score" in [0,1] blends five defensible components,
// each normalized to [0,1] before weighting so no single raw scale dominates.
// The weights are surfaced on the page as a methodology footnote so the roast
// stays arguable rather than arbitrary.
//
//   goatScore =
//       0.32 * careerWinPct        (win rate over all completed games; ties = 0.5)
//     + 0.22 * ringShare           (titles / most titles in the league)
//     + 0.16 * playoffRate         (share of seasons that reached the bracket)
//     + 0.15 * pointsShare         (all-time points-for, min-max across the league)
//     + 0.15 * recentForm          (win% of the last 3 seasons, recency-weighted)
//
// careerWinPct, playoffRate and recentForm are already rates in [0,1]. ringShare
// and pointsShare are normalized across the league here (ringShare guards to 0
// when nobody has a title; pointsShare guards to a neutral 0.5 when every
// franchise is equal). Cumulative points is deliberately the lightest counting
// stat and is capped at 15% so a newer franchise with fewer games is not buried
// purely for having played less football.

export const GOAT_WEIGHTS = Object.freeze({
  careerWinPct: 0.32,
  championships: 0.22,
  playoffRate: 0.16,
  careerPoints: 0.15,
  recentForm: 0.15,
});

const RECENT_WINDOW = 3;
const RECENT_DECAY = 0.5;

// Playoff results that count as "made the bracket". consolation / toilet_bowl
// are the losers' brackets, i.e. a missed postseason, so they do not count.
const PLAYOFF_APPEARANCE_RESULTS = new Set([
  "champion",
  "runner_up",
  "made_playoffs",
]);

export interface GoatSeasonInput {
  seasonYear: number;
  wins: number;
  losses: number;
  ties: number;
  pointsScored: number;
  playoffResult: string | null;
}

export interface GoatFranchiseInput {
  franchiseId: string;
  seasons: GoatSeasonInput[];
}

export interface GoatScoreResult {
  franchiseId: string;
  rank: number;
  goatScore: number; // 0..1
  // Career aggregates.
  wins: number;
  losses: number;
  ties: number;
  championships: number;
  pointsScored: number;
  seasonsPlayed: number;
  playoffAppearances: number;
  winPct: number; // 0..1
  playoffRate: number; // 0..1
  recentForm: number; // 0..1
  // Component sub-scores (already weighted-in via goatScore; exposed for debug).
  pointsRank: number; // 1 = most all-time points
}

/**
 * Pure, DB-free GOAT calculator. Normalizes ring count and all-time points
 * across the whole field internally, so it needs every franchise at once.
 */
export function computeGoatScores(
  inputs: GoatFranchiseInput[],
): GoatScoreResult[] {
  const perFranchise = inputs.map((f) => {
    let wins = 0;
    let losses = 0;
    let ties = 0;
    let pointsScored = 0;
    let championships = 0;
    let playoffAppearances = 0;

    for (const s of f.seasons) {
      wins += s.wins;
      losses += s.losses;
      ties += s.ties;
      pointsScored += s.pointsScored;
      if (s.playoffResult === "champion") championships++;
      if (s.playoffResult && PLAYOFF_APPEARANCE_RESULTS.has(s.playoffResult)) {
        playoffAppearances++;
      }
    }

    const games = wins + losses + ties;
    const winPct = games > 0 ? (wins + ties * 0.5) / games : 0;
    const seasonsPlayed = f.seasons.length;
    const playoffRate = seasonsPlayed > 0 ? playoffAppearances / seasonsPlayed : 0;

    // Recent form: win% of the last RECENT_WINDOW seasons, weighted so the most
    // recent season counts most (exponential decay, normalized per franchise).
    const recent = [...f.seasons]
      .sort((a, b) => b.seasonYear - a.seasonYear)
      .slice(0, RECENT_WINDOW);
    let recentAcc = 0;
    let recentWeightSum = 0;
    recent.forEach((s, i) => {
      const g = s.wins + s.losses + s.ties;
      const wp = g > 0 ? (s.wins + s.ties * 0.5) / g : 0;
      const weight = Math.pow(RECENT_DECAY, i);
      recentAcc += weight * wp;
      recentWeightSum += weight;
    });
    const recentForm = recentWeightSum > 0 ? recentAcc / recentWeightSum : 0;

    return {
      franchiseId: f.franchiseId,
      wins,
      losses,
      ties,
      pointsScored,
      championships,
      playoffAppearances,
      seasonsPlayed,
      winPct,
      playoffRate,
      recentForm,
    };
  });

  const maxRings = Math.max(0, ...perFranchise.map((p) => p.championships));
  const pointsValues = perFranchise.map((p) => p.pointsScored);
  const minPoints = pointsValues.length ? Math.min(...pointsValues) : 0;
  const maxPoints = pointsValues.length ? Math.max(...pointsValues) : 0;
  const pointsRange = maxPoints - minPoints;

  // All-time points rank (1 = most), for the glass-cannon archetype downstream.
  const pointsOrder = [...perFranchise].sort(
    (a, b) => b.pointsScored - a.pointsScored,
  );
  const pointsRankByFranchise = new Map<string, number>();
  pointsOrder.forEach((p, i) => pointsRankByFranchise.set(p.franchiseId, i + 1));

  const scored = perFranchise.map((p) => {
    const ringShare = maxRings > 0 ? p.championships / maxRings : 0;
    const pointsShare =
      pointsRange === 0 ? 0.5 : (p.pointsScored - minPoints) / pointsRange;

    const goatScore =
      GOAT_WEIGHTS.careerWinPct * p.winPct +
      GOAT_WEIGHTS.championships * ringShare +
      GOAT_WEIGHTS.playoffRate * p.playoffRate +
      GOAT_WEIGHTS.careerPoints * pointsShare +
      GOAT_WEIGHTS.recentForm * p.recentForm;

    return {
      ...p,
      goatScore,
      pointsRank: pointsRankByFranchise.get(p.franchiseId) ?? 0,
    };
  });

  scored.sort((a, b) => {
    if (b.goatScore !== a.goatScore) return b.goatScore - a.goatScore;
    // Tie-breakers: rings, then win%, then points.
    if (b.championships !== a.championships)
      return b.championships - a.championships;
    if (b.winPct !== a.winPct) return b.winPct - a.winPct;
    return b.pointsScored - a.pointsScored;
  });

  return scored.map((s, idx) => ({ ...s, rank: idx + 1 }));
}

export interface GoatEntry extends GoatScoreResult {
  slug: string;
  name: string;
  abbreviation?: string;
  brandingColor?: string;
  avatarUrl: string | null;
  archetype: GoatArchetype;
  blurb: string;
}

/**
 * The full GOAT Ladder: every franchise ranked 1..N with career aggregates, a
 * composite score, and a deterministic snarky blurb keyed by archetype (not by
 * franchise). Sources completed-season history only, so a not-yet-played
 * current season contributes nothing.
 */
export async function getGoatLadder(): Promise<GoatEntry[]> {
  try {
    const franchiseRows = await db
      .select({
        id: franchises.id,
        slug: franchises.slug,
        name: franchises.name,
        abbreviation: franchises.abbreviation,
        brandingColor: franchises.brandingColor,
      })
      .from(franchises);

    if (franchiseRows.length === 0) return [];

    const historyRows = await db
      .select({
        franchiseId: franchiseSeasons.franchiseId,
        seasonYear: seasons.seasonYear,
        wins: franchiseSeasons.wins,
        losses: franchiseSeasons.losses,
        ties: franchiseSeasons.ties,
        pointsScored: franchiseSeasons.pointsScored,
        playoffResult: franchiseSeasons.playoffResult,
      })
      .from(franchiseSeasons)
      .innerJoin(seasons, eq(franchiseSeasons.seasonId, seasons.id))
      .where(eq(seasons.status, "complete"));

    const byFranchise = new Map<string, GoatSeasonInput[]>();
    for (const r of historyRows) {
      const list = byFranchise.get(r.franchiseId) ?? [];
      list.push({
        seasonYear: r.seasonYear,
        wins: r.wins ?? 0,
        losses: r.losses ?? 0,
        ties: r.ties ?? 0,
        pointsScored: Number(r.pointsScored ?? 0),
        playoffResult: r.playoffResult,
      });
      byFranchise.set(r.franchiseId, list);
    }

    const inputs: GoatFranchiseInput[] = franchiseRows.map((f) => ({
      franchiseId: f.id,
      seasons: byFranchise.get(f.id) ?? [],
    }));

    const scores = computeGoatScores(inputs);
    const leagueSize = scores.length;
    const avatarUrls = await getLatestAvatarUrls(franchiseRows.map((f) => f.id));
    const identityById = new Map(franchiseRows.map((f) => [f.id, f]));

    return scores.map((s) => {
      const f = identityById.get(s.franchiseId)!;
      const { archetype, blurb } = selectGoatBlurb(s.franchiseId, {
        rank: s.rank,
        leagueSize,
        winPct: s.winPct,
        championships: s.championships,
        playoffRate: s.playoffRate,
        recentForm: s.recentForm,
        seasonsPlayed: s.seasonsPlayed,
        pointsRank: s.pointsRank,
      });
      return {
        ...s,
        slug: f.slug,
        name: f.name,
        abbreviation: f.abbreviation ?? undefined,
        brandingColor: f.brandingColor ?? undefined,
        avatarUrl: avatarUrls.get(s.franchiseId) ?? null,
        archetype,
        blurb,
      };
    });
  } catch (e) {
    console.error("[goat] getGoatLadder error:", e);
    return [];
  }
}
