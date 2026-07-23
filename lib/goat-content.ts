// ===========================================================================
// GOAT Ladder editorial content
// ===========================================================================
// Centralized snark for the all-time GOAT Ladder, mirroring the SNARKY_LABELS
// pattern in lib/content.ts: blurbs live here, keyed by an ARCHETYPE derived
// from a franchise's ladder position and stat shape, never hardcoded to a
// specific team. goatArchetype() classifies a franchise deterministically; a
// stable per-franchise index then picks a variant so the ladder does not read
// like the same three sentences twelve times. Nothing here fabricates a stat:
// the numbers on the card come from the query layer; this is pure voice.

export type GoatArchetype =
  | "goat"
  | "dynasty"
  | "ringless_contender"
  | "lucky_ring"
  | "glass_cannon"
  | "upstart"
  | "mid"
  | "basement";

/** Inputs the classifier needs; all already computed by the GOAT query. */
export interface GoatArchetypeInput {
  rank: number;
  leagueSize: number;
  winPct: number; // 0..1 career
  championships: number;
  playoffRate: number; // 0..1
  recentForm: number; // 0..1
  seasonsPlayed: number;
  pointsRank: number; // 1 = most all-time points
}

/**
 * Deterministically classify a franchise into a roast archetype. Order matters:
 * the first matching rule wins, from most specific (the throne, the basement) to
 * the catch-all "mid".
 */
export function goatArchetype(e: GoatArchetypeInput): GoatArchetype {
  if (e.rank === 1) return "goat";
  if (e.rank === e.leagueSize) return "basement";
  // A ring plus a winning career reads as a dynasty; a ring without one is a
  // franchise coasting on a single good month. Every ring-holder lands in one
  // of these two, so a title never gets classified as "mid".
  if (e.championships >= 1 && e.winPct >= 0.52) return "dynasty";
  if (e.championships >= 1) return "lucky_ring";
  if (e.championships === 0 && e.winPct >= 0.55) return "ringless_contender";
  // High-scoring underachiever: piles up points, cannot cash them for wins.
  if (e.championships === 0 && e.pointsRank <= 4 && e.rank >= 7)
    return "glass_cannon";
  // Newer franchise punching above its short history.
  if (e.seasonsPlayed <= 4 && e.winPct >= 0.5) return "upstart";
  return "mid";
}

/** Short badge label per archetype, for the kicker above each franchise row. */
export const GOAT_ARCHETYPE_LABELS: Readonly<Record<GoatArchetype, string>> =
  Object.freeze({
    goat: "The GOAT",
    dynasty: "Dynasty",
    ringless_contender: "Ringless Contender",
    lucky_ring: "One-Ring Wonder",
    glass_cannon: "Glass Cannon",
    upstart: "Upstart",
    mid: "Perfectly Mid",
    basement: "League Doormat",
  });

// 2-3 variants per archetype. Copy is generic to the archetype; the card shows
// the real record/rings alongside, so no blurb needs to name a team or a number.
const GOAT_BLURBS: Readonly<Record<GoatArchetype, readonly string[]>> = Object.freeze({
  goat: [
    "The measuring stick. Everyone else is auditioning for second and they know it.",
    "Sits on the throne and rents out the other eleven chairs. Undisputed, for now.",
  ],
  dynasty: [
    "A ring and the record to back it up. This is the one nobody wants on the schedule.",
    "Wins in the regular season, wins when it counts. The blueprint, annoyingly.",
    "Hardware plus a winning career says the trophy was not a fluke. It was a warning.",
  ],
  ringless_contender: [
    "Great every September, invisible every January. The best team to never lift the thing.",
    "Piles up wins and playoff berths, still shopping for a first ring. Always the bridesmaid.",
    "A resume built for a title and a trophy case built for dust. Cruel game.",
  ],
  lucky_ring: [
    "Owns a ring and reminds the group chat every August. The career record says: enjoy the memory.",
    "One shining month, a lifetime of mediocrity around it. The banner still counts, technically.",
    "Caught fire once and has been coasting on it ever since. Hey, a ring is a ring.",
  ],
  glass_cannon: [
    "Scores like a champion, finishes like a rerun. All the points, none of the payoff.",
    "Leads the league in style points and loses the games that matter. A gorgeous 8-6.",
    "Puts up numbers to brag about and losses to explain. The definition of empty calories.",
  ],
  upstart: [
    "Fewer seasons, a better win rate than the veterans. The new money is playing to win.",
    "Showed up late and started taking lunch money immediately. Ask about the resume later.",
    "Short history, loud results. The rest of the ladder should be nervous.",
  ],
  mid: [
    "Perfectly, aggressively fine. Neither the story nor the punchline, which is its own tragedy.",
    "The definition of a coin-flip season, every season. Forgettable in the safest way.",
    "Always in the mix, never in the conversation. The league's beige.",
  ],
  basement: [
    "The floor of the league, and it has been comfortable down there for a while. League doormat.",
    "Somebody has to be twelfth. This franchise has made it a lifestyle.",
    "The get-well game on everyone's schedule. The receipts are long and unkind.",
  ],
});

/**
 * Pick a deterministic blurb for a franchise: classify, then choose a variant by
 * a stable hash of the franchise id so the same team always reads the same, and
 * two adjacent teams of the same archetype do not repeat verbatim.
 */
export function selectGoatBlurb(
  franchiseId: string,
  input: GoatArchetypeInput,
): { archetype: GoatArchetype; blurb: string } {
  const archetype = goatArchetype(input);
  const variants = GOAT_BLURBS[archetype];
  let hash = 0;
  for (let i = 0; i < franchiseId.length; i++) {
    hash = (hash * 31 + franchiseId.charCodeAt(i)) >>> 0;
  }
  const blurb = variants[hash % variants.length];
  return { archetype, blurb };
}
