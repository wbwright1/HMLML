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

/**
 * The compact chip inside a bracket cell, where "ADVANCES" will not fit. "W"
 * up top; "SANK" in the Toilet Bowl, because a "W" beside the lower score
 * would read as a rendering bug.
 */
export function getBracketShortAdvancementLabel(type: BracketType): string {
  return type === "losers" ? "SANK" : "W";
}

/** The compact chip for the team knocked out, paired with the full label. */
export function getBracketShortEliminationLabel(type: BracketType): string {
  return type === "losers" ? "ESC" : "OUT";
}

/**
 * Copy for a bracket slot whose occupant is not known yet. In the Toilet Bowl
 * the team that arrives is the one that LOST, so "Winner of..." would be
 * exactly backwards.
 */
export function getFeederLabel(type: BracketType, matchNumber: number): string {
  const verb = type === "losers" ? "Sinker" : "Winner";
  return `${verb} of Match ${matchNumber}`;
}

/** Kicker above the mobile scroll track, pointing at what is off-screen. */
export function getBracketSwipeHint(type: BracketType): string {
  return type === "losers"
    ? "Swipe to follow the drain →"
    : "Swipe to follow the road →";
}

/** The label over the capsule column at the end of the bracket. */
export function getBracketOutcomeColumnLabel(
  type: BracketType,
  bowlName: string | null,
): string {
  if (type === "losers") return "Dead Last";
  return bowlName ?? "Champion";
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
