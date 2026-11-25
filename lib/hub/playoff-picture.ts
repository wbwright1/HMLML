// Midseason "Playoff picture" hub module: when it shows, and the in-season
// draft order watch. Pure: no database, no network.

import { rookieDraftOrder, type DraftOrderTeam } from "@/lib/rookie-draft-order";

/**
 * The hub leads with the playoff picture from this week of the regular season
 * on (Blake, 2026-11-24: "prominent once we get halfway through"). It matches
 * MIN_RACE_WEEK in lib/queries/playoff-race.ts, when the race tags start.
 */
export const PLAYOFF_PICTURE_START_WEEK = 8;

/** Week 8 onward, and only while the regular season is still going. */
export function showPlayoffPicture(week: number, playoffWeekStart: number | null | undefined): boolean {
  if (!Number.isFinite(week) || week < PLAYOFF_PICTURE_START_WEEK) return false;
  if (playoffWeekStart != null && week >= playoffWeekStart) return false;
  return true;
}

export interface DraftWatchEntry {
  pick: number;
  franchiseId: string;
  maxPointsFor: number | null;
}

export interface DraftWatch {
  /** Picks the non-playoff teams would hold if the season ended today. */
  entries: DraftWatchEntry[];
  /** The pick range still decided by the playoff bracket, or null if none. */
  bracketPicks: { from: number; to: number } | null;
}

/**
 * The rookie draft order "if the season ended today": the league rule
 * (lib/rookie-draft-order.ts) applied to the projected playoff field. Teams
 * outside the projected field fill the first picks by lowest Max PF; the
 * playoff teams' picks depend on bracket results, so they are reported as a
 * range rather than invented.
 */
export function buildDraftWatch(teams: DraftOrderTeam[], projectedFieldIds: string[]): DraftWatch {
  if (teams.length === 0 || projectedFieldIds.length === 0) {
    return { entries: [], bracketPicks: null };
  }
  const slots = rookieDraftOrder(teams, {
    field: projectedFieldIds,
    fifthSixth: null,
    fourth: null,
    third: null,
    runnerUp: null,
    champion: null,
  });
  const maxPfById = new Map(teams.map((t) => [t.franchiseId, t.maxPointsFor]));
  const entries: DraftWatchEntry[] = [];
  const tbd: number[] = [];
  for (const slot of slots) {
    if (slot.franchiseId && slot.basis === "non-playoff (Max PF)") {
      entries.push({
        pick: slot.pick,
        franchiseId: slot.franchiseId,
        maxPointsFor: maxPfById.get(slot.franchiseId) ?? null,
      });
    } else if (slot.franchiseId == null) {
      tbd.push(slot.pick);
    }
  }
  const bracketPicks =
    tbd.length > 0 ? { from: Math.min(...tbd), to: Math.max(...tbd) } : null;
  return { entries, bracketPicks };
}
