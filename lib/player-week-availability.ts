// Pure classification of whether a player actually played, took a bye, or
// did not play in a given (season, week), plus the DB helper that derives
// each NFL team's bye week from the existing nfl_games schedule table.
//
// There is no historically reliable "declared OUT" signal in this codebase
// (Sleeper's per-week injury designation isn't synced retroactively), so the
// honest label for "rostered/started but no real NFL production and not a
// bye" is DNP (did not play), never "OUT" — OUT implies a specific injury
// designation we cannot actually prove happened that week.
import { db } from "@/lib/db";
import { nflGames } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

export type WeekAvailability = "PLAYED" | "BYE" | "DNP";

// Sleeper's players table (players.nfl_team) can lag a franchise relocation;
// the schedule sync (nfl_games) already reflects the new abbreviation. Extend
// this map if another franchise relocates.
const TEAM_ALIASES: Record<string, string> = {
  OAK: "LV",
};

/** Normalizes an NFL team abbreviation through the relocation alias map. */
export function normalizeNflTeam(team: string | null | undefined): string | null {
  if (!team) return null;
  return TEAM_ALIASES[team] ?? team;
}

/** Key into the bye-week map: `${seasonYear}:${normalizedTeam}`. */
export function teamByeKey(seasonYear: number, team: string | null | undefined): string | null {
  const normalized = normalizeNflTeam(team);
  if (!normalized) return null;
  return `${seasonYear}:${normalized}`;
}

/** Key into the week-completion set: `${seasonYear}:${week}`. */
export function seasonWeekKey(seasonYear: number, week: number): string {
  return `${seasonYear}:${week}`;
}

export interface PlayerWeekAvailabilityInput {
  week: number;
  /** player_week_stats.gamesPlayed (Sleeper's gp) for this player/week. */
  gamesPlayed: number | null | undefined;
  /** stats.gms_active from the player_week_stats jsonb catch-all. */
  gmsActive: number | null | undefined;
  /** Fantasy points scored this week (from player_week_points), if any. */
  points: number | null | undefined;
  /** Curated box-score stat values (passYd, rushTd, rec, fgm, ...) for this week. */
  curatedStats: readonly (number | null | undefined)[];
  /** This player's team's bye week for the season, or null if unknown. */
  teamByeWeek: number | null | undefined;
  /**
   * Whether this week has actually happened (the team's game, or the wider
   * schedule week, is complete). When false, the week hasn't been played yet
   * and BYE/DNP cannot honestly be asserted — the caller should fall back to
   * its existing UPCOMING/not-yet-played handling instead.
   */
  weekIsComplete: boolean;
}

/**
 * Classifies a single (player, week) as PLAYED, BYE, or DNP. Returns null
 * when the week is not yet complete — callers keep their own existing
 * "upcoming" behavior in that case rather than asserting a bye or a DNP for
 * a game that hasn't happened.
 *
 * Precedence (first match wins):
 *   1. PLAYED — gamesPlayed >= 1, OR gms_active >= 1, OR points > 0, OR any
 *      curated stat > 0. This guard runs FIRST so a real game that ended
 *      0-0 for fantasy purposes still counts as played, and a stale/wrong
 *      team-bye map can never mislabel an actually-played week.
 *   2. BYE — the player's team's bye week is known and matches this week.
 *   3. DNP — everything else (the honest fallback; never "OUT", which would
 *      claim a specific injury designation we cannot prove happened).
 */
export function classifyPlayerWeekAvailability(
  input: PlayerWeekAvailabilityInput,
): WeekAvailability | null {
  if (!input.weekIsComplete) return null;

  if ((input.gamesPlayed ?? 0) >= 1) return "PLAYED";
  if ((input.gmsActive ?? 0) >= 1) return "PLAYED";
  if ((input.points ?? 0) > 0) return "PLAYED";
  if (input.curatedStats.some((v) => (v ?? 0) > 0)) return "PLAYED";

  if (input.teamByeWeek != null && input.week === input.teamByeWeek) {
    return "BYE";
  }

  return "DNP";
}

export interface SeasonScheduleFacts {
  /** key: `${seasonYear}:${normalizedTeam}` -> that team's bye week. */
  teamByeWeeks: Map<string, number>;
  /** key: `${seasonYear}:${week}` -> true when at least one game that week is complete. */
  completeWeeks: Set<string>;
}

/**
 * Derives, from the existing nfl_games schedule table, each NFL team's bye
 * week per season (the one regular-season week in which the team appears in
 * zero games) plus which season/weeks have actually been played (any game
 * that week marked complete). One grouped query over nfl_games for the
 * requested seasons; no new table, no new sync job.
 */
export async function getSeasonScheduleFacts(
  seasonYears: number[],
): Promise<SeasonScheduleFacts> {
  const teamByeWeeks = new Map<string, number>();
  const completeWeeks = new Set<string>();
  if (seasonYears.length === 0) return { teamByeWeeks, completeWeeks };

  const rows = await db
    .select({
      seasonYear: nflGames.seasonYear,
      week: nflGames.week,
      homeTeam: nflGames.homeTeam,
      awayTeam: nflGames.awayTeam,
      status: nflGames.status,
    })
    .from(nflGames)
    .where(inArray(nflGames.seasonYear, seasonYears));

  const weeksBySeason = new Map<number, Set<number>>();
  const teamsBySeason = new Map<number, Set<string>>();
  const weeksPlayedBySeasonTeam = new Map<string, Set<number>>();

  for (const r of rows) {
    const home = normalizeNflTeam(r.homeTeam);
    const away = normalizeNflTeam(r.awayTeam);

    const weeks = weeksBySeason.get(r.seasonYear) ?? new Set<number>();
    weeks.add(r.week);
    weeksBySeason.set(r.seasonYear, weeks);

    if (r.status === "complete") {
      completeWeeks.add(seasonWeekKey(r.seasonYear, r.week));
    }

    for (const team of [home, away]) {
      if (!team) continue;
      const teams = teamsBySeason.get(r.seasonYear) ?? new Set<string>();
      teams.add(team);
      teamsBySeason.set(r.seasonYear, teams);

      const key = `${r.seasonYear}:${team}`;
      const teamWeeks = weeksPlayedBySeasonTeam.get(key) ?? new Set<number>();
      teamWeeks.add(r.week);
      weeksPlayedBySeasonTeam.set(key, teamWeeks);
    }
  }

  for (const [seasonYear, teams] of teamsBySeason) {
    const allWeeks = [...(weeksBySeason.get(seasonYear) ?? new Set<number>())];
    for (const team of teams) {
      const key = `${seasonYear}:${team}`;
      const weeksPlayed = weeksPlayedBySeasonTeam.get(key) ?? new Set<number>();
      const byeWeek = allWeeks.find((w) => !weeksPlayed.has(w));
      if (byeWeek != null) {
        teamByeWeeks.set(key, byeWeek);
      }
    }
  }

  return { teamByeWeeks, completeWeeks };
}
