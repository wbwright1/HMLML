import { db } from "@/lib/db";
import {
  franchises,
  franchiseSeasons,
  matchups,
  players,
  rosterPlayers,
  seasons,
} from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getLatestAvatarUrls } from "@/lib/queries/franchise-avatars";
import { getPowerRankings, type PowerRankingEntry } from "@/lib/queries/records";

// ---------------------------------------------------------------------------
// 4.6b — Preseason Power Rankings
// ---------------------------------------------------------------------------
//
// The recent-form model (getPowerRankings) needs completed games in the current
// season. In the offseason / preseason there are none, so it renders all zeros.
// This module powers the "Preseason Power Rankings" edition instead: a blend of
//
//   1. Weighted franchise history — every completed season scored on win rate,
//      points-for (normalized within its own season), and playoff finish, then
//      combined with exponential recency decay so the most recent season
//      dominates (weights 0.5 / 0.25 / 0.125 ... normalized per franchise).
//   2. Projected roster strength — the sum of each current roster's per-player
//      projected fantasy points for the upcoming season (falling back to last
//      season's actual points where a projection is missing), normalized across
//      the 12 franchises.
//
//   preseasonScore = 0.5 * historyScore + 0.5 * rosterScore
//
// Both components live in [0,1]; the blend is deliberately even. No current-form
// deltas exist preseason, so the view suppresses the vs-standings arrows.

const HISTORY_RECENCY_BASE = 0.5;

// Per-season quality weights (sum to 1). Win rate leads, scoring and finish fill
// in the rest of the picture.
const SEASON_WIN_WEIGHT = 0.45;
const SEASON_SCORING_WEIGHT = 0.3;
const SEASON_FINISH_WEIGHT = 0.25;

const HISTORY_BLEND = 0.5;
const ROSTER_BLEND = 0.5;

// Maps a playoff result to a [0,1] "how did the season end" component. Unknown /
// null (legacy rows without a result) land at a neutral-ish 0.4.
const FINISH_COMPONENT: Record<string, number> = {
  champion: 1.0,
  runner_up: 0.75,
  made_playoffs: 0.5,
  consolation: 0.3,
  toilet_bowl: 0.0,
};

function finishComponent(playoffResult: string | null): number {
  if (playoffResult && playoffResult in FINISH_COMPONENT) {
    return FINISH_COMPONENT[playoffResult];
  }
  return 0.4;
}

export interface PreseasonSeasonInput {
  seasonYear: number;
  wins: number;
  losses: number;
  ties: number;
  pointsScored: number;
  standingsFinish: number | null;
  playoffResult: string | null;
}

export interface PreseasonFranchiseInput {
  franchiseId: string;
  rosterProjPoints: number;
  seasons: PreseasonSeasonInput[]; // any order
}

export interface PreseasonScoreResult {
  franchiseId: string;
  rank: number;
  powerScore: number;
  historyScore: number;
  rosterScore: number;
  rosterProjPoints: number;
}

/**
 * Pure, DB-free preseason power calculator. Normalizes points-for within each
 * season and roster strength across the league internally, so it needs every
 * franchise at once.
 */
