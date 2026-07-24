import { AWARD_TYPES, type AwardType } from "@/lib/awards";

// Commissioner-entered league-award history (legacy-import precedent). Names are
// entered as plain, real player names; the importer resolves each to a Sleeper
// player_id + position via players.search_full_name, and resolves the winning
// franchise from the season's point-attribution data (see awards-import.ts).
// Franchises are intentionally NOT listed here: they are derived at seed time so
// the record stays true to who actually rostered the player that season.

export interface AwardSeed {
  seasonYear: number;
  awardType: AwardType;
  playerName: string;
  /** Optional one-line lore stored on league_awards.note. */
  note?: string;
}

export const LEAGUE_AWARDS_SEED: AwardSeed[] = [
  // 2021
  { seasonYear: 2021, awardType: AWARD_TYPES.REGULAR_SEASON_MVP, playerName: "Cooper Kupp" },
  { seasonYear: 2021, awardType: AWARD_TYPES.CHAMPIONSHIP_MVP, playerName: "Najee Harris" },
  { seasonYear: 2021, awardType: AWARD_TYPES.ROOKIE_OF_YEAR, playerName: "Ja'Marr Chase" },
  // 2022
  { seasonYear: 2022, awardType: AWARD_TYPES.REGULAR_SEASON_MVP, playerName: "Patrick Mahomes" },
  { seasonYear: 2022, awardType: AWARD_TYPES.CHAMPIONSHIP_MVP, playerName: "Tom Brady" },
  { seasonYear: 2022, awardType: AWARD_TYPES.ROOKIE_OF_YEAR, playerName: "Garrett Wilson" },
  // 2023
  { seasonYear: 2023, awardType: AWARD_TYPES.REGULAR_SEASON_MVP, playerName: "Christian McCaffrey" },
  { seasonYear: 2023, awardType: AWARD_TYPES.CHAMPIONSHIP_MVP, playerName: "Jerome Ford" },
  { seasonYear: 2023, awardType: AWARD_TYPES.ROOKIE_OF_YEAR, playerName: "Puka Nacua" },
  // 2024
  { seasonYear: 2024, awardType: AWARD_TYPES.REGULAR_SEASON_MVP, playerName: "Lamar Jackson" },
  { seasonYear: 2024, awardType: AWARD_TYPES.CHAMPIONSHIP_MVP, playerName: "Jared Goff" },
  { seasonYear: 2024, awardType: AWARD_TYPES.ROOKIE_OF_YEAR, playerName: "Jayden Daniels" },
  // 2025
  { seasonYear: 2025, awardType: AWARD_TYPES.REGULAR_SEASON_MVP, playerName: "Jaxon Smith-Njigba" },
  { seasonYear: 2025, awardType: AWARD_TYPES.CHAMPIONSHIP_MVP, playerName: "Chase Brown" },
  { seasonYear: 2025, awardType: AWARD_TYPES.ROOKIE_OF_YEAR, playerName: "Jaxson Dart" },
];

/** Fantasy-relevant positions used to disambiguate name collisions (e.g. two
 *  "Lamar Jackson" rows). */
export const FANTASY_POSITIONS = ["QB", "RB", "WR", "TE", "K"] as const;

/** Normalize a plain player name to the players.search_full_name format
 *  (lowercase, alpha only). Mirrors Sleeper's search_full_name construction. */
export function normalizePlayerName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}
