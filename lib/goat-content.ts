// ===========================================================================
// GOAT Ladder editorial content
// ===========================================================================
// Centralized snark for the all-time GOAT Ladder, mirroring the SNARKY_LABELS
// pattern in lib/content.ts: blurbs live here, keyed by an ARCHETYPE derived
// from a franchise's ladder position and stat shape, never hardcoded to a
// specific team. goatArchetype() classifies a franchise deterministically;
// assignGoatBlurbs() then walks the whole ladder in rank order and hands out
// the first unused blurb from that archetype's pool, so no two franchises on
// the same ladder ever read the same sentence. Nothing here fabricates a
// stat: the numbers on the card come from the query layer; this is pure voice.

import { phraseSetsOverlap, signaturePhrasesIn } from "@/lib/content-gen/phrases";

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

// Per-archetype variant pools. Copy is generic to the archetype; the card
// shows the real record/rings alongside, so no blurb needs to name a team or
// a number. Pool sizes are sized to the live league's archetype distribution
// (12 franchises: 1 goat, up to 2 dynasty/lucky_ring, several mid, etc.) with
// headroom; "mid" is the largest bucket so it gets the deepest pool, and a
// GOAT_GENERIC_OVERFLOW pool below catches any archetype that still runs out.
const GOAT_BLURBS: Readonly<Record<GoatArchetype, readonly string[]>> = Object.freeze({
  goat: [
    "The measuring stick. Everyone else is auditioning for second and they know it.",
    "Sits on the throne and rents out the other eleven chairs. Undisputed, for now.",
  ],
  dynasty: [
    "A ring and the record to back it up. This is the one nobody wants on the schedule.",
    "Wins in the regular season, wins when it counts. The blueprint, annoyingly.",
    "Hardware plus a winning career says the trophy was not a fluke. It was a warning.",
    "Built to win, not to entertain. The scoreboard has heard every excuse and stayed unmoved.",
  ],
  ringless_contender: [
    "Great every September, invisible every January. The best team to never lift the thing.",
    "Piles up wins and playoff berths, still shopping for a first ring. Always the bridesmaid.",
    "A resume built for a title and a trophy case built for dust. Cruel game.",
    "Contends every year, closes none of them. The league's most reliable heartbreak.",
  ],
  lucky_ring: [
    "Owns a ring and reminds the group chat every August. The career record says: enjoy the memory.",
    "One shining month, a lifetime of mediocrity around it. The banner still counts, technically.",
    "Caught fire once and has been coasting on it ever since. Hey, a ring is a ring.",
    "Peaked on schedule exactly once. The rest of the resume is doing its best to forget.",
  ],
  glass_cannon: [
    "Scores like a champion, finishes like a rerun. All the points, none of the payoff.",
    "Leads the league in style points and loses the games that matter. A gorgeous 8-6.",
    "Puts up numbers to brag about and losses to explain. The definition of empty calories.",
    "Fireworks on the scoreboard, ash in the standings. Great highlight reel, forgettable record.",
  ],
  upstart: [
    "Fewer seasons, a better win rate than the veterans. The new money is playing to win.",
    "Showed up late and started taking lunch money immediately. Ask about the resume later.",
    "Short history, loud results. The rest of the ladder should be nervous.",
    "New to the league, already ahead of it. The learning curve was somebody else's problem.",
  ],
  mid: [
    "Perfectly, aggressively fine. Neither the story nor the punchline, which is its own tragedy.",
    "The definition of a coin-flip season, every season. Forgettable in the safest way.",
    "Always in the mix, never in the conversation. The league's beige.",
    "Not good enough to fear, not bad enough to mock. The most polite kind of irrelevant.",
    "Splits the difference on every stat that matters. A franchise built entirely out of shrugs.",
    "Shows up, competes, disappears from the conversation by Tuesday. Reliable, in the dullest sense.",
  ],
  basement: [
    "The floor of the league, and it has been comfortable down there for a while. League doormat.",
    "Somebody has to be twelfth. This franchise has made it a lifestyle.",
  ],
});

// Catch-all pool for when an archetype's dedicated variants run out. Kept
// deliberately generic so it can follow any archetype without contradicting
// its label.
const GOAT_GENERIC_OVERFLOW: readonly string[] = [
  "The numbers are on the card. The verdict writes itself from there.",
  "Every ladder needs a name here. This is the one occupying it this season.",
  "Read the record, not the résumé. The record is the only thing that doesn't lie.",
  "Filed under: also participated. The stats do the rest of the talking.",
];

/**
 * Assign every franchise on the ladder a distinct blurb. Walks entries in
 * RANK ORDER (the caller must pass entries already sorted 1..N) and, for each
 * one, classifies its archetype and hands out the first unused variant from
 * that archetype's pool. "Unused" means more than not-yet-handed-out: a
 * candidate that leans on a signature phrase already spent on this ladder is
 * skipped too, since every blurb here renders on the same page and two lines
 * reaching for the same stock idiom read as one template (issue #274; see
 * lib/content-gen/phrases.ts). If a pool runs dry, falls through to the
 * used-set-guarded overflow pool rather than repeating a line. Rank order
 * (rather than franchise-id order) means ties for a shared archetype resolve
 * in ladder position, which is the only ordering a reader can see on the
 * page.
 */
export function assignGoatBlurbs<T extends GoatArchetypeInput>(
  entries: readonly T[],
): Array<T & { archetype: GoatArchetype; blurb: string }> {
  const used = new Set<string>();
  const overflowUsed = new Set<string>();
  const spentPhrases = new Set<string>();

  const phraseFree = (candidate: string): boolean =>
    !phraseSetsOverlap(signaturePhrasesIn(candidate), spentPhrases);
  const spend = (candidate: string): void => {
    for (const p of signaturePhrasesIn(candidate)) spentPhrases.add(p);
  };

  return entries.map((entry) => {
    const archetype = goatArchetype(entry);
    const pool = GOAT_BLURBS[archetype];

    // Phrase-distinct first; a merely-unused variant second. Never repeating a
    // line is the stronger guarantee of the two, so a phrase echo is accepted
    // before a verbatim repeat is.
    let blurb =
      pool.find((candidate) => !used.has(candidate) && phraseFree(candidate)) ??
      pool.find((candidate) => !used.has(candidate));
    if (blurb) {
      used.add(blurb);
      spend(blurb);
    } else {
      blurb =
        GOAT_GENERIC_OVERFLOW.find(
          (candidate) => !overflowUsed.has(candidate) && phraseFree(candidate),
        ) ?? GOAT_GENERIC_OVERFLOW.find((candidate) => !overflowUsed.has(candidate));
      if (blurb) {
        overflowUsed.add(blurb);
        spend(blurb);
      } else {
        // Pathological case (more franchises than every pool combined): fall
        // back to the archetype's first variant rather than throwing.
        blurb = pool[0];
      }
    }

    return { ...entry, archetype, blurb };
  });
}