export function computePreseasonPower(
  inputs: PreseasonFranchiseInput[]
): PreseasonScoreResult[] {
  // Min/max points-for per season year, for within-season scoring normalization.
  const pfBySeason = new Map<number, { min: number; max: number }>();
  for (const f of inputs) {
    for (const s of f.seasons) {
      const cur = pfBySeason.get(s.seasonYear);
      if (!cur) {
        pfBySeason.set(s.seasonYear, {
          min: s.pointsScored,
          max: s.pointsScored,
        });
      } else {
        cur.min = Math.min(cur.min, s.pointsScored);
        cur.max = Math.max(cur.max, s.pointsScored);
      }
    }
  }

  const historyScores = inputs.map((f) => {
    // Newest season first, so recency weight 0.5^0 = 1 hits the latest season.
    const sorted = [...f.seasons].sort((a, b) => b.seasonYear - a.seasonYear);

    let weightSum = 0;
    let acc = 0;
    sorted.forEach((s, i) => {
      const total = s.wins + s.losses + s.ties;
      const winPct = total > 0 ? s.wins / total : 0;

      const pf = pfBySeason.get(s.seasonYear)!;
      const range = pf.max - pf.min;
      const scoring = range > 0 ? (s.pointsScored - pf.min) / range : 0.5;

      const finish = finishComponent(s.playoffResult);

      const seasonScore =
        SEASON_WIN_WEIGHT * winPct +
        SEASON_SCORING_WEIGHT * scoring +
        SEASON_FINISH_WEIGHT * finish;

      const weight = Math.pow(HISTORY_RECENCY_BASE, i);
      acc += weight * seasonScore;
      weightSum += weight;
    });

    return {
      franchiseId: f.franchiseId,
      historyScore: weightSum > 0 ? acc / weightSum : 0,
      rosterProjPoints: f.rosterProjPoints,
    };
  });

  // Min-max normalize roster strength across the league. All-equal (or a single
  // franchise) guards to a neutral 0.5.
  const projValues = inputs.map((f) => f.rosterProjPoints);
  const minProj = projValues.length ? Math.min(...projValues) : 0;
  const maxProj = projValues.length ? Math.max(...projValues) : 0;
  const projRange = maxProj - minProj;

  const scored = historyScores.map((h) => {
    const rosterScore =
      projRange === 0 ? 0.5 : (h.rosterProjPoints - minProj) / projRange;
    const powerScore =
      HISTORY_BLEND * h.historyScore + ROSTER_BLEND * rosterScore;
    return {
      franchiseId: h.franchiseId,
      historyScore: h.historyScore,
      rosterScore,
      rosterProjPoints: h.rosterProjPoints,
      powerScore,
    };
  });

  scored.sort((a, b) => {
    if (b.powerScore !== a.powerScore) return b.powerScore - a.powerScore;
    return b.rosterProjPoints - a.rosterProjPoints;
  });

  return scored.map((s, idx) => ({ ...s, rank: idx + 1 }));
}

export interface PreseasonPowerEntry {
  rank: number;
  id: string;
  slug: string;
  name: string;
  abbreviation?: string;
  brandingColor?: string;
  avatarUrl: string | null;
  championships: number;
  powerScore: number; // 0..1
  historyScore: number; // 0..1
  rosterScore: number; // 0..1
  rosterProjPoints: number; // raw sum of projected fantasy points
  // Most recent completed season, for a "last season" stat column.
  lastSeasonYear: number | null;
  lastSeasonWins: number;
  lastSeasonLosses: number;
  lastSeasonTies: number;
  lastStandingsFinish: number | null;
  lastPlayoffResult: string | null;
}

/**
 * True when the latest season has no completed games yet (offseason /
 * preseason), so the recent-form power model would render all zeros.
 */
export async function isPreseasonPowerMode(): Promise<boolean> {
  const [latestSeason] = await db
    .select({ id: seasons.id, status: seasons.status })
    .from(seasons)
    .orderBy(desc(seasons.seasonYear))
    .limit(1);

  if (!latestSeason) return true;

  const completed = await db
    .select({ week: matchups.week })
    .from(matchups)
    .where(
      and(
        eq(matchups.seasonId, latestSeason.id),
        eq(matchups.status, "complete")
      )
    )
    .limit(1);

  return completed.length === 0;
}

export async function getPreseasonPowerRankings(): Promise<
  PreseasonPowerEntry[]
