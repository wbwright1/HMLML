import type { BracketType } from "@/lib/playoff-bracket";

/**
 * Copy for the inverted consolation bracket, centralized so no component
 * hardcodes it. In the Toilet Bowl you advance by LOSING; the explainer runs
 * directly under the bracket header so a lower score next to "SANK" never
 * reads as a rendering bug.
 */
export const TOILET_BOWL_COPY = {
  heading: "Toilet Bowl",
  explainer:
    "In the Toilet Bowl, losing advances you. The team still standing at the end finished dead last.",
  championKicker: "Toilet Bowl Champion",
  championDek:
    "Six weeks of trying not to win, and somebody still managed it best.",
} as const;

/**
 * Badge text for the team that moved on out of a bracket match. "ADVANCES" up
 * top, "SANK" in the Toilet Bowl, because in an inverted bracket "advancing"
 * next to the lower score would read as a mistake.
 */
export function getBracketAdvancementLabel(type: BracketType): string {
  return type === "losers" ? "SANK" : "ADVANCES";
}

/** Badge text for the team knocked out of a bracket match. */
export function getBracketEliminationLabel(type: BracketType): string {
  return type === "losers" ? "ESCAPED" : "OUT";
}

export function getPlayoffLabel(result: string | null): string {
  switch (result) {
    case "champion": return "Champion";
    case "runner_up": return "Runner-Up";
    case "made_playoffs": return "Made Playoffs";
    case "consolation": return "Consolation";
    case "toilet_bowl": return "Toilet Bowl";
    default: return "";
  }
}

export type PlayoffBadgeVariant = "gold" | "silver" | "green" | "neutral" | "brown";

export function getPlayoffBadgeVariant(result: string | null): PlayoffBadgeVariant {
  switch (result) {
    case "champion": return "gold";
    case "runner_up": return "silver";
    case "made_playoffs": return "green";
    case "consolation": return "neutral";
    case "toilet_bowl": return "brown";
    default: return "neutral";
  }
}
