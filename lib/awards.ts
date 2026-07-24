// Centralized metadata for league awards (commissioner-decided season honors).
// Award types are stable code constants; the DB stores the raw string in
// league_awards.award_type. Labels, short labels, and kickers live here so
// components never hardcode award copy.

export const AWARD_TYPES = {
  REGULAR_SEASON_MVP: "regular_season_mvp",
  CHAMPIONSHIP_MVP: "championship_mvp",
  ROOKIE_OF_YEAR: "rookie_of_year",
} as const;

export type AwardType = (typeof AWARD_TYPES)[keyof typeof AWARD_TYPES];

/** Canonical display order: MVP, then Championship MVP, then Rookie of the Year. */
export const AWARD_TYPE_ORDER: AwardType[] = [
  AWARD_TYPES.REGULAR_SEASON_MVP,
  AWARD_TYPES.CHAMPIONSHIP_MVP,
  AWARD_TYPES.ROOKIE_OF_YEAR,
];

export interface AwardMeta {
  type: AwardType;
  /** Full column/title label, e.g. "Regular Season MVP". */
  label: string;
  /** Compact badge label, e.g. "MVP" (used in chips like "MVP '25"). */
  shortLabel: string;
  /** Small uppercase eyebrow copy above a Trophy Case column. */
  kicker: string;
}

export const AWARD_METADATA: Record<AwardType, AwardMeta> = {
  [AWARD_TYPES.REGULAR_SEASON_MVP]: {
    type: AWARD_TYPES.REGULAR_SEASON_MVP,
    label: "Regular Season MVP",
    shortLabel: "MVP",
    kicker: "Most Valuable",
  },
  [AWARD_TYPES.CHAMPIONSHIP_MVP]: {
    type: AWARD_TYPES.CHAMPIONSHIP_MVP,
    label: "Championship MVP",
    shortLabel: "FMVP",
    kicker: "Finals MVP",
  },
  [AWARD_TYPES.ROOKIE_OF_YEAR]: {
    type: AWARD_TYPES.ROOKIE_OF_YEAR,
    label: "Rookie of the Year",
    shortLabel: "ROY",
    kicker: "Best Rookie",
  },
};

/** Type guard for a raw string from the DB. */
export function isAwardType(value: string): value is AwardType {
  return (AWARD_TYPE_ORDER as string[]).includes(value);
}

/** Metadata lookup that tolerates unknown strings (returns null). */
export function getAwardMeta(awardType: string): AwardMeta | null {
  return isAwardType(awardType) ? AWARD_METADATA[awardType] : null;
}

/** Two-digit season suffix, e.g. 2025 -> "25". */
export function seasonShort(seasonYear: number): string {
  return String(seasonYear).slice(-2).padStart(2, "0");
}

/**
 * Compact chip label for a player-level award badge, e.g. "MVP '25".
 * Falls back to an uppercased raw type when the award type is unknown.
 */
export function formatAwardChip(awardType: string, seasonYear: number): string {
  const meta = getAwardMeta(awardType);
  const short = meta ? meta.shortLabel : awardType.toUpperCase();
  return `${short} '${seasonShort(seasonYear)}`;
}
