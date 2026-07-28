import type {
  CuratedStatKey,
  PlayerWeeklyPointRow,
  PlayerWeeklyStatRow,
} from "@/lib/queries/player-profile";

export interface StatColumn {
  key: CuratedStatKey;
  label: string;
}

// K uses a pair-rendered fgm/fga, so it isn't listed with the plain single
// columns below; formatStatSummary special-cases it.
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

export type WeeklyLineStatus = "START" | "BENCH" | "UPCOMING" | "NOT_ROSTERED";

export interface WeeklyLine {
  week: number;
  /** False for stat-only weeks: real NFL stats exist but no league franchise rostered him. */
  rostered: boolean;
  /** False for unplayed/future weeks (projection-only rows). */
  played: boolean;
  owner: FranchiseRef | null;
  opponent: FranchiseRef | null;
  slot: string | null;
  started: boolean;
  status: WeeklyLineStatus;
  projected: number | null;
  actual: number | null;
  /** actual - projected, only when played and both are known; null on unplayed/stat-only weeks. */
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

function statusFor(w: PlayerWeeklyPointRow | null): WeeklyLineStatus {
  if (!w) return "NOT_ROSTERED";
  if (!w.played) return "UPCOMING";
  return w.started ? "START" : "BENCH";
}

/**
 * Union of lineup weeks and NFL-stat weeks: a season nobody in the league
 * rostered the player still shows his real stat lines, with the league fields
 * (owner/opponent/slot/status/points) blanked (NOT_ROSTERED).
 */
export function buildWeeklyLines(
  weeklyPoints: PlayerWeeklyPointRow[],
  weeklyStats: PlayerWeeklyStatRow[],
): WeeklyLine[] {
  const pointsByWeek = new Map(weeklyPoints.map((w) => [w.week, w]));
  const statsByWeek = new Map(weeklyStats.map((s) => [s.week, s]));
  const allWeeks = [
    ...new Set([...pointsByWeek.keys(), ...statsByWeek.keys()]),
  ].sort((a, b) => a - b);

  return allWeeks.map((week) => {
    const w = pointsByWeek.get(week) ?? null;
    const stat = statsByWeek.get(week) ?? null;
    // Unplayed weeks (projection-only rows) show no actual and no delta — a
    // 0.0 actual would otherwise read as a fake negative delta.
    const delta =
      w && w.played && w.projectedPoints != null
        ? w.points - w.projectedPoints
        : null;

    return {
      week,
      rostered: w != null,
      played: w?.played ?? false,
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
      status: statusFor(w),
      projected: w?.projectedPoints ?? null,
      actual: w && w.played ? w.points : null,
      delta,
      stat,
    };
  });
}

function segment(value: number | null | undefined, label: string): string | null {
  if (value == null || value === 0) return null;
  return `${value} ${label}`;
}

/**
 * Compact, position-appropriate stat summary segments (joined by the caller
 * with " · "). Segments with a null/zero value are omitted entirely; cmp/att
 * and fgm/fga render as a single "x/y" pair segment.
 */
export function formatStatSummary(
  position: string | null,
  stat: PlayerWeeklyStatRow | null,
): string[] {
  if (!stat || !position) return [];

  switch (position) {
    case "QB": {
      const segments: string[] = [];
      if ((stat.passCmp != null && stat.passCmp !== 0) || (stat.passAtt != null && stat.passAtt !== 0)) {
        segments.push(`${stat.passCmp ?? 0}/${stat.passAtt ?? 0}`);
      }
      segments.push(
        ...[
          segment(stat.passYd, "YD"),
          segment(stat.passTd, "TD"),
          segment(stat.passInt, "INT"),
          segment(stat.rushYd, "RUSH"),
          segment(stat.rushTd, "RUSH TD"),
        ].filter((s): s is string => s != null),
      );
      return segments;
    }
    case "RB":
      return [
        segment(stat.rushAtt, "ATT"),
        segment(stat.rushYd, "YD"),
        segment(stat.rushTd, "TD"),
        segment(stat.rec, "REC"),
        segment(stat.recYd, "REC YD"),
      ].filter((s): s is string => s != null);
    case "WR":
    case "TE":
      return [
        segment(stat.recTgt, "TGT"),
        segment(stat.rec, "REC"),
        segment(stat.recYd, "YD"),
        segment(stat.recTd, "TD"),
      ].filter((s): s is string => s != null);
    case "K": {
      const segments: string[] = [];
      if ((stat.fgm != null && stat.fgm !== 0) || (stat.fga != null && stat.fga !== 0)) {
        segments.push(`${stat.fgm ?? 0}/${stat.fga ?? 0} FG`);
      }
      const xp = segment(stat.xpm, "XP");
      if (xp != null) segments.push(xp);
      return segments;
    }
    default:
      return [];
  }
}
