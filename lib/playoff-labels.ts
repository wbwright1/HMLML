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
