import { getNFLState } from "@/lib/sleeper";

export type NflSeasonType = "pre" | "regular" | "post" | "off";

export interface NflState {
  seasonType: NflSeasonType;
  week: number;
  season: string;
}

/**
 * Fetches the current NFL state from the Sleeper API.
 * Returns null if the API call fails or validation fails.
 */
export async function getNflState(): Promise<NflState | null> {
  try {
    const result = await getNFLState();

    if ("error" in result) {
      console.error("[nfl-state] Failed to fetch NFL state:", result.error.message);
      return null;
    }

    const { season_type, week, season } = result.data;

    // Normalize season_type to our known values
    const validTypes: NflSeasonType[] = ["pre", "regular", "post", "off"];
    const seasonType: NflSeasonType = validTypes.includes(season_type as NflSeasonType)
      ? (season_type as NflSeasonType)
      : "off";

    return {
      seasonType,
      week,
      season,
    };
  } catch {
    console.error("[nfl-state] Unexpected error fetching NFL state");
    return null;
  }
}
