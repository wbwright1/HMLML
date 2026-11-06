import { computePowerScore, POWER_WINDOW_SIZE } from "@/lib/queries/records";

/**
 * Season Arc: every franchise's rank, week by week, across one regular season.
 *
 * Two lenses over the same completed games:
 *
 * - **power**: the live power-rankings model (`computePowerScore`) replayed as
 *   of each week, over that week's trailing POWER_WINDOW_SIZE completed weeks.
 *   The live model's injury term reads CURRENT roster injury statuses, which
 *   cannot be reconstructed for a past week, so every franchise is fed a zero
 *   penalty. That adds the same constant to every score, so the ordering is
 *   exactly results (50) and scoring (35) renormalized, with the live model's
 *   own tie-break.
 * - **standings**: cumulative record as of each week (a tie counts half a
 *   win), then points for, then franchise id so the order is deterministic.
 *
 * Pure and DB-free so it can be unit tested; lib/queries/season-arc.ts feeds it.
 */

export type ArcMode = "power" | "standings";

export interface ArcGame {
  franchiseId: string;
  week: number;
  points: number;
  isWinner: boolean | null;
}

export interface ArcSeries {
  franchiseId: string;
  /** ranks[i] is the franchise's 1-based rank in weeks[i]. */
  ranks: number[];
}

/** The largest move between any two weeks of the season (not just start to
 * end), so a midseason freefall still counts after a late recovery. */
export interface ArcSwing {
  franchiseId: string;
  fromRank: number;
  fromWeek: number;
  toRank: number;
  toWeek: number;
  /** Spots moved, always positive. */
  spots: number;
}

export interface ArcLens {
  series: ArcSeries[];
  biggestRise: ArcSwing | null;
  biggestFall: ArcSwing | null;
  /** Franchise ranked #1 in every week, when one exists. */
  wireToWire: string | null;
}

export interface SeasonArc {
  weeks: number[];
  power: ArcLens;
  standings: ArcLens;
}

/** A swing has to be this big to earn a callout; smaller ones are noise. */
export const MIN_CALLOUT_SWING = 3;

/** Wire to wire only means something once the season has some length. */
export const MIN_WIRE_TO_WIRE_WEEKS = 4;

function rankPowerAsOf(
  franchiseIds: string[],
  games: ArcGame[],
  windowWeeks: Set<number>
): Map<string, number> {
  const ranked = computePowerScore(
    franchiseIds.map((franchiseId) => ({
      franchiseId,
      games: games
        .filter((g) => g.franchiseId === franchiseId && windowWeeks.has(g.week))
        .map((g) => ({ week: g.week, points: g.points, isWinner: g.isWinner })),
      injuryPenalty: 0,
      injuryCount: 0,
      standingsRank: 0,
    }))
  );
  return new Map(ranked.map((r) => [r.franchiseId, r.rank]));
}

function rankStandingsAsOf(
  franchiseIds: string[],
  games: ArcGame[],
  throughWeek: number
): Map<string, number> {
  const totals = new Map(
    franchiseIds.map((id) => [id, { wins: 0, points: 0 }])
  );
  for (const g of games) {
    if (g.week > throughWeek) continue;
    const t = totals.get(g.franchiseId);
    if (!t) continue;
    t.wins += g.isWinner === true ? 1 : g.isWinner === null ? 0.5 : 0;
    t.points += g.points;
  }
  const ordered = [...franchiseIds].sort((a, b) => {
    const ta = totals.get(a)!;
    const tb = totals.get(b)!;
    if (tb.wins !== ta.wins) return tb.wins - ta.wins;
    if (tb.points !== ta.points) return tb.points - ta.points;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return new Map(ordered.map((id, i) => [id, i + 1]));
}

/**
 * Largest climb (rank number falls) or fall (rank number rises) between an
 * earlier week i and a later week j. Ties keep the first franchise found, and
 * within a franchise the earliest pair, so the callout is stable.
 */
export function findBiggestSwing(
  series: ArcSeries[],
  weeks: number[],
  direction: "rise" | "fall"
): ArcSwing | null {
  let best: ArcSwing | null = null;
  for (const s of series) {
    for (let i = 0; i < s.ranks.length; i++) {
      for (let j = i + 1; j < s.ranks.length; j++) {
        const spots =
          direction === "rise" ? s.ranks[i] - s.ranks[j] : s.ranks[j] - s.ranks[i];
        if (spots <= 0) continue;
        if (!best || spots > best.spots) {
          best = {
            franchiseId: s.franchiseId,
            fromRank: s.ranks[i],
            fromWeek: weeks[i],
            toRank: s.ranks[j],
            toWeek: weeks[j],
            spots,
          };
        }
      }
    }
  }
  return best && best.spots >= MIN_CALLOUT_SWING ? best : null;
}

function buildLens(
  franchiseIds: string[],
  weeks: number[],
  rankFor: (weekIndex: number) => Map<string, number>
): ArcLens {
  const perWeek = weeks.map((_, i) => rankFor(i));
  const series = franchiseIds.map((franchiseId) => ({
    franchiseId,
    ranks: perWeek.map((m) => m.get(franchiseId) ?? franchiseIds.length),
  }));
  const wire =
    weeks.length >= MIN_WIRE_TO_WIRE_WEEKS
      ? series.find((s) => s.ranks.every((r) => r === 1))
      : undefined;
  return {
    series,
    biggestRise: findBiggestSwing(series, weeks, "rise"),
    biggestFall: findBiggestSwing(series, weeks, "fall"),
    wireToWire: wire?.franchiseId ?? null,
  };
}

/**
 * @param franchiseIds every franchise in the season, in a stable order
 * @param games completed REGULAR-SEASON games only; the caller filters out
 *   playoff weeks so a consolation game cannot move a line
 */
export function computeSeasonArc(
  franchiseIds: string[],
  games: ArcGame[]
): SeasonArc {
  const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);

  const power = buildLens(franchiseIds, weeks, (i) =>
    rankPowerAsOf(
      franchiseIds,
      games,
      new Set(weeks.slice(Math.max(0, i - POWER_WINDOW_SIZE + 1), i + 1))
    )
  );
  const standings = buildLens(franchiseIds, weeks, (i) =>
    rankStandingsAsOf(franchiseIds, games, weeks[i])
  );

  return { weeks, power, standings };
}

/**
 * Order for the closing "Title" column: the champion takes #1, everyone else
 * keeps their final-week order beneath. Returns a rank per franchise.
 */
export function crownOrder(
  series: ArcSeries[],
  championId: string
): Map<string, number> {
  const last = (s: ArcSeries) => s.ranks[s.ranks.length - 1] ?? Infinity;
  const ordered = [...series].sort((a, b) => {
    if (a.franchiseId === championId) return -1;
    if (b.franchiseId === championId) return 1;
    return last(a) - last(b);
  });
  return new Map(ordered.map((s, i) => [s.franchiseId, i + 1]));
}
