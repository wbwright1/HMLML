import type {
  CuratedStatKey,
  PlayerWeeklyPointRow,
  PlayerWeeklyStatRow,
} from "@/lib/queries/player-profile";
import { CURATED_STAT_KEYS } from "@/lib/queries/player-profile";
import {
  classifyPlayerWeekAvailability,
  normalizeNflTeam,
  seasonWeekKey,
} from "@/lib/player-week-availability";

export interface StatColumn {
  key: CuratedStatKey;
  label: string;
}

// K's fgm/fga render as separate columns like everything else here.
export const STAT_COLUMNS_BY_POSITION: Record<string, StatColumn[]> = {
  QB: [
    { key: "passYd", label: "Pass Yd" },
    { key: "passTd", label: "Pass TD" },
    { key: "passInt", label: "INT" },
    { key: "rushYd", label: "Rush Yd" },
    { key: "rushTd", label: "Rush TD" },
  ],
  RB: [
    { key: "rushAtt", label: "Att" },
    { key: "rushYd", label: "Rush Yd" },
    { key: "rushTd", label: "Rush TD" },
    { key: "rec", label: "Rec" },
  ],
  WR: [
    { key: "recTgt", label: "Tgt" },
    { key: "rec", label: "Rec" },
    { key: "recYd", label: "Rec Yd" },
    { key: "recTd", label: "Rec TD" },
  ],
  TE: [
    { key: "recTgt", label: "Tgt" },
    { key: "rec", label: "Rec" },
    { key: "recYd", label: "Rec Yd" },
    { key: "recTd", label: "Rec TD" },
  ],
  K: [
    { key: "fgm", label: "FGM" },
    { key: "fga", label: "FGA" },
    { key: "xpm", label: "XPM" },
  ],
};

export interface FranchiseRef {
  name: string;
  slug: string | null;
  avatarUrl: string | null;
}

export type WeeklyLineStatus =
  | "BYE"
  | "DNP"
  | "START"
  | "BENCH"
  | "UPCOMING"
  | "NOT_ROSTERED";

export interface WeeklyLine {
  week: number;
  /** False for stat-only weeks: real NFL stats exist but no league franchise rostered him. */
  rostered: boolean;
  /** False for unplayed/future weeks AND for this player's own BYE/DNP weeks. */
  played: boolean;
  owner: FranchiseRef | null;
  opponent: FranchiseRef | null;
  slot: string | null;
  started: boolean;
  status: WeeklyLineStatus;
  projected: number | null;
  actual: number | null;
  /** actual - projected, only when played and both are known; null on unplayed/bye/DNP/stat-only weeks. */
  delta: number | null;
  stat: PlayerWeeklyStatRow | null;
}

function franchiseRef(
  name: string | null,
  slug: string | null,
  avatarUrl: string | null,
): FranchiseRef | null {
  if (!name) return null;
  return { name, slug, avatarUrl };
}

/**
 * Status precedence: BYE > DNP > START/BENCH > UPCOMING > NOT_ROSTERED — an
 * honest bye or a DNP outranks the lineup slot, because "started" a bye-week
 * player is still a bye, not a real performance.
 */
function statusFor(
  w: PlayerWeeklyPointRow | null,
  availability: "PLAYED" | "BYE" | "DNP" | null,
): WeeklyLineStatus {
  if (availability === "BYE") return "BYE";
  if (availability === "DNP") return "DNP";
  if (!w) return "NOT_ROSTERED";
  if (!w.played) return "UPCOMING";
  return w.started ? "START" : "BENCH";
}

export interface BuildWeeklyLinesOptions {
  seasonYear: number;
  /** The player's (current) NFL team, for team-bye resolution. */
  nflTeam: string | null;
  /** key: `${seasonYear}:${normalizedTeam}` -> that team's bye week. From getSeasonScheduleFacts. */
  teamByeWeeks: Map<string, number>;
  /** key: `${seasonYear}:${week}` -> true when that week has actually been played. From getSeasonScheduleFacts. */
  completeWeeks: Set<string>;
}

/**
 * Union of lineup weeks and NFL-stat weeks: a season nobody in the league
 * rostered the player still shows his real stat lines, with the league fields
 * (owner/opponent/slot/status/points) blanked (NOT_ROSTERED). This is the
 * single computation point for BYE/DNP classification — both the desktop
 * table and the mobile cards read from its output, so they can never
 * disagree.
 */
export function buildWeeklyLines(
  weeklyPoints: PlayerWeeklyPointRow[],
  weeklyStats: PlayerWeeklyStatRow[],
  options: BuildWeeklyLinesOptions,
): WeeklyLine[] {
  const pointsByWeek = new Map(weeklyPoints.map((w) => [w.week, w]));
  const statsByWeek = new Map(weeklyStats.map((s) => [s.week, s]));
  const allWeeks = [
    ...new Set([...pointsByWeek.keys(), ...statsByWeek.keys()]),
  ].sort((a, b) => a - b);

  const normalizedTeam = normalizeNflTeam(options.nflTeam);
  const teamByeWeek = normalizedTeam
    ? options.teamByeWeeks.get(`${options.seasonYear}:${normalizedTeam}`)
    : undefined;

  return allWeeks.map((week) => {
    const w = pointsByWeek.get(week) ?? null;
    const stat = statsByWeek.get(week) ?? null;

    const availability = classifyPlayerWeekAvailability({
      week,
      gamesPlayed: stat?.gamesPlayed ?? null,
      gmsActive:
        (stat?.stats as Record<string, number | null> | null)?.gms_active ??
        null,
      points: w?.points ?? null,
      curatedStats: CURATED_STAT_KEYS.map((k: CuratedStatKey) =>
        stat ? (stat[k] ?? null) : null,
      ),
      teamByeWeek: teamByeWeek ?? null,
      weekIsComplete: options.completeWeeks.has(
        seasonWeekKey(options.seasonYear, week),
      ),
    });

    // A week classified BYE/DNP for THIS player never counts as played, even
    // if a stale "started" slot or league-wide played flag would say
    // otherwise — a bye or a DNP is not a performance to show as 0.0.
    const played =
      availability === "BYE" || availability === "DNP"
        ? false
        : (w?.played ?? false);

    // Unplayed weeks (projection-only rows, byes, DNPs) show no actual and no
    // delta — a 0.0 actual would otherwise read as a fake negative delta.
    const delta =
      w && played && w.projectedPoints != null
        ? w.points - w.projectedPoints
        : null;

    return {
      week,
      rostered: w != null,
      played,
      owner: w
        ? franchiseRef(w.ownerFranchiseName, w.ownerFranchiseSlug, w.ownerAvatarUrl)
        : null,
      opponent: w
        ? franchiseRef(
            w.opponentFranchiseName,
            w.opponentFranchiseSlug,
            w.opponentAvatarUrl,
          )
        : null,
      slot: w?.slot ?? null,
      started: w?.started ?? false,
      status: statusFor(w, availability),
      projected: w?.projectedPoints ?? null,
      actual: w && played ? w.points : null,
      delta,
      stat,
    };
  });
}
