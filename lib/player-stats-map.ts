import type { NewPlayerWeekStats } from "@/lib/db/schema";

/**
 * Input for mapWeekStatRow: the identity (season/week/player), an externally
 * resolved position (from the players snapshot; Sleeper's stat map does not
 * carry position), and the raw Sleeper stat map for that player/week.
 */
export interface WeekStatRowInput {
  seasonId: number;
  week: number;
  playerId: string;
  position: string | null;
  statMap: Record<string, number | null>;
}

/**
 * Reads a numeric stat from a Sleeper stat map. Missing keys and null values
 * map to null (never 0), so an absent stat is distinguishable from a real zero.
 * Non-finite values (should not occur, but the map is external) also map null.
 */
function stat(statMap: Record<string, number | null>, key: string): number | null {
  const v = statMap[key];
  if (v == null || !Number.isFinite(v)) return null;
  return v;
}

/**
 * Pure mapper: turns one player's raw Sleeper week stat map into a
 * NewPlayerWeekStats row. Curated stat columns are extracted by their Sleeper
 * key (missing -> null); gamesPlayed is the rounded integer of `gp`; the full
 * stat map is kept verbatim in the stats jsonb catch-all (pts_ppr and every
 * advanced metric survive). Does not touch the DB.
 */
export function mapWeekStatRow(input: WeekStatRowInput): NewPlayerWeekStats {
  const { seasonId, week, playerId, position, statMap } = input;

  const gp = stat(statMap, "gp");

  return {
    seasonId,
    week,
    playerId,
    position: position ?? null,
    gamesPlayed: gp == null ? null : Math.round(gp),
    passYd: stat(statMap, "pass_yd"),
    passTd: stat(statMap, "pass_td"),
    passInt: stat(statMap, "pass_int"),
    passAtt: stat(statMap, "pass_att"),
    passCmp: stat(statMap, "pass_cmp"),
    rushYd: stat(statMap, "rush_yd"),
    rushTd: stat(statMap, "rush_td"),
    rushAtt: stat(statMap, "rush_att"),
    rec: stat(statMap, "rec"),
    recYd: stat(statMap, "rec_yd"),
    recTd: stat(statMap, "rec_td"),
    recTgt: stat(statMap, "rec_tgt"),
    fumLost: stat(statMap, "fum_lost"),
    fgm: stat(statMap, "fgm"),
    fga: stat(statMap, "fga"),
    xpm: stat(statMap, "xpm"),
    stats: statMap,
  };
}