> {
  try {
    const [latestSeason] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .orderBy(desc(seasons.seasonYear))
      .limit(1);

    if (!latestSeason) return [];

    // All franchises (identity).
    const franchiseRows = await db
      .select({
        id: franchises.id,
        slug: franchises.slug,
        name: franchises.name,
        abbreviation: franchises.abbreviation,
        brandingColor: franchises.brandingColor,
      })
      .from(franchises);

    // Completed-season history (excludes the not-yet-played current season).
    const historyRows = await db
      .select({
        franchiseId: franchiseSeasons.franchiseId,
        seasonYear: seasons.seasonYear,
        wins: franchiseSeasons.wins,
        losses: franchiseSeasons.losses,
        ties: franchiseSeasons.ties,
        pointsScored: franchiseSeasons.pointsScored,
        standingsFinish: franchiseSeasons.standingsFinish,
        playoffResult: franchiseSeasons.playoffResult,
      })
      .from(franchiseSeasons)
      .innerJoin(seasons, eq(franchiseSeasons.seasonId, seasons.id))
      .where(eq(seasons.status, "complete"));

    const historyByFranchise = new Map<string, PreseasonSeasonInput[]>();
    for (const r of historyRows) {
      const list = historyByFranchise.get(r.franchiseId) ?? [];
      list.push({
        seasonYear: r.seasonYear,
        wins: r.wins ?? 0,
        losses: r.losses ?? 0,
        ties: r.ties ?? 0,
        pointsScored: Number(r.pointsScored ?? 0),
        standingsFinish: r.standingsFinish,
        playoffResult: r.playoffResult,
      });
      historyByFranchise.set(r.franchiseId, list);
    }

    // Championship counts (for badges).
    const champByFranchise = new Map<string, number>();
    for (const r of historyRows) {
      if (r.playoffResult === "champion") {
        champByFranchise.set(
          r.franchiseId,
          (champByFranchise.get(r.franchiseId) ?? 0) + 1
        );
      }
    }

    // Projected roster strength: sum each current roster's projected points,
    // falling back to last season's actual points where no projection exists.
    const rosterRows = await db
      .select({
        franchiseId: rosterPlayers.franchiseId,
        projPointsPpr: players.projPointsPpr,
        pointsPpr: players.pointsPpr,
      })
      .from(rosterPlayers)
      .innerJoin(players, eq(rosterPlayers.playerId, players.id))
      .where(eq(rosterPlayers.seasonId, latestSeason.id));

    const rosterProjByFranchise = new Map<string, number>();
    for (const r of rosterRows) {
      const val = r.projPointsPpr ?? r.pointsPpr ?? 0;
      rosterProjByFranchise.set(
        r.franchiseId,
        (rosterProjByFranchise.get(r.franchiseId) ?? 0) + val
      );
    }

    const inputs: PreseasonFranchiseInput[] = franchiseRows.map((f) => ({
      franchiseId: f.id,
      rosterProjPoints: rosterProjByFranchise.get(f.id) ?? 0,
      seasons: historyByFranchise.get(f.id) ?? [],
    }));

    const scores = computePreseasonPower(inputs);
    const scoreByFranchise = new Map(scores.map((s) => [s.franchiseId, s]));

    const avatarUrls = await getLatestAvatarUrls(franchiseRows.map((f) => f.id));

    return franchiseRows
      .map((f) => {
        const score = scoreByFranchise.get(f.id);
        const seasonsDesc = [...(historyByFranchise.get(f.id) ?? [])].sort(
          (a, b) => b.seasonYear - a.seasonYear
        );
        const last = seasonsDesc[0] ?? null;
        return {
          rank: score?.rank ?? 0,
          id: f.id,
          slug: f.slug,
          name: f.name,
          abbreviation: f.abbreviation ?? undefined,
          brandingColor: f.brandingColor ?? undefined,
          avatarUrl: avatarUrls.get(f.id) ?? null,
          championships: champByFranchise.get(f.id) ?? 0,
          powerScore: score?.powerScore ?? 0,
          historyScore: score?.historyScore ?? 0,
          rosterScore: score?.rosterScore ?? 0,
          rosterProjPoints: score?.rosterProjPoints ?? 0,
          lastSeasonYear: last?.seasonYear ?? null,
          lastSeasonWins: last?.wins ?? 0,
          lastSeasonLosses: last?.losses ?? 0,
          lastSeasonTies: last?.ties ?? 0,
          lastStandingsFinish: last?.standingsFinish ?? null,
          lastPlayoffResult: last?.playoffResult ?? null,
        };
      })
      .sort((a, b) => a.rank - b.rank);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Mode-aware selector — one call the page and the inline module both use.
// ---------------------------------------------------------------------------

export type PowerRankingsView =
  | { mode: "regular"; entries: PowerRankingEntry[] }
  | { mode: "preseason"; entries: PreseasonPowerEntry[] };

export async function getPowerRankingsView(): Promise<PowerRankingsView> {
  const preseason = await isPreseasonPowerMode();
  if (preseason) {
    return { mode: "preseason", entries: await getPreseasonPowerRankings() };
  }
  return { mode: "regular", entries: await getPowerRankings() };
}
