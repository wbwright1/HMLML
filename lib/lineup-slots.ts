// Pure helpers for aligning Sleeper `starters` arrays to lineup slot labels and
// for computing a player's projected fantasy points from league scoring
// settings. No I/O, no dependencies — safe to unit test directly.

// Roster-position labels that are NOT starting slots. Everything else in a
// season's roster_positions array is a startable lineup slot.
const NON_STARTING_SLOTS = new Set(["BN", "IR", "TAXI"]);

// Sleeper uses "0" as the player id for an empty starting slot.
const EMPTY_SLOT_PLAYER_ID = "0";

// Stat keys present in projection payloads that are aggregate fantasy-point
// totals rather than raw stats, so they must not be dot-producted against
// scoring settings.
const POINT_TOTAL_KEYS = new Set(["pts_ppr", "pts_half_ppr", "pts_std"]);

export interface StarterSlot {
  playerId: string;
  slot: string;
}

/**
 * Returns the ordered list of starting-slot labels for a season, i.e. the
 * roster_positions array with bench/IR/taxi entries removed. The i-th entry
 * lines up with the i-th entry of a matchup's `starters` array.
 */
export function deriveStartingSlots(
  rosterPositions: string[] | null | undefined
): string[] {
  return (rosterPositions ?? []).filter((p) => !NON_STARTING_SLOTS.has(p));
}

/**
 * Aligns a matchup's ordered `starters` array with the season's starting-slot
 * labels, returning one { playerId, slot } per filled starting slot.
 *
 * - Duplicate slots are preserved (RB1 and RB2 both yield slot "RB").
 * - Empty starting slots (player id "0") are skipped, but still consume their
 *   slot position so later starters stay aligned.
 * - If `starters` is longer than the derived starting slots (defensive against
 *   malformed data), the overflow entries fall back to slot "FLEX".
 */
export function alignStarterSlots(
  rosterPositions: string[] | null | undefined,
  starters: string[] | null | undefined
): StarterSlot[] {
  const startingSlots = deriveStartingSlots(rosterPositions);
  const result: StarterSlot[] = [];

  const starterIds = starters ?? [];
  for (let i = 0; i < starterIds.length; i++) {
    const playerId = starterIds[i];
    if (!playerId || playerId === EMPTY_SLOT_PLAYER_ID) continue;
    const slot = startingSlots[i] ?? "FLEX";
    result.push({ playerId, slot });
  }

  return result;
}

/**
 * Picks the fantasy-point total for a projection stat map that matches the
 * league's reception scoring: full PPR (rec >= 1) -> pts_ppr, half PPR
 * (rec ~ 0.5) -> pts_half_ppr, otherwise standard -> pts_std. Returns null if
 * the chosen total is absent.
 */
function fallbackPointTotal(
  scoringSettings: Record<string, number> | null | undefined,
  projStats: Record<string, number | null>
): number | null {
  const rec = scoringSettings?.rec ?? 0;
  let key: string;
  if (rec >= 1) key = "pts_ppr";
  else if (rec > 0) key = "pts_half_ppr";
  else key = "pts_std";

  const value = projStats[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return round2(value);
  }
  return null;
}

/**
 * Computes a player's projected fantasy points as the dot product of the
 * league's scoring_settings weights with the player's projection stat map.
 * Falls back to the appropriate pts_ppr/pts_half_ppr/pts_std total (chosen by
 * the league's `rec` value) when no scoring stat overlaps the projection.
 * Returns null when no projection is available at all.
 */
export function computeProjectedPoints(
  scoringSettings: Record<string, number> | null | undefined,
  projStats: Record<string, number | null> | null | undefined
): number | null {
  if (!projStats) return null;

  let total = 0;
  let matchedAny = false;

  if (scoringSettings) {
    for (const [statKey, weight] of Object.entries(scoringSettings)) {
      if (POINT_TOTAL_KEYS.has(statKey)) continue;
      const statValue = projStats[statKey];
      if (
        typeof statValue === "number" &&
        Number.isFinite(statValue) &&
        typeof weight === "number" &&
        Number.isFinite(weight)
      ) {
        total += weight * statValue;
        matchedAny = true;
      }
    }
  }

  if (matchedAny) {
    return round2(total);
  }

  return fallbackPointTotal(scoringSettings, projStats);
}

/** Round to two decimal places, avoiding binary-float display noise. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
